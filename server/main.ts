/**
 * The server entrypoint.
 *
 * Read configuration, connect, bring the schema up to date if this deployment asked for that,
 * listen. A laptop wants "start the process and have a working database", which is TC-P01's
 * acceptance criterion; a deployment usually wants the opposite — migrations as a separate,
 * observable step rather than a race between however many instances booted at once — so
 * `TC_MIGRATE_ON_BOOT=false` turns it off and `/ready` reports the difference. Nothing here
 * seeds, resets or drops anything; `npm run db:seed` is a separate, explicit command.
 *
 * See `DEPLOYMENT.md` for the startup order this is the middle of.
 */
import { readConfig, ConfigError } from './config.ts';
import { createDatabase } from './db.ts';
import { migrate, pendingMigrations } from './migrate.ts';
import { createHttpServer, createMetrics } from './http.ts';
import { createPostgresRepositories } from './store.ts';
import { createAuthorizedRepositories } from './authorize.ts';
import { createRateLimiter } from './rateLimit.ts';
import { createHub, withServerEvents } from './broadcast.ts';
import { createLogger } from './log.ts';

const logger = createLogger();
const log = (message: string, fields: Record<string, string | number | boolean> = {}): void => {
  logger.event('info', message, fields);
};

let config;
try {
  config = readConfig();
} catch (error) {
  process.stderr.write(`${error instanceof ConfigError ? error.message : String(error)}\n`);
  process.exit(1);
}

const db = createDatabase(config.databaseUrl, {
  onPoolError: (error) =>
    logger.event('warn', 'database.pool_error', { message: String(error).slice(0, 200) }),
});

if (config.migrateOnBoot) {
  const { applied } = await migrate(db);
  log('schema.migrated', { applied: applied.length });
} else {
  // Said out loud rather than assumed: a process that will not migrate must make it obvious
  // that something else has to, or the first symptom is a column that does not exist.
  const pending = await pendingMigrations(db);
  log('schema.checked', { pending: pending.length, migrateOnBoot: false });
}

log('server.starting', {
  environment: config.environment,
  origin: config.crossOrigin ? 'cross' : 'same',
  // Named `sameSite`/`secure` rather than `cookie`: the redaction guard matches on field
  // names, and it redacted this line when it was called `cookie` — correctly, since it cannot
  // know a value is a policy rather than a credential. Erring that way is the right default.
  sameSite: config.cookieSameSite,
  secure: config.secureCookies,
  static: config.staticDir ? 'served' : 'external',
});

// A session cookie without `Secure` travels over plain http. That is correct on a laptop and
// is a decision somebody has to have made anywhere else, so it is said loudly rather than
// left to be discovered in a packet capture.
if (
  !config.secureCookies &&
  (config.environment === 'staging' || config.environment === 'production')
) {
  logger.event('warn', 'cookie.insecure', {
    environment: config.environment,
    detail: 'TC_COOKIE_SECURE=false — sessions will travel over plain http',
  });
}

// One hub per process. It holds the open streams and a short replay window, and it is
// deliberately not durable: the database is authoritative and a client that misses the window
// is told to re-read rather than handed a reconstruction.
//
// ponytail: per-process, like the rate limiter. Two instances would each broadcast only to
// their own subscribers; the fix is a shared bus — PostgreSQL LISTEN/NOTIFY is already in the
// box — and it is named in DEPLOYMENT.md as the thing to build before running a second
// instance, rather than built speculatively before there is one.
const hub = createHub();
const metrics = createMetrics();

const server = createHttpServer({
  db,
  hub,
  metrics,
  logger,
  staticDir: config.staticDir,
  cookie: { sameSite: config.cookieSameSite, secure: config.secureCookies },
  allowedOrigins: config.allowedOrigins,
  crossOrigin: config.crossOrigin,
  trustProxy: config.trustProxy,
  rateLimiter: createRateLimiter(),
  rateLimitScale: config.rateLimitScale,
  // Three wrappers, one per request, all cheap. The store answers as the signed-in account;
  // the authorization layer decides what that account may see and do; the event layer
  // announces what committed. Announcing outermost is what makes "never before the
  // transaction succeeded" structural rather than a thing to remember.
  repositoriesFor: (actor) =>
    withServerEvents(
      createAuthorizedRepositories(
        createPostgresRepositories(db, { currentUserId: actor?.userId ?? null }),
        actor,
      ),
      hub.publish,
    ),

  // Liveness: this process is running and can reach its database. A false here means restart
  // me — which is only the right answer for something a restart can fix.
  checkHealth: async () => {
    try {
      await db.query('select 1');
      return true;
    } catch {
      return false;
    }
  },

  // Readiness: and it can serve. A schema behind the code is the case that separates the two,
  // because restarting does not fix it and sending traffic makes it worse.
  checkReady: async () => {
    if (draining) return { ready: false, detail: 'shutting down' };
    try {
      const pending = await pendingMigrations(db);
      return pending.length === 0
        ? { ready: true, detail: 'schema up to date' }
        : { ready: false, detail: `${pending.length} migration(s) pending` };
    } catch {
      return { ready: false, detail: 'database unreachable' };
    }
  },
});

server.listen(config.port, config.host, () => {
  log('server.listening', { host: config.host, port: config.port });
});

/* ── Shutdown ───────────────────────────────────────────────────────────────── */

/**
 * Draining, in the order that loses the least.
 *
 * 1. `/ready` starts answering 503, so a load balancer stops sending new work *before*
 *    anything is torn down. This is the step that turns a deploy from "a few 502s" into none,
 *    and it is why readiness is a separate endpoint from health.
 * 2. The listener closes: no new connections, in-flight requests finish on live sockets.
 * 3. Idle keep-alive connections are closed, or the process waits on sockets nobody is using.
 * 4. Event streams are long-lived by design and would never end on their own, so after the
 *    grace period everything still open is closed and the clients reconnect — which is a
 *    thing they already do well, and TC-P08 proves it.
 * 5. The pool closes last, so nothing is holding a transaction when it does.
 *
 * A deadline, because a shutdown that waits forever is an instance an orchestrator has to
 * kill, and a killed instance is one that never finished step 5.
 */
let draining = false;

const shutdown = (signal: string): void => {
  if (draining) return;
  draining = true;
  log('server.draining', { signal, graceMs: config.shutdownGraceMs });

  const finish = async (reason: string): Promise<void> => {
    log('server.stopped', { reason });
    await db.close().catch(() => undefined);
    process.exit(0);
  };

  server.close(() => void finish('closed'));
  server.closeIdleConnections();

  const deadline = setTimeout(() => {
    server.closeAllConnections();
    void finish('deadline');
  }, config.shutdownGraceMs);
  deadline.unref();
};

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => shutdown(signal));
}

/**
 * The last boundary before the process dies with nothing written down.
 *
 * Not a place to recover: an unhandled rejection means some path did not consider a failure,
 * and continuing would be guessing about what state it left behind. What this buys is one
 * structured line naming the failure, so the thing that killed the container is in the same
 * log stream as everything else rather than only in a runtime's default stderr format.
 */
process.on('unhandledRejection', (reason) => {
  logger.event('error', 'process.unhandled_rejection', { message: String(reason).slice(0, 500) });
  shutdown('unhandledRejection');
});

process.on('uncaughtException', (error) => {
  logger.event('error', 'process.uncaught_exception', { message: error.message.slice(0, 500) });
  shutdown('uncaughtException');
});
