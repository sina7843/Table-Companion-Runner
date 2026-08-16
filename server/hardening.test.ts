/**
 * The API boundary: what it accepts, what it refuses, and what it says either way.
 *
 * The cases the prompt names, and where each is:
 *
 * - success            → "a well-formed request works"
 * - validation failure  → the malformed / over-posted / wrong-type / unexpected-body group
 * - auth failure        → "a signed-out caller"
 * - not found           → "a path nobody serves" and "a record nobody has"
 * - conflict            → "a second account on one address" and "editing library content"
 * - retry               → "the same roll twice"
 *
 * Plus the things that are only observable from outside: the error body's shape, the request
 * id, the standing headers, the absence of CORS, and what a log line is allowed to contain.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createDatabase, type Database } from './db.ts';
import { migrate } from './migrate.ts';
import { seed, DEV_PASSWORD, devEmailFor } from './seed.ts';
import { createPostgresRepositories } from './store.ts';
import { createAuthorizedRepositories } from './authorize.ts';
import { createRequestListener, type HandlerOptions } from './http.ts';
import { createLogger, silentLogger } from './log.ts';
import { createRateLimiter, RATE_RULES, clientAddress, rateKey } from './rateLimit.ts';
import { API_ERROR_CODES } from '../src/domain/data/apiContract.ts';

const DATABASE_URL = process.env.DATABASE_URL?.trim();
const skip = DATABASE_URL
  ? false
  : 'DATABASE_URL is not set. Run `docker compose up -d` and see .env.example.';

const TEST_SCHEMA = 'tc_test_hardening';

let db: Database;
let servers: Server[] = [];
let base: string;
let signedIn: string;
let email: string;

interface Answer {
  status: number;
  body: unknown;
  headers: Headers;
}

interface ErrorShape {
  code: string;
  message: string;
  requestId?: string;
  details?: string;
}

const errorOf = (answer: Answer): ErrorShape => (answer.body as { error: ErrorShape }).error;

async function startServer(overrides: Partial<HandlerOptions> = {}): Promise<string> {
  const server = createServer(
    createRequestListener({
      db,
      cookie: { sameSite: 'Strict', secure: false },
      allowedOrigins: ['http://localhost:5173'],
      repositoriesFor: (actor) =>
        createAuthorizedRepositories(
          createPostgresRepositories(db, { currentUserId: actor?.userId ?? null }),
          actor,
        ),
      logger: silentLogger,
      rateLimiter: createRateLimiter(),
      ...overrides,
    }),
  );
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function call(
  method: string,
  path: string,
  options: {
    body?: unknown;
    raw?: string;
    cookie?: string;
    headers?: Record<string, string>;
    at?: string;
  } = {},
): Promise<Answer> {
  const carries = options.body !== undefined || options.raw !== undefined;
  const response = await fetch(`${options.at ?? base}${path}`, {
    method,
    headers: {
      'sec-fetch-site': 'same-origin',
      ...(carries ? { 'content-type': 'application/json' } : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...options.headers,
    },
    ...(options.raw !== undefined
      ? { body: options.raw }
      : options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? (JSON.parse(text) as unknown) : undefined,
    headers: response.headers,
  };
}

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
  await seed(db);

  base = await startServer();

  const [someone] = await db.query<{ id: string }>(
    'select id from users where password_hash is not null limit 1',
  );
  assert.ok(someone);
  email = devEmailFor(someone.id);

  const answer = await fetch(`${base}/auth/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
    body: JSON.stringify({ email, password: DEV_PASSWORD }),
  });
  signedIn = (answer.headers.getSetCookie()[0] ?? '').split(';')[0] ?? '';
  assert.ok(signedIn.startsWith('tc_session='));
});

after(async () => {
  await Promise.all(
    servers.map((server) => new Promise<void>((closed) => server.close(() => closed()))),
  );
  servers = [];
  await db?.close();
});

/* ── Success ────────────────────────────────────────────────────────────────── */

test('a well-formed request works, and says who answered it', { skip }, async () => {
  const answer = await call('GET', '/me', { cookie: signedIn });
  assert.equal(answer.status, 200);
  assert.ok((answer.body as { displayName: string }).displayName);

  // Every response, success or not, carries the id its log line carries.
  assert.match(answer.headers.get('X-Request-Id') ?? '', /\S/);
  assert.equal(answer.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(answer.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(answer.headers.get('Cache-Control'), 'no-store');
  // No CORS, because the deployment is same-origin and there is no cross-origin caller.
  assert.equal(answer.headers.get('Access-Control-Allow-Origin'), null);
});

test('a correlation id the caller supplied is echoed back, if it is boring', { skip }, async () => {
  const mine = await call('GET', '/me', {
    cookie: signedIn,
    headers: { 'x-request-id': 'trace-123' },
  });
  assert.equal(mine.headers.get('X-Request-Id'), 'trace-123');

  // Anything that could end up in a log line as something other than an id is replaced.
  const hostile = await call('GET', '/me', {
    cookie: signedIn,
    headers: { 'x-request-id': 'trace$with(punctuation)' },
  });
  assert.notEqual(hostile.headers.get('X-Request-Id'), 'trace$with(punctuation)');
  assert.match(hostile.headers.get('X-Request-Id') ?? '', /^[\w.:-]+$/);
});

/* ── Validation failure ─────────────────────────────────────────────────────── */

test('a malformed body is refused, and named', { skip }, async () => {
  const notJson = await call('POST', '/auth/sign-in', { raw: '{ this is not json' });
  assert.equal(notJson.status, 400);
  assert.equal(errorOf(notJson).code, 'validation_failed');

  const wrongType = await call('POST', '/auth/sign-in', { body: { email: 5, password: true } });
  assert.equal(wrongType.status, 400);
  assert.equal(errorOf(wrongType).code, 'validation_failed');
  assert.match(errorOf(wrongType).details ?? '', /email/);
});

test('an over-posted field is refused rather than ignored', { skip }, async () => {
  const answer = await call('POST', '/campaigns', {
    cookie: signedIn,
    body: {
      name: 'Over-posted',
      systemId: 'dnd5e-2024',
      dmUserId: 'u-marta',
      inviteCode: 'FORGED-0001',
    },
  });
  assert.equal(answer.status, 400);
  assert.equal(errorOf(answer).code, 'validation_failed');
  assert.match(errorOf(answer).details ?? '', /inviteCode/);

  // And nothing was written: a refused request does not half-happen.
  const [count] = await db.query<{ total: number }>(
    `select count(*)::int as total from campaigns where name = 'Over-posted'`,
  );
  assert.equal(count?.total, 0);
});

test('a body sent to a route that takes none is refused', { skip }, async () => {
  const answer = await call('DELETE', '/drafts/draft-nope', { cookie: signedIn });
  // DELETE carries no body at all, so this is the shape of the check: a POST that takes only
  // its path refuses a payload rather than accepting one it will never read.
  assert.equal(answer.status, 204);

  const withBody = await call('POST', '/encounters/e-nope/duplicate', {
    cookie: signedIn,
    body: { campaignId: 'c-elsewhere' },
  });
  assert.equal(withBody.status, 400);
  assert.equal(errorOf(withBody).code, 'validation_failed');
});

test('a validation message never quotes back what it rejected', { skip }, async () => {
  const secret = 'hunter2-hunter2-hunter2';
  const answer = await call('POST', '/auth/sign-up', {
    body: { email: 'not-an-email', password: secret, displayName: 'X', extra: secret },
  });
  assert.equal(answer.status, 400);
  const said = JSON.stringify(answer.body);
  assert.equal(said.includes(secret), false, 'the rejected value is not in the answer');
  assert.match(errorOf(answer).details ?? '', /extra/);
});

test('a payload over the size limit is refused by name', { skip }, async () => {
  const huge = JSON.stringify({ email: 'a@b.test', password: 'x'.repeat(2 * 1024 * 1024) });
  const answer = await call('POST', '/auth/sign-in', { raw: huge });
  assert.equal(answer.status, 413);
  assert.equal(errorOf(answer).code, 'payload_too_large');
});

/* ── Auth, not-found, conflict ──────────────────────────────────────────────── */

test('a signed-out caller is refused with a code, not a sentence to parse', { skip }, async () => {
  const answer = await call('GET', '/campaigns/c-lmop');
  assert.equal(answer.status, 401);
  assert.equal(errorOf(answer).code, 'unauthenticated');
});

test('a path nobody serves, and a record nobody has', { skip }, async () => {
  const noRoute = await call('GET', '/nothing/here');
  assert.equal(noRoute.status, 404);
  assert.equal(errorOf(noRoute).code, 'not_supported');

  // A record that does not exist reads as `null` with a 200, because the contract types it
  // `T | null` and "you may not have this" must be indistinguishable from "there is no such
  // thing". That is the direct-ID probing defence, and it is deliberate rather than sloppy.
  const noRecord = await call('GET', '/monsters/m-does-not-exist', { cookie: signedIn });
  assert.equal(noRecord.status, 200);
  assert.equal(noRecord.body, null);

  // Where the contract does not allow null, it is a 404 with a code.
  const noDraft = await call('POST', '/encounters/e-does-not-exist/duplicate', {
    cookie: signedIn,
    body: {},
  });
  assert.equal(noDraft.status, 404);
  assert.equal(errorOf(noDraft).code, 'not_found');
});

test('a conflict is a conflict, with the code that says so', { skip }, async () => {
  const taken = await call('POST', '/auth/sign-up', {
    body: { email, password: 'a-long-enough-password', displayName: 'Impostor' },
  });
  assert.equal(taken.status, 409);
  assert.equal(errorOf(taken).code, 'conflict');

  const [library] = await db.query<{ id: string }>(
    `select id from monsters where origin = 'library' limit 1`,
  );
  assert.ok(library);
  const stored = await call('GET', `/monsters/${library.id}`, { cookie: signedIn });
  const edited = await call('PUT', `/monsters/${library.id}`, {
    cookie: signedIn,
    body: { ...(stored.body as object), name: 'Rewritten' },
  });
  // Library content is not the caller's to edit — 403 from the authorization layer, because
  // it is not their record, rather than 409 from the store.
  assert.ok([403, 409].includes(edited.status));
  assert.ok(['forbidden', 'conflict'].includes(errorOf(edited).code));
});

test('every code an answer can carry is one the contract names', { skip }, async () => {
  const answers = await Promise.all([
    call('GET', '/campaigns/c-lmop'),
    call('GET', '/nothing/here'),
    call('POST', '/auth/sign-in', { body: { email: 5 } }),
    call('POST', '/auth/sign-up', {
      body: { email, password: 'a-long-password', displayName: 'X' },
    }),
  ]);
  for (const answer of answers) {
    const shape = errorOf(answer);
    assert.ok(API_ERROR_CODES.includes(shape.code as never), `unknown code ${shape.code}`);
    assert.match(shape.message, /\S/);
    assert.match(shape.requestId ?? '', /\S/);
  }
});

/* ── Retry ──────────────────────────────────────────────────────────────────── */

test('sending the same roll twice records it once; a colliding id does not', { skip }, async () => {
  const [combat] = await db.query<{ id: string }>('select id from combats limit 1');
  assert.ok(combat);

  const roll = {
    id: 'r-retry-1',
    combatId: combat.id,
    actor: 'Quill Featherwind',
    title: 'Rapier',
    expression: '1d20 +6',
    mode: 'normal',
    dice: [{ sides: 20, value: 17 }],
    modifier: 6,
    total: 23,
    outcome: 'normal',
    visibility: 'party',
    at: new Date().toISOString(),
  };

  const first = await call('POST', `/combats/${combat.id}/rolls`, { cookie: signedIn, body: roll });
  assert.equal(first.status, 200);

  // The same bytes again: a client that never saw the first answer. One roll, same id.
  const replay = await call('POST', `/combats/${combat.id}/rolls`, {
    cookie: signedIn,
    body: roll,
  });
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.body, first.body);

  // A *different* roll under the same id is a second device's counter colliding, not a
  // retry. It is kept, under an id the server chose.
  const collision = await call('POST', `/combats/${combat.id}/rolls`, {
    cookie: signedIn,
    body: { ...roll, actor: 'Bram Ironfoot', total: 11 },
  });
  assert.equal(collision.status, 200);
  assert.notEqual((collision.body as { id: string }).id, roll.id);

  const [count] = await db.query<{ total: number }>(
    `select count(*)::int as total from rolls where combat_id = $1 and title = 'Rapier'`,
    [combat.id],
  );
  assert.equal(count?.total, 2, 'one retry collapsed, one collision kept');
});

/* ── Rate limiting ──────────────────────────────────────────────────────────── */

test('the limiter counts a window and reopens it', () => {
  let now = 1_000_000;
  const limiter = createRateLimiter(() => now);
  const rule = { limit: 2, windowMs: 1000 };

  assert.equal(limiter.check('k', rule).allowed, true);
  assert.equal(limiter.check('k', rule).allowed, true);
  const refused = limiter.check('k', rule);
  assert.equal(refused.allowed, false);
  assert.ok(refused.retryAfterSeconds >= 1);
  // A different key has its own budget.
  assert.equal(limiter.check('other', rule).allowed, true);

  now += 1001;
  assert.equal(limiter.check('k', rule).allowed, true);
  limiter.sweep();
  assert.equal(limiter.size(), 1, 'expired windows are dropped, the live one is kept');
});

test('an authenticated caller is counted by account, an anonymous one by address', () => {
  assert.equal(rateKey('write', 'u-marta', '10.0.0.1'), 'write:u-marta');
  assert.equal(rateKey('auth', null, '10.0.0.1'), 'auth:ip:10.0.0.1');

  // `X-Forwarded-For` is attacker-controlled unless a proxy we trust rewrote it.
  assert.equal(clientAddress('10.0.0.1', '203.0.113.9', false), '10.0.0.1');
  assert.equal(clientAddress('10.0.0.1', '203.0.113.9, 10.0.0.2', true), '203.0.113.9');
  assert.equal(clientAddress(undefined, undefined, true), 'unknown');
});

test('sign-in is rate limited, and says when to come back', { skip }, async () => {
  // Its own server, so spending the auth budget here does not affect the tests above.
  const at = await startServer();
  const attempt = () =>
    call('POST', '/auth/sign-in', { at, body: { email, password: 'wrong-password' } });

  for (let n = 0; n < RATE_RULES.auth.limit; n += 1) {
    assert.equal((await attempt()).status, 401, `attempt ${n + 1} should be a plain refusal`);
  }

  const limited = await attempt();
  assert.equal(limited.status, 429);
  assert.equal(errorOf(limited).code, 'rate_limited');
  assert.match(limited.headers.get('Retry-After') ?? '', /^\d+$/);
});

/* ── Logs ───────────────────────────────────────────────────────────────────── */

test('a log line is structured, and carries nothing it should not', { skip }, async () => {
  const lines: string[] = [];
  const at = await startServer({ logger: createLogger((line) => lines.push(line)) });

  const secret = 'a-very-secret-password';
  await call('POST', '/auth/sign-in', { at, body: { email, password: secret } });
  await call('GET', '/campaigns/c-lmop?search=something-private', { at });

  assert.ok(lines.length >= 2);
  const written = lines.join('');
  assert.equal(written.includes(secret), false, 'no password');
  assert.equal(written.includes('tc_session'), false, 'no cookie or token');
  assert.equal(written.includes('something-private'), false, 'no query string');
  assert.equal(written.includes('c-lmop'), false, 'the pattern is logged, never the path');

  for (const line of lines) {
    const record = JSON.parse(line) as Record<string, unknown>;
    assert.equal(record.kind, 'request');
    assert.match(String(record.ts), /^\d{4}-/);
    assert.ok(typeof record.requestId === 'string' && record.requestId.length > 0);
    assert.ok(typeof record.status === 'number');
    assert.ok(typeof record.durationMs === 'number');
    assert.match(String(record.route), /^[/\w:-]+$/);
  }
});
