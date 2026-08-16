/**
 * The account route, over a real HTTP server.
 *
 * `PUT /me` is the first route in this product that changes something about a person rather
 * than about their game, so the questions are different from every other write: can it reach
 * an account other than the caller's, can it change a field it was not meant to, and does a
 * refusal leave the stored account exactly as it was.
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
import { createRequestListener } from './http.ts';
import { silentLogger } from './log.ts';

const DATABASE_URL = process.env.DATABASE_URL?.trim();
const skip = DATABASE_URL
  ? false
  : 'DATABASE_URL is not set. Run `docker compose up -d` and see .env.example.';

const TEST_SCHEMA = 'tc_test_account';

let db: Database;
let server: Server;
let base: string;
let me: { id: string; cookie: string };
let other: { id: string; cookie: string };

interface Answer {
  status: number;
  body: unknown;
}

async function call(
  method: string,
  path: string,
  options: { body?: unknown; cookie?: string } = {},
): Promise<Answer> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      'sec-fetch-site': 'same-origin',
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? (JSON.parse(text) as unknown) : undefined };
}

const said = (answer: Answer) =>
  (answer.body as { error: { code: string; message: string; details?: string } }).error;

async function signIn(userId: string): Promise<{ id: string; cookie: string }> {
  const response = await fetch(`${base}/auth/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
    body: JSON.stringify({ email: devEmailFor(userId), password: DEV_PASSWORD }),
  });
  assert.equal(response.status, 200, 'the seeded account signs in');
  await response.text();
  return { id: userId, cookie: response.headers.getSetCookie()[0]?.split(';')[0] ?? '' };
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

  server = createServer(
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
    }),
  );
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const accounts = await db.query<{ id: string }>(
    'select id from users where password_hash is not null order by id limit 2',
  );
  assert.equal(accounts.length, 2, 'the seed made at least two accounts');
  me = await signIn(accounts[0]!.id);
  other = await signIn(accounts[1]!.id);
});

after(async () => {
  await new Promise<void>((closed) => {
    if (server) server.close(() => closed());
    else closed();
  });
  await db?.close();
});

/* ── Changing your own name ─────────────────────────────────────────────────── */

test('an account can rename itself, and the change is what /me answers', { skip }, async () => {
  const answer = await call('PUT', '/me', {
    cookie: me.cookie,
    body: { displayName: 'Elandra Vex' },
  });

  assert.equal(answer.status, 200);
  assert.deepEqual(answer.body, { id: me.id, displayName: 'Elandra Vex' });

  const current = await call('GET', '/me', { cookie: me.cookie });
  assert.deepEqual(current.body, { id: me.id, displayName: 'Elandra Vex' });
});

test('a name is trimmed, and an empty one is refused', { skip }, async () => {
  const trimmed = await call('PUT', '/me', {
    cookie: me.cookie,
    body: { displayName: '   Elandra Vex   ' },
  });
  assert.equal((trimmed.body as { displayName: string }).displayName, 'Elandra Vex');

  const empty = await call('PUT', '/me', { cookie: me.cookie, body: { displayName: '   ' } });
  assert.equal(empty.status, 400);
  assert.equal(said(empty).code, 'validation_failed');

  // And the refusal left the stored account alone.
  const current = await call('GET', '/me', { cookie: me.cookie });
  assert.equal((current.body as { displayName: string }).displayName, 'Elandra Vex');
});

/* ── What it cannot reach ───────────────────────────────────────────────────── */

test('a signed-out caller cannot change anybody', { skip }, async () => {
  const answer = await call('PUT', '/me', { body: { displayName: 'Nobody At All' } });
  assert.equal(answer.status, 401);
  assert.equal(said(answer).code, 'unauthenticated');
});

test('one account cannot rename another', { skip }, async () => {
  const theirs = await call('GET', '/me', { cookie: other.cookie });
  const theirName = (theirs.body as { displayName: string }).displayName;

  // There is no id in the path or the body to aim elsewhere, so the attempt is an over-post —
  // and `strict` refuses it by name rather than accepting it and ignoring the extra field.
  const answer = await call('PUT', '/me', {
    cookie: me.cookie,
    body: { displayName: 'Hijacked', id: other.id, userId: other.id },
  });
  assert.equal(answer.status, 400);
  assert.equal(said(answer).code, 'validation_failed');
  // The message is generic on purpose; `details` names the field, never its value.
  assert.match(said(answer).details ?? '', /not a known field/);

  const still = await call('GET', '/me', { cookie: other.cookie });
  assert.equal((still.body as { displayName: string }).displayName, theirName);
});

test('the route refuses the fields it is not the flow for', { skip }, async () => {
  // An email change is a re-verification flow and a password change is a credential flow.
  // Neither is Phase 1, and neither may arrive here as an extra key on a profile update.
  for (const body of [
    { displayName: 'Fine', email: 'new@example.com' },
    { displayName: 'Fine', password: 'hunter2hunter2' },
    { displayName: 'Fine', passwordHash: 'scrypt$1$2$3$x$y' },
  ]) {
    const answer = await call('PUT', '/me', { cookie: me.cookie, body });
    assert.equal(answer.status, 400, `${Object.keys(body).join(',')} was accepted`);
    assert.equal(said(answer).code, 'validation_failed');
  }
});

test('a rename never returns a credential', { skip }, async () => {
  const answer = await call('PUT', '/me', {
    cookie: me.cookie,
    body: { displayName: 'Elandra Vex' },
  });
  const text = JSON.stringify(answer.body);
  for (const secret of ['password', 'scrypt', 'email', '@']) {
    assert.equal(text.includes(secret), false, `the response leaked ${secret}`);
  }
  assert.deepEqual(Object.keys(answer.body as object).toSorted(), ['displayName', 'id']);
});
