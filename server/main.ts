/**
 * The server entrypoint.
 *
 * Read configuration, connect, bring the schema up to date, listen. Migrations run on boot
 * because they are additive and recorded — a fresh environment should be able to start the
 * process and have a working database, which is TC-P01's acceptance criterion. Nothing here
 * seeds, resets or drops anything; `npm run db:seed` is a separate, explicit command.
 */
import { readConfig, ConfigError } from './config.ts';
import { createDatabase } from './db.ts';
import { migrate } from './migrate.ts';
import { createHttpServer } from './http.ts';
import { createPostgresRepositories } from './store.ts';
import { createAuthorizedRepositories } from './authorize.ts';
import { createRateLimiter } from './rateLimit.ts';

const log = (message: string): void => {
  process.stdout.write(`[table-companion] ${message}\n`);
};

let config;
try {
  config = readConfig();
} catch (error) {
  process.stderr.write(`${error instanceof ConfigError ? error.message : String(error)}\n`);
  process.exit(1);
}

const db = createDatabase(config.databaseUrl);

const { applied } = await migrate(db);
log(applied.length > 0 ? `Applied ${applied.length} migration(s).` : 'Schema is up to date.');

if (!config.isProduction) {
  log('Development mode: session cookies are not marked Secure, because the origin is http.');
}
log(
  config.crossOrigin
    ? `Cross-origin mode: CORS for ${config.allowedOrigins.join(', ')}, cookie SameSite=None.`
    : 'Same-origin mode: no CORS headers, cookie SameSite=Strict.',
);

const server = createHttpServer({
  db,
  cookie: { sameSite: config.cookieSameSite, secure: config.isProduction },
  allowedOrigins: config.allowedOrigins,
  crossOrigin: config.crossOrigin,
  trustProxy: config.trustProxy,
  rateLimiter: createRateLimiter(),
  // Two wrappers, one per request, and both cheap — neither opens a connection. The store
  // answers as the signed-in account; the authorization layer decides what that account may
  // see and do. A handler is only ever handed the outer one.
  repositoriesFor: (actor) =>
    createAuthorizedRepositories(
      createPostgresRepositories(db, { currentUserId: actor?.userId ?? null }),
      actor,
    ),
  checkHealth: async () => {
    try {
      await db.query('select 1');
      return true;
    } catch {
      return false;
    }
  },
});

server.listen(config.port, () => {
  log(`Listening on http://localhost:${config.port}`);
});

// Close the listener before the pool, so an in-flight request finishes on a live connection
// rather than failing on a closed one.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    log(`${signal} — shutting down.`);
    server.close(() => {
      void db.close().then(() => process.exit(0));
    });
  });
}
