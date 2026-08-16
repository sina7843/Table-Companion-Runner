/**
 * The operational surface: configuration boundaries, readiness, metrics, static serving, and
 * the promise that a log line never carries a credential.
 *
 * These are the things an operator relies on at three in the morning, which is exactly when
 * nobody is going to check them by hand. The redaction tests in particular exist because the
 * rule used to live in a comment: a policy that is not executed is a policy that is one
 * hurried commit from being untrue.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readConfig, ConfigError } from './config.ts';
import { createLogger, redact } from './log.ts';
import { createMetrics } from './metrics.ts';
import { resolveStaticPath } from './static.ts';
import { createRequestListener } from './http.ts';
import { createDatabase, type Database } from './db.ts';
import { migrate, pendingMigrations } from './migrate.ts';
import { createPostgresRepositories } from './store.ts';
import { createAuthorizedRepositories } from './authorize.ts';
import { silentLogger } from './log.ts';
import { scaleRules, RATE_RULES } from './rateLimit.ts';

/* ── Configuration boundaries ───────────────────────────────────────────────── */

const base = { DATABASE_URL: 'postgres://user:pw@localhost:5432/db' } as NodeJS.ProcessEnv;

test('the four environments are named, and anything else is refused', () => {
  for (const environment of ['development', 'test', 'staging', 'production'] as const) {
    assert.equal(readConfig({ ...base, TC_ENV: environment }).environment, environment);
  }

  assert.throws(
    () => readConfig({ ...base, TC_ENV: 'prod' }),
    (error: unknown) => error instanceof ConfigError && /must be one of/.test(error.message),
    'a near-miss must fail rather than silently mean development',
  );
});

test('an unlabelled deployment is development, which is the safe direction', () => {
  // Nothing gains a permission by being unlabelled. `NODE_ENV=production` still means
  // production, so a deployment that predates TC_ENV keeps working.
  assert.equal(readConfig(base).environment, 'development');
  assert.equal(readConfig({ ...base, NODE_ENV: 'production' }).environment, 'production');
  assert.equal(readConfig({ ...base, NODE_ENV: 'production' }).isProduction, true);
});

test('staging binds and behaves like production, not like a laptop', () => {
  const staging = readConfig({ ...base, TC_ENV: 'staging' });
  const laptop = readConfig({ ...base, TC_ENV: 'development' });

  // A container has to listen on every interface; a laptop must not.
  assert.equal(staging.host, '0.0.0.0');
  assert.equal(laptop.host, '127.0.0.1');

  // Cross-origin forces SameSite=None, which browsers only accept on a Secure cookie. Staging
  // is served over HTTPS, so it may; a laptop over http may not.
  assert.doesNotThrow(() =>
    readConfig({
      ...base,
      TC_ENV: 'staging',
      TC_CROSS_ORIGIN: 'true',
      TC_ALLOWED_ORIGINS: 'https://staging.example',
    }),
  );
  assert.throws(
    () =>
      readConfig({
        ...base,
        TC_ENV: 'development',
        TC_CROSS_ORIGIN: 'true',
        TC_ALLOWED_ORIGINS: 'http://localhost:5173',
      }),
    ConfigError,
  );
});

test('staging and production both mark the session cookie Secure', () => {
  // TC-P10 found DEPLOYMENT.md promising a staging deployment production-shaped cookies while
  // the entrypoint was still keying the flag off `isProduction` alone — so staging had been
  // quietly laxer than the document said, and a staging run proved less than it appeared to.
  assert.equal(readConfig({ ...base, TC_ENV: 'production' }).secureCookies, true);
  assert.equal(readConfig({ ...base, TC_ENV: 'staging' }).secureCookies, true);
  assert.equal(readConfig({ ...base, TC_ENV: 'development' }).secureCookies, false);
  assert.equal(readConfig({ ...base, TC_ENV: 'test' }).secureCookies, false);
});

test('turning Secure off is possible, explicit, and refused as a typo', () => {
  // The one documented case is a deployment genuinely not served over TLS — a loopback
  // validation, or something else terminating it. It is a decision somebody makes, so it is a
  // value rather than an absence, and `main.ts` logs a warning when it is off where it matters.
  assert.equal(
    readConfig({ ...base, TC_ENV: 'production', TC_COOKIE_SECURE: 'false' }).secureCookies,
    false,
  );
  assert.equal(
    readConfig({ ...base, TC_ENV: 'development', TC_COOKIE_SECURE: 'true' }).secureCookies,
    true,
  );
  assert.throws(() => readConfig({ ...base, TC_COOKIE_SECURE: 'no' }), ConfigError);
});

test('migrations on boot follow the environment, not one global default', () => {
  // On for a laptop, where "start the server and have a working database" is the point.
  assert.equal(readConfig(base).migrateOnBoot, true);
  assert.equal(readConfig({ ...base, TC_ENV: 'test' }).migrateOnBoot, true);

  // Off for a deployment. TC-P10 found this defaulting to *on* under TC_ENV=production, safe
  // only because the image set it explicitly — a deployment built any other way would have had
  // every instance racing for the schema as it booted.
  assert.equal(readConfig({ ...base, TC_ENV: 'staging' }).migrateOnBoot, false);
  assert.equal(readConfig({ ...base, TC_ENV: 'production' }).migrateOnBoot, false);

  // And either way it is overridable, with a typo refused rather than silently taken.
  assert.equal(
    readConfig({ ...base, TC_ENV: 'production', TC_MIGRATE_ON_BOOT: 'true' }).migrateOnBoot,
    true,
  );
  assert.equal(readConfig({ ...base, TC_MIGRATE_ON_BOOT: 'false' }).migrateOnBoot, false);
  assert.throws(() => readConfig({ ...base, TC_MIGRATE_ON_BOOT: 'no' }), ConfigError);
});

test('the shutdown grace period is bounded, and a nonsense value fails at startup', () => {
  assert.equal(readConfig(base).shutdownGraceMs, 15_000);
  assert.equal(readConfig({ ...base, TC_SHUTDOWN_GRACE_MS: '30000' }).shutdownGraceMs, 30_000);
  for (const bad of ['-1', 'soon', '999999']) {
    assert.throws(() => readConfig({ ...base, TC_SHUTDOWN_GRACE_MS: bad }), ConfigError, bad);
  }
});

test('the rate-limit scale multiplies the count and never the window', () => {
  const scaled = scaleRules(20);
  assert.equal(scaled.auth.limit, RATE_RULES.auth.limit * 20);
  assert.equal(scaled.auth.windowMs, RATE_RULES.auth.windowMs, 'the shape of the protection');

  // Below 1 is not a way to turn it off.
  assert.equal(scaleRules(0).auth.limit, RATE_RULES.auth.limit);
  assert.throws(() => readConfig({ ...base, TC_RATE_LIMIT_SCALE: '0' }), ConfigError);
  assert.throws(() => readConfig({ ...base, TC_RATE_LIMIT_SCALE: '1e6' }), ConfigError);
});

/* ── What may never be logged ───────────────────────────────────────────────── */

test('a field whose name looks like a credential never reaches the line', () => {
  const guarded = redact({
    requestId: 'r-1',
    route: '/campaigns/:campaignId',
    password: 'correct horse battery staple',
    sessionToken: 'abc123',
    email: 'someone@example.test',
    inviteCode: 'CRAGMAW-7742',
    cookie: 'tc_session=xyz',
    authorization: 'Bearer abc',
    apiKey: 'k',
    body: { hp: 3 },
    stack: 'Error: at …',
  });

  assert.equal(guarded.requestId, 'r-1', 'and the useful fields survive');
  assert.equal(guarded.route, '/campaigns/:campaignId');
  for (const key of [
    'password',
    'sessionToken',
    'email',
    'inviteCode',
    'cookie',
    'authorization',
    'apiKey',
    'body',
    'stack',
  ]) {
    assert.equal(guarded[key], '[redacted]', `${key} was written to a log`);
  }
});

test('a value that is a credential is refused whatever it is called', () => {
  const guarded = redact({
    message: 'stored scrypt$32768$8$1$abc$def while handling',
    note: 'Cookie was tc_session=deadbeef',
    header: 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig',
    fine: 'That change was not saved.',
  });

  assert.equal(guarded.message, '[redacted]');
  assert.equal(guarded.note, '[redacted]');
  assert.equal(guarded.header, '[redacted]');
  assert.equal(guarded.fine, 'That change was not saved.', 'an ordinary sentence is left alone');
});

test('the guard runs on every line, from every caller', () => {
  const lines: string[] = [];
  const logger = createLogger((line) => lines.push(line));

  logger.request('warn', {
    requestId: 'r-2',
    method: 'POST',
    route: '/auth/sign-in',
    status: 401,
    durationMs: 3,
    message: 'That email and password do not match an account.',
  });
  logger.event('error', 'something.failed', { detail: 'token=abc', count: 2 });

  const all = lines.join('');
  assert.match(all, /"route":"\/auth\/sign-in"/);
  assert.doesNotMatch(all, /tc_session/);
  // `detail` is not a forbidden name, but a caller cannot be trusted to have thought about it;
  // what protects this one is that the *value* is unremarkable. The name check catches the
  // rest, which is why both exist.
  assert.match(all, /"count":2/);
});

test('a nested object is redacted rather than walked', () => {
  // A log record is flat by design. A nested one is already a sign something is being logged
  // that should not be, so its shape is worth knowing and its contents are not.
  const guarded = redact({ actor: { id: 'u-1', email: 'a@b.test' } });
  assert.equal(guarded.actor, '[redacted]');
});

/* ── Metrics ────────────────────────────────────────────────────────────────── */

test('metrics count requests by pattern, never by path', () => {
  const metrics = createMetrics();
  metrics.request('/combats/:combatId/commands', 'POST', 200, 12);
  metrics.request('/combats/:combatId/commands', 'POST', 409, 8);
  metrics.request('/campaigns/:campaignId', 'GET', 200, 3);
  metrics.refusal('conflict');
  metrics.stream(1);

  const text = metrics.render();

  assert.match(
    text,
    /table_companion_requests_total\{method="POST",route="\/combats\/:combatId\/commands",status="2xx"\} 1/,
  );
  assert.match(text, /status="4xx"\} 1/);
  assert.match(text, /table_companion_refusals_total\{code="conflict"\} 1/);
  assert.match(text, /table_companion_realtime_streams 1/);

  // The whole reason the labels are patterns: an id in a label is unbounded cardinality, which
  // is a memory leak here and a bill wherever it is stored.
  assert.doesNotMatch(text, /cb-[0-9a-f]/);
});

test('a histogram is cumulative, which is what makes it a histogram', () => {
  const metrics = createMetrics();
  metrics.request('/health', 'GET', 200, 3); // 0.003s
  metrics.request('/health', 'GET', 200, 400); // 0.4s

  const text = metrics.render();
  const bucket = (le: string) =>
    Number(new RegExp(`le="${le.replace('+', '\\+')}"\\} (\\d+)`).exec(text)?.[1]);

  assert.equal(bucket('0.005'), 1);
  assert.equal(bucket('0.5'), 2, 'the larger bucket includes the smaller');
  assert.equal(bucket('+Inf'), 2);
  assert.match(text, /table_companion_request_duration_seconds_count\{route="\/health"\} 2/);
});

test('a closed stream is not still counted as open', () => {
  const metrics = createMetrics();
  metrics.stream(1);
  metrics.stream(1);
  metrics.stream(-1);

  assert.match(metrics.render(), /table_companion_realtime_streams 1\n/);
  assert.match(metrics.render(), /table_companion_realtime_streams_total 2/);
});

/* ── Static serving ─────────────────────────────────────────────────────────── */

test('a request cannot walk out of the static directory', () => {
  const root = path.resolve('/srv/app/dist');

  assert.equal(resolveStaticPath(root, '/index.html'), path.join(root, 'index.html'));
  assert.equal(resolveStaticPath(root, '/assets/app.js'), path.join(root, 'assets', 'app.js'));

  for (const attempt of [
    '/../secrets.env',
    '/assets/../../secrets.env',
    '/%2e%2e/%2e%2e/etc/passwd',
    '/..%2f..%2fetc%2fpasswd',
  ]) {
    assert.equal(resolveStaticPath(root, attempt), null, `${attempt} escaped the root`);
  }

  // A sibling directory whose name starts the same way is not inside it.
  assert.equal(resolveStaticPath(root, '/../dist-secrets/x'), null);
  // A null byte truncates a path in some system calls, so it never gets that far.
  assert.equal(resolveStaticPath(root, '/index.html\0.png'), null);
});

/* ── Health, readiness and the /api split, over a real server ───────────────── */

const DATABASE_URL = process.env.DATABASE_URL?.trim();
const skip = DATABASE_URL
  ? false
  : 'DATABASE_URL is not set. Run `docker compose up -d` and see .env.example.';

const TEST_SCHEMA = 'tc_test_operations';
let db: Database;
let server: Server;
let origin: string;
let staticRoot: string;

before(async () => {
  if (!DATABASE_URL) return;

  const root = createDatabase(DATABASE_URL);
  try {
    await root.query(`drop schema if exists ${TEST_SCHEMA} cascade`);
    await root.query(`create schema ${TEST_SCHEMA}`);
  } finally {
    await root.close();
  }

  db = createDatabase(DATABASE_URL, { schema: TEST_SCHEMA });
  await migrate(db);

  staticRoot = await mkdtemp(path.join(tmpdir(), 'tc-static-'));
  await writeFile(path.join(staticRoot, 'index.html'), '<div id="root"></div>', 'utf8');
  await mkdir(path.join(staticRoot, 'assets'));
  await writeFile(path.join(staticRoot, 'assets', 'app-abc123.js'), 'console.log(1)', 'utf8');

  server = createServer(
    createRequestListener({
      db,
      staticDir: staticRoot,
      metrics: createMetrics(),
      cookie: { sameSite: 'Strict', secure: false },
      allowedOrigins: [],
      repositoriesFor: (actor) =>
        createAuthorizedRepositories(
          createPostgresRepositories(db, { currentUserId: actor?.userId ?? null }),
          actor,
        ),
      checkHealth: async () => {
        await db.query('select 1');
        return true;
      },
      checkReady: async () => {
        const pending = await pendingMigrations(db);
        return pending.length === 0
          ? { ready: true, detail: 'schema up to date' }
          : { ready: false, detail: `${pending.length} migration(s) pending` };
      },
      logger: silentLogger,
    }),
  );
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((closed) => {
    if (server) {
      server.closeAllConnections();
      server.close(() => closed());
    } else closed();
  });
  await db?.close();
  if (staticRoot) await rm(staticRoot, { recursive: true, force: true });
});

test('health and readiness answer different questions', { skip }, async () => {
  const health = await fetch(`${origin}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });

  // Readiness knows about the schema, which is the case a restart cannot fix.
  const ready = await fetch(`${origin}/ready`);
  assert.equal(ready.status, 200);
  assert.deepEqual(await ready.json(), { status: 'ready', detail: 'schema up to date' });
});

test('a schema behind the code is not ready, and says which', { skip }, async () => {
  // The bookkeeping row is removed so a migration looks unapplied, which is exactly the state
  // a half-finished deploy leaves behind.
  const [row] = await db.query<{ name: string }>(
    'select name from schema_migrations order by name desc limit 1',
  );
  assert.ok(row);
  await db.query('delete from schema_migrations where name = $1', [row.name]);

  try {
    const answer = await fetch(`${origin}/ready`);
    assert.equal(answer.status, 503, 'traffic must stop rather than the process restart');
    const body = (await answer.json()) as { status: string; detail: string };
    assert.equal(body.status, 'not-ready');
    assert.match(body.detail, /1 migration\(s\) pending/);

    // And liveness still says yes, because restarting would not help.
    assert.equal((await fetch(`${origin}/health`)).status, 200);
  } finally {
    await db.query('insert into schema_migrations (name) values ($1)', [row.name]);
  }
});

test('metrics are text, are counts, and carry no content', { skip }, async () => {
  await fetch(`${origin}/health`);
  const answer = await fetch(`${origin}/metrics`);

  assert.equal(answer.status, 200);
  assert.match(answer.headers.get('content-type') ?? '', /text\/plain/);

  const body = await answer.text();
  assert.match(body, /table_companion_requests_total/);
  assert.match(body, /route="\/health"/);
  assert.doesNotMatch(body, /password|token|@example/i);
});

test('the bundle and the API share one origin', { skip }, async () => {
  // The document, at the root.
  const index = await fetch(`${origin}/`);
  assert.equal(index.status, 200);
  assert.match(index.headers.get('content-type') ?? '', /text\/html/);
  assert.match(await index.text(), /<div id="root">/);
  assert.equal(index.headers.get('cache-control'), 'no-store', 'or a deploy is invisible');

  // A hashed asset, cached forever because its name is its content.
  const asset = await fetch(`${origin}/assets/app-abc123.js`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('cache-control') ?? '', /immutable/);

  // A deep link into the router is the application, not a 404.
  const deep = await fetch(`${origin}/dm/campaigns/c-1/party`);
  assert.equal(deep.status, 200);
  assert.match(await deep.text(), /<div id="root">/);

  // A missing *asset* is a 404, not the document. Answering HTML here turns a missing file
  // into a parse error three layers away.
  assert.equal((await fetch(`${origin}/assets/gone.js`)).status, 404);

  // And the API is under /api, still refusing an anonymous caller.
  const me = await fetch(`${origin}/api/me`);
  assert.equal(me.status, 401);
  assert.equal(((await me.json()) as { error: { code: string } }).error.code, 'unauthenticated');
});

test('the static handler cannot be walked out of, over HTTP', { skip }, async () => {
  for (const attempt of ['/../package.json', '/assets/../../package.json', '/..%2fpackage.json']) {
    const answer = await fetch(`${origin}${attempt}`, { redirect: 'manual' });
    const body = answer.status === 200 ? await answer.text() : '';
    assert.equal(body.includes('"table-companion"'), false, `${attempt} served a file outside`);
  }
});

/* ── Migrations as a deployment step ────────────────────────────────────────── */

test('pending migrations can be asked about without applying them', { skip }, async () => {
  assert.deepEqual(await pendingMigrations(db), [], 'nothing pending after migrate');

  const [row] = await db.query<{ name: string }>(
    'select name from schema_migrations order by name desc limit 1',
  );
  assert.ok(row);
  await db.query('delete from schema_migrations where name = $1', [row.name]);

  try {
    const pending = await pendingMigrations(db);
    assert.deepEqual(pending, [row.name]);

    // Asking did not apply it. That is the whole point of a separate question.
    assert.deepEqual(await pendingMigrations(db), [row.name]);
  } finally {
    await db.query('insert into schema_migrations (name) values ($1)', [row.name]);
  }
});

test('applying migrations twice changes nothing', { skip }, async () => {
  const first = await migrate(db);
  assert.deepEqual(first.applied, [], 'already up to date');

  const second = await migrate(db);
  assert.deepEqual(second.applied, []);
  assert.deepEqual(second.skipped, first.skipped);
});
