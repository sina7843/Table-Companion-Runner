/**
 * Sessions, cookies and CSRF, over a real HTTP server.
 *
 * `authorize.test.ts` asks what a signed-in account may reach. This file asks the question
 * before that one: who is signed in at all, how the browser is told, and what happens to a
 * request that cannot prove it came from this application.
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
import { ROUTES } from './routes.ts';
import { hashPassword, isSameSiteWrite, verifyPassword } from './auth.ts';
import { silentLogger } from './log.ts';

const DATABASE_URL = process.env.DATABASE_URL?.trim();
const skip = DATABASE_URL
  ? false
  : 'DATABASE_URL is not set. Run `docker compose up -d` and see .env.example.';

const TEST_SCHEMA = 'tc_test_auth';

let db: Database;
let server: Server;
let base: string;
/** An account that exists in the seeded world, with its development password. */
let seededEmail: string;

interface Answer {
  status: number;
  body: unknown;
  setCookie: string[];
}

/** Every request states its provenance the way a browser does, unless a test says otherwise. */
async function call(
  method: string,
  path: string,
  options: { body?: unknown; cookie?: string; headers?: Record<string, string> } = {},
): Promise<Answer> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      'sec-fetch-site': 'same-origin',
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...options.headers,
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? (JSON.parse(text) as unknown) : undefined,
    setCookie: response.headers.getSetCookie(),
  };
}

/** The code and message an answer carried, without the request id, which is never the same. */
const said = (answer: Answer) => {
  const { code, message } = (answer.body as { error: { code: string; message: string } }).error;
  return { code, message };
};

/** The `tc_session=…` pair from a Set-Cookie, ready to send back. */
const cookiePair = (setCookie: string[]): string => setCookie[0]?.split(';')[0] ?? '';

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

  const [someone] = await db.query<{ id: string }>(
    'select id from users where password_hash is not null limit 1',
  );
  assert.ok(someone, 'the seed gave the demo accounts a development password');
  seededEmail = devEmailFor(someone.id);

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
});

after(async () => {
  await new Promise<void>((closed) => {
    if (server) server.close(() => closed());
    else closed();
  });
  await db?.close();
});

/* ── Passwords ──────────────────────────────────────────────────────────────── */

test('a password verifies against its own hash and nothing else', { skip }, async () => {
  const stored = await hashPassword('correct horse battery staple');
  assert.match(stored, /^scrypt\$\d+\$\d+\$\d+\$[\w-]+\$[\w-]+$/);
  assert.equal(stored.includes('correct horse'), false, 'the password is not in its own hash');

  assert.equal(await verifyPassword('correct horse battery staple', stored), true);
  assert.equal(await verifyPassword('correct horse battery stapl', stored), false);
  assert.equal(await verifyPassword('', stored), false);
  assert.equal(await verifyPassword('correct horse battery staple', null), false);
  assert.equal(await verifyPassword('correct horse battery staple', 'not-a-hash'), false);

  // Two hashes of one password differ, because each carries its own salt.
  assert.notEqual(stored, await hashPassword('correct horse battery staple'));
});

/* ── Sign in, out, and what the browser is handed ───────────────────────────── */

test(
  'signing in sets an HttpOnly, SameSite=Strict cookie and returns no secret',
  { skip },
  async () => {
    const answer = await call('POST', '/auth/sign-in', {
      body: { email: seededEmail, password: DEV_PASSWORD },
    });

    assert.equal(answer.status, 200);
    const cookie = answer.setCookie[0];
    assert.ok(cookie, 'a session cookie was set');
    assert.match(cookie, /^tc_session=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /Path=\//);
    // Not marked Secure here because this test server is http; production sets it.
    assert.equal(/Secure/.test(cookie), false);

    // The body is a `User` and nothing more: no token, no hash, no email.
    const serialised = JSON.stringify(answer.body);
    assert.equal(serialised.includes(DEV_PASSWORD), false);
    assert.equal(serialised.includes('password'), false);
    assert.equal(serialised.includes('token'), false);
    assert.deepEqual(Object.keys(answer.body as object).toSorted(), ['displayName', 'id']);

    // And the cookie is what `GET /me` answers from.
    const me = await call('GET', '/me', { cookie: cookiePair(answer.setCookie) });
    assert.equal(me.status, 200);
    assert.deepEqual(me.body, answer.body);
  },
);

test('a wrong password and an unknown address are the same answer', { skip }, async () => {
  const wrongPassword = await call('POST', '/auth/sign-in', {
    body: { email: seededEmail, password: 'definitely not it' },
  });
  const unknownAccount = await call('POST', '/auth/sign-in', {
    body: { email: 'nobody@example.test', password: 'definitely not it' },
  });

  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownAccount.status, 401);
  // Everything but the request id, which is different for every request by construction.
  assert.deepEqual(said(wrongPassword), said(unknownAccount));
  assert.equal(said(wrongPassword).code, 'unauthenticated');
  assert.deepEqual(wrongPassword.setCookie, [], 'a failed sign-in mints nothing');
  assert.deepEqual(unknownAccount.setCookie, []);
});

test('signing up creates an account, signs it in, and refuses a second one', { skip }, async () => {
  const email = `new-${Date.now()}@example.test`;
  const created = await call('POST', '/auth/sign-up', {
    body: { email, password: 'a-long-enough-password', displayName: 'Newcomer' },
  });
  assert.equal(created.status, 200);
  assert.equal((created.body as { displayName: string }).displayName, 'Newcomer');

  const me = await call('GET', '/me', { cookie: cookiePair(created.setCookie) });
  assert.equal(me.status, 200);

  const again = await call('POST', '/auth/sign-up', {
    body: { email: email.toUpperCase(), password: 'another-long-password', displayName: 'Twin' },
  });
  assert.equal(again.status, 409, 'email uniqueness is case-insensitive');

  const short = await call('POST', '/auth/sign-up', {
    body: { email: `x-${Date.now()}@example.test`, password: 'short', displayName: 'Brief' },
  });
  assert.equal(short.status, 400);
  const notAnEmail = await call('POST', '/auth/sign-up', {
    body: { email: 'not-an-email', password: 'a-long-enough-password', displayName: 'Nope' },
  });
  assert.equal(notAnEmail.status, 400);
});

test('signing out revokes the session and clears the cookie', { skip }, async () => {
  const signedIn = await call('POST', '/auth/sign-in', {
    body: { email: seededEmail, password: DEV_PASSWORD },
  });
  const cookie = cookiePair(signedIn.setCookie);
  assert.equal((await call('GET', '/me', { cookie })).status, 200);

  const out = await call('POST', '/auth/sign-out', { cookie, body: {} });
  assert.equal(out.status, 204);
  assert.match(out.setCookie[0] ?? '', /^tc_session=;/);
  assert.match(out.setCookie[0] ?? '', /Expires=Thu, 01 Jan 1970/);

  // The token is gone from the server, so replaying the old cookie proves nothing.
  assert.equal((await call('GET', '/me', { cookie })).status, 401);

  // And signing out again still succeeds rather than answering 401 with a stale cookie left.
  assert.equal((await call('POST', '/auth/sign-out', { cookie, body: {} })).status, 204);
});

test('an expired session is not a session', { skip }, async () => {
  const signedIn = await call('POST', '/auth/sign-in', {
    body: { email: seededEmail, password: DEV_PASSWORD },
  });
  const cookie = cookiePair(signedIn.setCookie);
  assert.equal((await call('GET', '/me', { cookie })).status, 200);

  await db.query("update sessions set expires_at = now() - interval '1 second'");
  assert.equal((await call('GET', '/me', { cookie })).status, 401);
  // Expiry is decided in SQL, so nothing in this process could have been persuaded otherwise.
  await db.query('delete from sessions');
});

test('a made-up token is not a session', { skip }, async () => {
  const answer = await call('GET', '/me', { cookie: 'tc_session=this-is-not-a-real-token' });
  assert.equal(answer.status, 401);
});

/* ── Default closed ─────────────────────────────────────────────────────────── */

test(
  'every route that is not explicitly anonymous refuses an anonymous caller',
  { skip },
  async () => {
    const reached: string[] = [];

    for (const route of ROUTES) {
      if (route.anonymous) continue;
      const path = route.pattern.replaceAll(/:([^/]+)/g, 'SAMPLE');
      const carriesBody = route.method !== 'GET' && route.method !== 'DELETE';
      const answer = await call(route.method, path, carriesBody ? { body: {} } : {});
      if (answer.status !== 401)
        reached.push(`${route.method} ${route.pattern} → ${answer.status}`);
    }

    assert.deepEqual(reached, [], `routes reachable without a session:\n${reached.join('\n')}`);
  },
);

test(
  'the three anonymous routes are exactly the ones that mint or drop a session',
  { skip },
  () => {
    assert.deepEqual(
      ROUTES.filter((route) => route.anonymous)
        .map((route) => route.pattern)
        .toSorted(),
      ['/auth/sign-in', '/auth/sign-out', '/auth/sign-up'],
    );
  },
);

/* ── CSRF ───────────────────────────────────────────────────────────────────── */

test('a cross-site write is refused even with a valid session cookie', { skip }, async () => {
  const signedIn = await call('POST', '/auth/sign-in', {
    body: { email: seededEmail, password: DEV_PASSWORD },
  });
  const cookie = cookiePair(signedIn.setCookie);

  const crossSite = await call('POST', '/campaigns', {
    cookie,
    body: { name: 'Forged', systemId: 'dnd5e' },
    headers: { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' },
  });
  assert.equal(crossSite.status, 403);

  const sameSiteButOtherOrigin = await call('POST', '/campaigns', {
    cookie,
    body: { name: 'Forged', systemId: 'dnd5e' },
    headers: { 'sec-fetch-site': 'same-site' },
  });
  assert.equal(sameSiteButOtherOrigin.status, 403, 'same-site is not same-origin');

  // A read is not a write, so a cross-site GET is answered — the cookie is SameSite=Strict
  // and would never have been attached to one by a browser in the first place.
  assert.equal(
    (await call('GET', '/me', { cookie, headers: { 'sec-fetch-site': 'cross-site' } })).status,
    200,
  );
});

test('the same-site rule, on its own', { skip: false }, () => {
  const allowed = ['http://localhost:5173'];
  // A browser that states its provenance is believed, in both directions.
  assert.equal(isSameSiteWrite('POST', { secFetchSite: 'same-origin' }, []), true);
  assert.equal(isSameSiteWrite('POST', { secFetchSite: 'cross-site' }, allowed), false);
  assert.equal(isSameSiteWrite('POST', { secFetchSite: 'same-site' }, allowed), false);
  // Without the header, an explicit allowlist decides. There is no wildcard to get wrong.
  assert.equal(isSameSiteWrite('POST', { origin: 'http://localhost:5173' }, allowed), true);
  assert.equal(isSameSiteWrite('POST', { origin: 'https://evil.example' }, allowed), false);
  // A caller that states nothing cannot write.
  assert.equal(isSameSiteWrite('POST', {}, allowed), false);
  assert.equal(isSameSiteWrite('DELETE', {}, allowed), false);
  // Reads are never CSRF: they change nothing.
  assert.equal(isSameSiteWrite('GET', {}, []), true);
});
