/**
 * Adversarial coverage, over a real HTTP server, a real database and a real event stream.
 *
 * Every test here is written from the attacker's side and every one of them sends a
 * *well-formed* request with a *real* session. Nothing below relies on a screen not offering a
 * control, because the screen is not a boundary and the attacker is not using it.
 *
 * `authorize.test.ts` asks the same family of questions one layer down, against the store.
 * This file asks them over the wire, which is where an attacker actually is: a route that
 * forgot a check, a body field that reaches a column, a room a stranger can subscribe to.
 *
 * The seven shapes TC-P08 names, and where each is covered:
 *
 * - id tampering              — "reaching past" tests
 * - privilege escalation      — "claiming to be" tests
 * - malformed payloads        — "nonsense" tests
 * - replay / duplicate writes — "twice" tests
 * - stale combat commands     — "moved on" tests
 * - unauthorized subscription — "listening" tests
 * - concurrent writes         — "at once" tests
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
import { createHub, withServerEvents, type Hub } from './broadcast.ts';
import { importBundle } from './content/import.ts';
import type { CombatInstance, EncounterTemplate, Monster } from '../src/domain/types.ts';

const DATABASE_URL = process.env.DATABASE_URL?.trim();
const skip = DATABASE_URL
  ? false
  : 'DATABASE_URL is not set. Run `docker compose up -d` and see .env.example.';

const TEST_SCHEMA = 'tc_test_adversarial';

let db: Database;
let server: Server;
let base: string;
let hub: Hub;

/** The DM of the campaign under attack. */
let dm = { id: '', cookie: '' };
/** A player in that campaign. Signed in, and not entitled to the DM's actions. */
let player = { id: '', cookie: '' };
/** Signed in, and in none of it. The most interesting caller in this file. */
let outsider = { id: '', cookie: '' };

let campaignId = '';
let otherCampaignId = '';
let combat: CombatInstance;
let encounter: EncounterTemplate;
let libraryCreature: Monster;

let counter = 0;
const nextCommandId = () => `adv-${(counter += 1)}`;

interface Answer {
  status: number;
  body: unknown;
  headers: Headers;
}

async function call(
  method: string,
  path: string,
  options: { body?: unknown; cookie?: string; raw?: string } = {},
): Promise<Answer> {
  const carries = options.body !== undefined || options.raw !== undefined;
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      'sec-fetch-site': 'same-origin',
      ...(carries ? { 'content-type': 'application/json' } : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
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

const codeOf = (answer: Answer) =>
  (answer.body as { error?: { code?: string } } | null)?.error?.code;

async function signIn(userId: string): Promise<{ id: string; cookie: string }> {
  const response = await fetch(`${base}/auth/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
    body: JSON.stringify({ email: devEmailFor(userId), password: DEV_PASSWORD }),
  });
  assert.equal(response.status, 200, `the seeded account ${userId} signs in`);
  await response.text();
  return { id: userId, cookie: response.headers.getSetCookie()[0]?.split(';')[0] ?? '' };
}

/** Issues a combat command as somebody, without asserting anything about the answer. */
const command = (
  who: { cookie: string },
  body: Record<string, unknown>,
  target = combat.id as string,
) => call('POST', `/combats/${target}/commands`, { cookie: who.cookie, body });

/** The fight as the server currently holds it. */
async function currentCombat(): Promise<CombatInstance> {
  const answer = await call('GET', `/combats/${combat.id}`, { cookie: dm.cookie });
  return answer.body as CombatInstance;
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

  hub = createHub();
  server = createServer(
    createRequestListener({
      db,
      hub,
      cookie: { sameSite: 'Strict', secure: false },
      allowedOrigins: [],
      repositoriesFor: (actor) =>
        withServerEvents(
          createAuthorizedRepositories(
            createPostgresRepositories(db, { currentUserId: actor?.userId ?? null }),
            actor,
          ),
          hub.publish,
        ),
      logger: silentLogger,
    }),
  );
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  // Everything is discovered from the seeded world, so a fixture change cannot quietly turn
  // one of these into a tautology.
  const [row] = await db.query<{ id: string; dm_user_id: string }>(
    `select c.id, c.dm_user_id from campaigns c
      where exists (select 1 from characters ch
                     where ch.campaign_id = c.id and ch.owner_user_id <> c.dm_user_id)
      order by c.created_at limit 1`,
  );
  assert.ok(row, 'the seeded world has a campaign with a player character in it');
  campaignId = row.id;

  const [playerRow] = await db.query<{ user_id: string }>(
    `select user_id from campaign_members
      where campaign_id = $1 and role = 'player' limit 1`,
    [campaignId],
  );
  assert.ok(playerRow, 'and a player in it');

  const [otherRow] = await db.query<{ id: string }>(
    'select id from campaigns where id <> $1 limit 1',
    [campaignId],
  );
  assert.ok(otherRow, 'and a second campaign to reach across');
  otherCampaignId = otherRow.id;

  dm = await signIn(row.dm_user_id);
  player = await signIn(playerRow.user_id);

  // The outsider signs up rather than being found among the seeded accounts: every seeded
  // account is in the demo world, and an attacker who is a stranger to it is the case that
  // matters. This is also the ordinary path a real one would take.
  const signedUp = await call('POST', '/auth/sign-up', {
    body: {
      email: 'outsider@example.test',
      password: 'a-long-enough-password',
      displayName: 'Passing Stranger',
    },
  });
  assert.equal(signedUp.status, 200, 'an account can be created');
  outsider = {
    id: (signedUp.body as { id: string }).id,
    cookie: (signedUp.headers.getSetCookie()[0] ?? '').split(';')[0] ?? '',
  };

  const encounters = (
    await call('GET', `/campaigns/${campaignId}/encounters`, { cookie: dm.cookie })
  ).body as EncounterTemplate[];
  const usable = encounters.find((entry) => entry.entries.length > 0);
  assert.ok(usable, 'the seeded campaign has an encounter with something in it');
  encounter = usable;

  const started = await call('POST', `/encounters/${encounter.id}/start`, {
    cookie: dm.cookie,
    body: {},
  });
  assert.equal(started.status, 200, 'the DM can start a fight');
  combat = started.body as CombatInstance;

  const creatures = (await call('GET', '/monsters?origin=library&limit=1', { cookie: dm.cookie }))
    .body as Monster[];
  assert.ok(creatures[0], 'the library has a creature');
  libraryCreature = creatures[0];
});

after(async () => {
  await new Promise<void>((closed) => {
    if (server) {
      server.closeAllConnections();
      server.close(() => closed());
    } else closed();
  });
  await db?.close();
});

/* ── Reaching past your own id ──────────────────────────────────────────────── */

test('an outsider cannot command a fight by knowing its id', { skip }, async () => {
  const started = await currentCombat();

  const answer = await command(outsider, {
    commandId: nextCommandId(),
    expectedVersion: started.version ?? 0,
    command: { kind: 'turn.next' },
  });

  assert.ok(
    answer.status === 403 || answer.status === 404,
    `an outsider got ${answer.status} on somebody else's fight`,
  );
  assert.equal((await currentCombat()).version, started.version, 'and nothing moved');
});

test('an outsider cannot read a fight, an encounter or a campaign by id', { skip }, async () => {
  for (const path of [
    `/campaigns/${campaignId}`,
    `/combats/${combat.id}`,
    `/encounters/${encounter.id}`,
  ]) {
    const answer = await call('GET', path, { cookie: outsider.cookie });
    // A 200 carrying `null` is the contract's answer for "no such thing, or none for you" —
    // the two are deliberately indistinguishable, which is the direct-id probing defence.
    const denied = answer.status === 403 || answer.status === 404 || answer.body === null;
    assert.ok(denied, `${path} answered ${answer.status} with a body to an outsider`);
  }
});

test('an outsider cannot rewrite an encounter by id', { skip }, async () => {
  const answer = await call('PUT', `/encounters/${encounter.id}`, {
    cookie: outsider.cookie,
    body: { ...encounter, name: 'Taken over' },
  });
  assert.ok(answer.status >= 400, `an outsider rewrote an encounter (${answer.status})`);

  const still = (await call('GET', `/encounters/${encounter.id}`, { cookie: dm.cookie }))
    .body as EncounterTemplate;
  assert.equal(still.name, encounter.name, 'the encounter kept its name');
});

test('an encounter cannot be moved into a campaign the caller does not own', { skip }, async () => {
  const answer = await call('PUT', `/encounters/${encounter.id}`, {
    cookie: dm.cookie,
    body: { ...encounter, campaignId: otherCampaignId },
  });

  // Either refused outright, or accepted with the campaign it already had — never moved.
  const stored = (await call('GET', `/encounters/${encounter.id}`, { cookie: dm.cookie }))
    .body as EncounterTemplate;
  assert.notEqual(
    stored.campaignId,
    otherCampaignId,
    `an encounter was relocated into another campaign (${answer.status})`,
  );
});

test('a character cannot be attached to a campaign by a stranger', { skip }, async () => {
  const roster = (await call('GET', `/campaigns/${campaignId}/characters`, { cookie: dm.cookie }))
    .body as { id: string; ownerUserId: string; campaignId: string | null; name: string }[];
  const theirs = roster.find((entry) => entry.ownerUserId === player.id);
  assert.ok(theirs, 'the player owns a character');

  // Attaching is the one link a caller can make between a character and a campaign, so it is
  // the whole surface for this kind of tampering: pulling somebody else's character into your
  // campaign, and pushing your own into theirs.
  const stolen = await call('PUT', `/characters/${theirs.id}/campaign`, {
    cookie: outsider.cookie,
    body: { campaignId: otherCampaignId },
  });
  assert.ok(
    stolen.status >= 400,
    `an outsider moved another account's character (${stolen.status})`,
  );

  const stored = (await call('GET', `/characters/${theirs.id}`, { cookie: dm.cookie })).body as {
    ownerUserId: string;
    campaignId: string | null;
  };
  assert.equal(stored.ownerUserId, player.id, 'the character kept its owner');
  assert.equal(stored.campaignId, theirs.campaignId, 'and its campaign');
});

/* ── Claiming to be somebody you are not ────────────────────────────────────── */

test('creating a campaign cannot install somebody else as its DM', { skip }, async () => {
  const answer = await call('POST', '/campaigns', {
    cookie: player.cookie,
    body: { name: 'Escalation Test', systemId: 'dnd5e-2024', dmUserId: dm.id },
  });
  assert.equal(answer.status, 200);

  // The server assigns the signed-in account, whatever the body claimed. The alternative —
  // honouring it — is a campaign somebody else is now responsible for.
  const created = answer.body as { id: string; dmUserId: string };
  assert.equal(created.dmUserId, player.id, 'the caller became the DM, not the account they named');
});

test('a player cannot promote themselves inside a campaign', { skip }, async () => {
  // There is no role field on any request body, which is the design. What there is, is a
  // member row — and no route writes one except invite redemption, which always writes
  // 'player'. So the attack surface is the invite: redeeming one must never make a DM.
  const [campaign] = await db.query<{ invite_code: string }>(
    'select invite_code from campaigns where id = $1',
    [campaignId],
  );
  assert.ok(campaign);

  await call('POST', `/invites/${encodeURIComponent(campaign.invite_code)}/accept`, {
    cookie: outsider.cookie,
    body: {},
  });

  const [role] = await db.query<{ role: string }>(
    'select role from campaign_members where campaign_id = $1 and user_id = $2',
    [campaignId, outsider.id],
  );
  assert.equal(role?.role, 'player', 'redeeming an invite makes a player, never a DM');

  // And being a member is still not being the DM.
  const denied = await call('POST', `/encounters/${encounter.id}/start`, {
    cookie: outsider.cookie,
    body: {},
  });
  assert.equal(denied.status, 403);
  assert.equal(codeOf(denied), 'forbidden');

  await db.query('delete from campaign_members where campaign_id = $1 and user_id = $2', [
    campaignId,
    outsider.id,
  ]);
});

test('a player cannot issue the commands that are the DM’s', { skip }, async () => {
  const current = await currentCombat();
  const someoneElse = current.participants.find((entry) => entry.entityType !== 'player');
  assert.ok(someoneElse, 'the fight has a creature in it');

  for (const kind of [
    { kind: 'combat.end' },
    { kind: 'initiative.roll', onlyMissing: false },
    { kind: 'participant.visibility', participantIds: [someoneElse.id], visibility: 'public' },
    { kind: 'participant.remove', participantIds: [someoneElse.id] },
    { kind: 'health.override', participantId: someoneElse.id, current: 999 },
    { kind: 'turn.jump', participantId: someoneElse.id },
  ]) {
    const answer = await command(player, {
      commandId: nextCommandId(),
      expectedVersion: current.version ?? 0,
      command: kind,
    });
    assert.equal(answer.status, 403, `a player issued ${kind.kind}`);
    assert.equal(codeOf(answer), 'forbidden');
  }

  assert.equal((await currentCombat()).version, current.version, 'and none of them landed');
});

test('a player cannot act for another player’s combatant', { skip }, async () => {
  const current = await currentCombat();

  // Which participants this account may act for is a fact about the fight, so it is read
  // from it rather than assumed: a player's own character, and nobody else's.
  const roster = (await call('GET', `/campaigns/${campaignId}/characters`, { cookie: dm.cookie }))
    .body as { id: string; ownerUserId: string }[];
  const mineIds = new Set(
    roster.filter((entry) => entry.ownerUserId === player.id).map((entry) => entry.id),
  );

  const others = current.participants.filter(
    (entry) =>
      entry.entityType === 'player' &&
      entry.source.kind === 'character' &&
      !mineIds.has(entry.source.characterId),
  );
  assert.ok(others.length > 0, 'the fight has another player character in it');
  const notMine = others[0]!;

  // Damaging a *creature* is the whole player combat screen and is allowed on purpose.
  // Another player's character is the line, and so is their death save.
  for (const attempt of [
    { kind: 'health.damage', participantId: notMine.id, amount: 999 },
    { kind: 'health.heal', participantId: notMine.id, amount: 999 },
    { kind: 'condition.add', participantId: notMine.id, key: 'prone' },
    { kind: 'deathSave.roll', participantId: notMine.id },
  ]) {
    const answer = await command(player, {
      commandId: nextCommandId(),
      expectedVersion: current.version ?? 0,
      command: attempt,
    });
    assert.equal(answer.status, 403, `a player issued ${attempt.kind} against another character`);
  }

  const ended = await currentCombat();
  assert.equal(
    ended.participants.find((entry) => entry.id === notMine.id)?.health.current,
    current.participants.find((entry) => entry.id === notMine.id)?.health.current,
    'nobody lost hit points',
  );
  assert.equal(ended.version, current.version, 'and the fight did not move');
});

/* ── Nonsense ───────────────────────────────────────────────────────────────── */

test('a malformed command body is refused without touching the fight', { skip }, async () => {
  const current = await currentCombat();

  const bodies: unknown[] = [
    {
      commandId: nextCommandId(),
      expectedVersion: current.version,
      command: { kind: 'turn.moon' },
    },
    { commandId: nextCommandId(), expectedVersion: 'soon', command: { kind: 'turn.next' } },
    { commandId: nextCommandId(), expectedVersion: current.version },
    {
      commandId: nextCommandId(),
      expectedVersion: current.version,
      command: {
        kind: 'health.damage',
        participantId: current.participants[0]?.id,
        amount: 'lots',
      },
    },
    {
      commandId: nextCommandId(),
      expectedVersion: current.version,
      command: { kind: 'turn.next' },
      finalHp: 0,
    },
    [],
    'turn.next',
    null,
  ];

  for (const body of bodies) {
    const answer = await call('POST', `/combats/${combat.id}/commands`, {
      cookie: dm.cookie,
      body,
    });
    assert.equal(answer.status, 400, `${JSON.stringify(body)} was not refused`);
    assert.equal(codeOf(answer), 'validation_failed');
  }

  // Broken JSON is a different path through the same door.
  const broken = await call('POST', `/combats/${combat.id}/commands`, {
    cookie: dm.cookie,
    raw: '{"commandId": "x", "expectedVersion":',
  });
  assert.equal(broken.status, 400);

  assert.equal((await currentCombat()).version, current.version, 'and the fight is where it was');
});

test('a body that is not the shape the route takes never reaches a column', { skip }, async () => {
  const started = (await call('GET', `/monsters/${libraryCreature.id}`, { cookie: dm.cookie }))
    .body as Monster;

  // Every one of these is a well-formed request that means something wrong.
  const attempts: [string, string, unknown][] = [
    ['PUT', `/monsters/${libraryCreature.id}`, { ...libraryCreature, origin: 'library' }],
    ['PUT', `/monsters/${libraryCreature.id}`, { ...libraryCreature, ownerUserId: outsider.id }],
    ['POST', '/monsters', { ...libraryCreature, id: libraryCreature.id, origin: 'library' }],
  ];

  for (const [method, path, body] of attempts) {
    const answer = await call(method, path, { cookie: dm.cookie, body });
    assert.ok(
      answer.status < 500,
      `${method} ${path} answered ${answer.status} — a well-formed request never gets a 500`,
    );
    if (answer.status === 200) {
      const written = answer.body as Monster;
      assert.equal(written.origin, 'homebrew', 'a write that claims to be library content is not');
      assert.notEqual(written.id, libraryCreature.id, 'and it did not overwrite the original');
    }
  }

  // Reusing an existing id on a create is a conflict with a code, not a database error with
  // a constraint name in it. TC-P08 found this answering 500.
  const collision = await call('POST', '/monsters', {
    cookie: dm.cookie,
    body: { ...libraryCreature, origin: 'homebrew', ownerUserId: dm.id },
  });
  assert.equal(collision.status, 409);
  assert.equal(codeOf(collision), 'conflict');

  const still = (await call('GET', `/monsters/${libraryCreature.id}`, { cookie: dm.cookie }))
    .body as Monster;
  assert.deepEqual(still, started, 'the library creature is byte-identical afterwards');
});

/* ── Twice ──────────────────────────────────────────────────────────────────── */

test('a replayed command is recognised over the wire, not applied again', { skip }, async () => {
  const current = await currentCombat();
  const target = current.participants[0];
  assert.ok(target);

  const body = {
    commandId: nextCommandId(),
    expectedVersion: current.version ?? 0,
    command: { kind: 'health.damage', participantId: target.id, amount: 3 },
  };

  const first = await call('POST', `/combats/${combat.id}/commands`, { cookie: dm.cookie, body });
  assert.equal(first.status, 200);
  const afterFirst = (first.body as { combat: CombatInstance }).combat;

  // The same request again — a retry after a dropped response, or an attacker replaying it.
  const second = await call('POST', `/combats/${combat.id}/commands`, { cookie: dm.cookie, body });
  assert.equal(second.status, 200);
  const replay = second.body as { replayed: boolean; combat: CombatInstance };
  assert.equal(replay.replayed, true, 'the server says it recognised the retry');
  assert.equal(replay.combat.version, afterFirst.version, 'and nothing moved a second time');

  const hp = replay.combat.participants.find((entry) => entry.id === target.id)?.health.current;
  assert.equal(
    hp,
    afterFirst.participants.find((entry) => entry.id === target.id)?.health.current,
    'the damage was applied once',
  );
});

test(
  'one command id cannot be reused by a different caller for a different act',
  { skip },
  async () => {
    const current = await currentCombat();
    const target = current.participants[0];
    assert.ok(target);

    const commandId = nextCommandId();
    const first = await call('POST', `/combats/${combat.id}/commands`, {
      cookie: dm.cookie,
      body: {
        commandId,
        expectedVersion: current.version ?? 0,
        command: { kind: 'health.damage', participantId: target.id, amount: 2 },
      },
    });
    assert.equal(first.status, 200);
    const afterFirst = (first.body as { combat: CombatInstance }).combat;

    // Same id, different intent. Whatever the server does it must not run the second one —
    // an id is a claim of "this is the same act", and honouring it for a different act would
    // make the whole retry mechanism a replay tool.
    const second = await call('POST', `/combats/${combat.id}/commands`, {
      cookie: dm.cookie,
      body: {
        commandId,
        expectedVersion: afterFirst.version ?? 0,
        command: { kind: 'health.damage', participantId: target.id, amount: 40 },
      },
    });

    const now = await currentCombat();
    const hp = now.participants.find((entry) => entry.id === target.id)?.health.current;
    assert.equal(
      hp,
      afterFirst.participants.find((entry) => entry.id === target.id)?.health.current,
      `a reused command id applied a different change (${second.status})`,
    );
  },
);

/* ── Moved on ───────────────────────────────────────────────────────────────── */

test('a stale command is refused with the code that says to re-read', { skip }, async () => {
  const current = await currentCombat();
  const staleVersion = (current.version ?? 0) - 1;

  const answer = await command(dm, {
    commandId: nextCommandId(),
    expectedVersion: staleVersion,
    command: { kind: 'turn.next' },
  });

  assert.equal(answer.status, 409);
  assert.equal(codeOf(answer), 'conflict');
  assert.equal((await currentCombat()).version, current.version, 'and the fight did not move');
});

test('a version from the future is refused too, not treated as ahead', { skip }, async () => {
  const current = await currentCombat();

  const answer = await command(dm, {
    commandId: nextCommandId(),
    expectedVersion: (current.version ?? 0) + 50,
    command: { kind: 'turn.next' },
  });

  assert.equal(answer.status, 409, 'a version nobody has ever held is still a conflict');
  assert.equal((await currentCombat()).version, current.version);
});

/* ── Listening ──────────────────────────────────────────────────────────────── */

/** Opens the stream and reports what the server said, without reading it. */
async function subscribe(cookie: string, query = ''): Promise<{ status: number; body: string }> {
  const controller = new AbortController();
  try {
    const response = await fetch(`${base}/events${query}`, {
      headers: { cookie, 'sec-fetch-site': 'same-origin' },
      signal: controller.signal,
    });
    if (!response.ok) return { status: response.status, body: await response.text() };
    controller.abort();
    return { status: response.status, body: '' };
  } catch {
    return { status: 0, body: '' };
  } finally {
    controller.abort();
  }
}

test('a stranger cannot subscribe to a campaign’s room', { skip }, async () => {
  const answer = await subscribe(outsider.cookie, `?campaignId=${campaignId}`);
  assert.equal(answer.status, 403, 'asking for a room you are not in is refused');
  assert.match(answer.body, /not in that campaign/i);
});

test('a nonexistent room is refused rather than opened empty', { skip }, async () => {
  // An empty room would tell a prober that the id was at least well-formed. It is the same
  // refusal, which is what keeps the two indistinguishable.
  const answer = await subscribe(dm.cookie, '?campaignId=c-does-not-exist');
  assert.equal(answer.status, 403);
});

test('nobody at all cannot subscribe', { skip }, async () => {
  const answer = await subscribe('');
  assert.equal(answer.status, 401);
});

test('a member subscribes, and gets the room rather than everything', { skip }, async () => {
  const mine = await subscribe(player.cookie, `?campaignId=${campaignId}`);
  assert.equal(mine.status, 200, 'a player in the campaign is let in');

  const theirs = await subscribe(player.cookie, `?campaignId=${otherCampaignId}`);
  assert.equal(theirs.status, 403, 'and only into that one');
});

/* ── At once ────────────────────────────────────────────────────────────────── */

test('two damage commands at once both land, in some order, exactly once', { skip }, async () => {
  const current = await currentCombat();
  const target = current.participants.find((entry) => entry.health.current > 12);
  assert.ok(target, 'somebody in the fight has hit points to lose');
  const startingHp = target.health.current;

  const [a, b] = await Promise.all([
    command(dm, {
      commandId: nextCommandId(),
      expectedVersion: current.version ?? 0,
      command: { kind: 'health.damage', participantId: target.id, amount: 4 },
    }),
    command(dm, {
      commandId: nextCommandId(),
      expectedVersion: current.version ?? 0,
      command: { kind: 'health.damage', participantId: target.id, amount: 5 },
    }),
  ]);

  // One wins the version; the other is told to re-read. Never both applied against the same
  // version, and never one silently dropped.
  const statuses = [a.status, b.status].toSorted();
  assert.deepEqual(statuses, [200, 409], `got ${statuses.join(' and ')}`);

  const applied = (a.status === 200 ? a : b).body as { combat: CombatInstance };
  const hp = applied.combat.participants.find((entry) => entry.id === target.id)?.health.current;
  assert.ok(hp === startingHp - 4 || hp === startingHp - 5, `hit points ended at ${String(hp)}`);

  // And the loser succeeds once it has re-read, which is the whole point of refusing it.
  const fresh = await currentCombat();
  const retry = await command(dm, {
    commandId: nextCommandId(),
    expectedVersion: fresh.version ?? 0,
    command: { kind: 'health.damage', participantId: target.id, amount: 5 },
  });
  assert.equal(retry.status, 200);
});

test('a draft written from two tabs at once ends as one draft, not two', { skip }, async () => {
  const created = await call('POST', '/drafts', {
    cookie: player.cookie,
    body: { systemId: 'dnd5e-2024', ownerUserId: player.id, campaignId },
  });
  assert.equal(created.status, 200);
  const draft = created.body as { id: string; name: string; stepId: string; choices: unknown };

  // Autosave is an upsert, so concurrent writes are last-one-wins by design — what must not
  // happen is a second row, or a failure that loses the edit.
  const writes = await Promise.all(
    ['Ilse', 'Ilsegarde', 'Ilse Vantar'].map((name) =>
      call('PUT', `/drafts/${draft.id}`, {
        cookie: player.cookie,
        body: { ...draft, name },
      }),
    ),
  );
  for (const write of writes) assert.equal(write.status, 200, 'every concurrent save was accepted');

  const [rows] = await db.query<{ total: number }>(
    'select count(*)::int as total from character_drafts where id = $1',
    [draft.id],
  );
  assert.equal(rows?.total, 1, 'one draft, not three');

  const stored = (await call('GET', `/drafts/${draft.id}`, { cookie: player.cookie })).body as {
    name: string;
  };
  assert.ok(
    ['Ilse', 'Ilsegarde', 'Ilse Vantar'].includes(stored.name),
    `the stored name is one of the three that were sent, not "${stored.name}"`,
  );
});

test('a draft cannot be finalised twice into two characters', { skip }, async () => {
  const created = await call('POST', '/drafts', {
    cookie: player.cookie,
    body: { systemId: 'dnd5e-2024', ownerUserId: player.id, campaignId },
  });
  const draft = created.body as { id: string };

  // Built from a character that already validates, so this test is about the double write
  // rather than about guessing the schema.
  const roster = (await call('GET', `/campaigns/${campaignId}/characters`, { cookie: dm.cookie }))
    .body as Record<string, unknown>[];
  const template = roster.find((entry) => entry.ownerUserId === player.id);
  assert.ok(template, 'the player has a character to model this on');

  const character = {
    ...template,
    id: `ch-adv-${(counter += 1)}`,
    name: 'Twice Over',
  };

  const both = await Promise.all([
    call('POST', `/drafts/${draft.id}/finalise`, { cookie: player.cookie, body: character }),
    call('POST', `/drafts/${draft.id}/finalise`, { cookie: player.cookie, body: character }),
  ]);
  assert.ok(
    both.some((answer) => answer.status === 200),
    'one of them created the character',
  );

  const [rows] = await db.query<{ total: number }>(
    'select count(*)::int as total from characters where name = $1',
    ['Twice Over'],
  );
  assert.equal(rows?.total, 1, 'a draft becomes exactly one character');
});

test('two content imports of one bundle race to the same result', { skip }, async () => {
  const source = {
    id: 'race-test',
    name: 'Concurrency Source',
    publisher: 'Table Companion',
    version: '1.0',
    license: {
      id: 'cc-by-4.0',
      name: 'Creative Commons Attribution 4.0 International',
      url: 'https://creativecommons.org/licenses/by/4.0/',
      redistributable: true,
      attribution: 'Test content.',
    },
  };
  const bundle = JSON.stringify({
    source,
    records: [
      { kind: 'species', key: 'human', name: 'Human', systemId: 'dnd5e-2024', data: {} },
      { kind: 'class', key: 'fighter', name: 'Fighter', systemId: 'dnd5e-2024', data: {} },
    ],
  });

  // A deployment that runs its import from two places at once — a migration job and a hand —
  // must not end with a half-replaced catalogue. Each import is one transaction, so one of
  // them waits; the losing one either succeeds identically or fails without partial writes.
  const results = await Promise.allSettled([
    importBundle(db, bundle, { bundleId: 'race' }),
    importBundle(db, bundle, { bundleId: 'race' }),
  ]);
  assert.ok(
    results.some((result) => result.status === 'fulfilled'),
    'at least one import completed',
  );

  const [rows] = await db.query<{ total: number }>(
    "select count(*)::int as total from content_records where source_id = 'race-test'",
  );
  assert.equal(rows?.total, 2, 'the catalogue holds each record once, whichever import won');

  await db.query("delete from content_sources where id = 'race-test'");
});

/* ── What a refusal leaves behind ───────────────────────────────────────────── */

test('every refusal above left an intact, readable fight', { skip }, async () => {
  const current = await currentCombat();
  assert.ok(current.participants.length > 0, 'the roster survived');
  assert.equal(current.status === 'ended', false, 'and nobody ended the fight');

  // The audit history is still one row per accepted command and nothing per refused one.
  const [audit] = await db.query<{ rows: number; ids: number }>(
    `select count(*)::int as rows, count(distinct command_id)::int as ids
       from combat_events where combat_id = $1 and command_id is not null`,
    [combat.id],
  );
  assert.ok((audit?.rows ?? 0) > 0, 'the accepted commands are in the history');
  assert.equal(audit?.rows, audit?.ids, 'and no command id was recorded twice');
});
