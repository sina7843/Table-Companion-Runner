/**
 * Account lifecycle at the seams: how the app finds out a session ended, what it is allowed to
 * do with where somebody was going, and what telemetry is permitted to carry.
 *
 * There is no DOM here, so what is checked is the logic underneath the screens plus the rules
 * they must satisfy, read from source. That is a weaker check than rendering them and it is
 * stated as such — it catches a rule being deleted, not a rule being mis-wired.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHttpRepositories } from './data/httpRepositories.ts';
import {
  onSessionExpired,
  reportSessionExpired,
  resetSessionExpiryListeners,
} from './data/sessionExpiry.ts';
import { ApiError } from './data/apiContract.ts';
import { noopSink, type TelemetryEvent } from './telemetry.ts';
import { createFixtureRepositories } from './data/fixtureRepositories.ts';
import { returnPath } from '../app/returnPath.ts';

const ROOT = import.meta.dirname;
const source = (path: string) => readFileSync(join(ROOT, '..', path), 'utf8');

/** A fetch that answers every call with one status and body. */
function answering(status: number, body: unknown) {
  return () =>
    Promise.resolve(
      new Response(body === undefined ? '' : JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
}

/* ── Finding out that a session ended ───────────────────────────────────────── */

test('a refused call announces the expiry once, to whoever is listening', () => {
  resetSessionExpiryListeners();
  let heard = 0;
  const stop = onSessionExpired(() => (heard += 1));

  reportSessionExpired();
  assert.equal(heard, 1);

  stop();
  reportSessionExpired();
  assert.equal(heard, 1, 'a detached listener hears nothing');
  resetSessionExpiryListeners();
});

test('a 401 on an ordinary call is reported as an expiry', async () => {
  resetSessionExpiryListeners();
  let heard = 0;
  const stop = onSessionExpired(() => (heard += 1));

  const repos = createHttpRepositories({
    baseUrl: '/api',
    fetch: answering(401, { error: { code: 'unauthenticated', message: 'Not signed in.' } }),
  });

  await assert.rejects(
    () => repos.users.current(),
    (error: unknown) => error instanceof ApiError && error.code === 'unauthenticated',
  );
  assert.equal(heard, 1, 'the app learns the same way the user would have');

  stop();
  resetSessionExpiryListeners();
});

test('a refused password is not an expired session', async () => {
  resetSessionExpiryListeners();
  let heard = 0;
  const stop = onSessionExpired(() => (heard += 1));

  const repos = createHttpRepositories({
    baseUrl: '/api',
    fetch: answering(401, {
      error: {
        code: 'unauthenticated',
        message: 'That email and password do not match an account.',
      },
    }),
  });

  await assert.rejects(() => repos.auth.signIn({ email: 'a@b.c', password: 'wrong' }));
  assert.equal(
    heard,
    0,
    'signing somebody out of a session they never had would replace a clear message with a confusing one',
  );

  stop();
  resetSessionExpiryListeners();
});

test('an expiry is what the sign-in screen distinguishes, not something it invents', () => {
  const provider = source('domain/data/SessionProvider.tsx');
  // `expired` only means anything alongside `signed-out`: an expiry that resolves — the
  // session was fine, one request was unlucky — must not leave a banner behind.
  assert.match(provider, /expired: expired && state\.status === 'signed-out'/);
  // And the identity is re-read rather than assumed gone.
  assert.match(provider, /setVersion\(\(n\) => n \+ 1\)/);

  const entry = source('screens/entry.tsx');
  assert.match(entry, /Your session ended/);
});

/* ── Where somebody was going ───────────────────────────────────────────────── */

test('the return path cannot be aimed off-site', () => {
  // An open redirect on the screen somebody lands on after signing in is the one place a bad
  // link is most likely to be followed without a second thought.
  assert.equal(returnPath({ from: '/dm/campaigns/c-1/party' }), '/dm/campaigns/c-1/party');
  assert.equal(returnPath({ from: 'https://example.com/steal' }), null);
  assert.equal(returnPath({ from: '//example.com/steal' }), null, 'a protocol-relative URL too');
  assert.equal(returnPath({ from: 42 }), null);
  assert.equal(returnPath(null), null);
});

test('a signed-out visitor is sent to the door with where they were', () => {
  const routes = source('app/routes.tsx');
  assert.match(routes, /state=\{\{ from: location\.pathname \+ location\.search \}\}/);
});

/* ── The invite states ──────────────────────────────────────────────────────── */

test('joining is offered a way forward from every state it can be in', () => {
  const entry = source('screens/entry.tsx');

  // Signed out: an invite adds an account to a campaign, so there must be an account. The
  // alternative is a form that answers "Not signed in." and offers nothing.
  assert.match(entry, /Sign in first/);
  assert.match(entry, /to="\/signup" state=\{\{ from: '\/join' \}\}/);

  // Refused: the server says one sentence for invalid, expired, revoked and spent, on
  // purpose — the screen must show what it was told rather than guess between them.
  assert.match(entry, /failure instanceof Error\s*\n?\s*\? failure\.message/);

  // Joined: named, and with somewhere to go.
  assert.match(entry, /Joined ' \+ joined\.name/);
  assert.match(entry, /Go to the table/);
});

test('joining twice is answered the same way as joining once', async () => {
  const repos = createFixtureRepositories();
  const campaign = (await repos.campaigns.listForUser((await repos.users.current()).id))[0];
  assert.ok(campaign, 'the fixture world has a campaign');

  // The server treats a second redemption as a second tap rather than an error, and the
  // screen shows the campaign either way. Nothing here can tell a stranger which of the two
  // happened, which is the property being protected.
  const first = await repos.campaigns.acceptInvite(campaign.inviteCode);
  const second = await repos.campaigns.acceptInvite(campaign.inviteCode);
  assert.equal(first.id, second.id);
  assert.equal(first.name, second.name);
});

/* ── Account data boundary ──────────────────────────────────────────────────── */

test('the account screen states the boundary the server actually enforces', () => {
  const account = source('screens/account.tsx');

  // Each of these is a claim about the implementation, not a marketing sentence.
  assert.match(account, /shown to nobody/, 'the email address');
  assert.match(account, /hash the server cannot read back/, 'the password');
  assert.match(account, /filtered out before a response leaves the server/, 'private notes');

  // And what is not in this release is named rather than left to be looked for.
  assert.match(account, /Changing your email address or your password is not in this release/);
});

test('the only account field a person may change is the one the contract carries', () => {
  const schemas = source('domain/data/contractSchemas.ts');
  const block = /export const updateSelfSchema = object\(\s*\{([^}]*)\}/.exec(schemas);
  assert.ok(block, 'updateSelfSchema exists');
  assert.equal(block[1]?.includes('displayName'), true);
  for (const forbidden of ['email', 'password', 'id', 'role']) {
    assert.equal(
      block[1]?.includes(forbidden),
      false,
      `${forbidden} must not be settable through the profile route`,
    );
  }
  // Strict, so an over-post is refused by name rather than silently dropped.
  assert.match(schemas, /updateSelfSchema[\s\S]{0,200}strict: true/);
});

test('a display name change goes through the session seam, not around it', async () => {
  const repos = createFixtureRepositories();
  const before = await repos.users.current();
  const after = await repos.users.updateSelf({ displayName: '  Elandra Vex  ' });

  assert.equal(after.id, before.id, 'it is the same account');
  assert.equal(after.displayName, 'Elandra Vex', 'and it is trimmed');
  assert.equal((await repos.users.current()).displayName, 'Elandra Vex');
});

/* ── Telemetry ──────────────────────────────────────────────────────────────── */

test('the default sink does nothing, and is a function anyway', () => {
  // Not null with a guard at every call site: a screen reporting an event must look the same
  // whether anything is listening or not.
  assert.equal(typeof noopSink, 'function');
  assert.equal(noopSink({ name: 'session_expired' }), undefined);
});

test('no telemetry event can carry an id, a name or anything somebody typed', () => {
  const telemetry = source('domain/telemetry.ts');
  const union = /export type TelemetryEvent =([\s\S]*?);\n/.exec(telemetry);
  assert.ok(union, 'the event union exists');

  // The rule the file states, enforced: an event names what happened, never who or what it
  // happened to. An open `track(name, props)` becomes invasive one careless call at a time.
  for (const forbidden of [
    'userId',
    'characterId',
    'combatId',
    'campaignId',
    'email',
    'name: string',
    'text',
    'value',
  ]) {
    assert.equal(
      union[1]?.includes(forbidden),
      false,
      `TelemetryEvent must not carry ${forbidden}`,
    );
  }

  // The one field any event has beyond its name is a closed set of document kinds.
  assert.match(union[1] ?? '', /kind: 'character-draft' \| 'encounter' \| 'monster' \| 'combat'/);
});

test('the shipped build supplies no telemetry provider', () => {
  const app = source('App.tsx');
  assert.match(app, /<TelemetryProvider value=\{noopSink\}>/);
  // No vendor, no endpoint, no key — the boundary exists so a deployment can supply one.
  assert.doesNotMatch(source('domain/telemetry.ts'), /fetch|http|sendBeacon|localStorage/);
});

test('every event the screens report is one the union declares', () => {
  const declared = new Set(
    [...source('domain/telemetry.ts').matchAll(/name: '([a-z_]+)'/g)].map((match) => match[1]),
  );
  assert.ok(declared.size >= 6);

  const files = [
    'screens/entry.tsx',
    'screens/combat/CombatScreen.tsx',
    'screens/player/PlayerCombat.tsx',
    'screens/builder/BuilderScreen.tsx',
    'screens/encounters/EncounterBuilder.tsx',
    'screens/monsters/MonsterEditor.tsx',
    'app/useConnection.ts',
    'domain/data/SessionProvider.tsx',
  ];
  for (const file of files) {
    for (const [, name] of source(file).matchAll(/telemetry\(\{ name: '([a-z_]+)'/g)) {
      assert.ok(declared.has(name), `${file} reports "${name}", which the union does not declare`);
    }
  }
});

test('a sink sees exactly what it was handed', () => {
  const seen: TelemetryEvent[] = [];
  const sink = (event: TelemetryEvent) => seen.push(event);
  sink({ name: 'save_failed', kind: 'encounter' });
  assert.deepEqual(seen, [{ name: 'save_failed', kind: 'encounter' }]);
});
