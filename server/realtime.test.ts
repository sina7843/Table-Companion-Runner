/**
 * Realtime, over a real database and a real HTTP server.
 *
 * Two independent clients, two real session cookies, one event stream each. What is being
 * checked is the thing the acceptance criteria name: that a DM and a player see committed
 * changes promptly, that a player cannot subscribe to what is not theirs, that a secret roll
 * never reaches them, and that a client which missed a window recovers to the exact
 * authoritative state rather than to a reconstruction of it.
 *
 * `EventSource` is not used here. The tests read the raw stream, which is the only way to
 * assert what was and was not sent — the point of most of them.
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
import { createRateLimiter } from './rateLimit.ts';
import {
  audienceForVisibility,
  createHub,
  withServerEvents,
  type Hub,
  type StreamEvent,
} from './broadcast.ts';
import { id, type CombatInstance, type Roll } from '../src/domain/types.ts';
import type { DomainEvent } from '../src/domain/data/realtime.ts';

const DATABASE_URL = process.env.DATABASE_URL?.trim();
const skip = DATABASE_URL
  ? false
  : 'DATABASE_URL is not set. Run `docker compose up -d` and see .env.example.';

const TEST_SCHEMA = 'tc_test_realtime';

let db: Database;
let server: Server;
let base: string;
let hub: Hub;

let dmCookie = '';
let playerCookie = '';
let outsiderCookie = '';
let campaignId = '';
let creatureId = '';
let ids = 0;

interface Answer {
  status: number;
  body: unknown;
  cookie: string;
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
  return {
    status: response.status,
    body: text ? (JSON.parse(text) as unknown) : undefined,
    cookie: (response.headers.getSetCookie()[0] ?? '').split(';')[0] ?? '',
  };
}

/**
 * One open stream, read as it arrives.
 *
 * Deliberately a raw reader rather than a client library: what most of these tests assert is
 * what was *not* delivered, and only the bytes can say that.
 */
interface Stream {
  status: number;
  events: DomainEvent[];
  resyncs: string[];
  raw: string;
  close(): void;
  /** Waits until `count` ordinary events have arrived, or gives up. */
  waitFor(count: number, timeoutMs?: number): Promise<void>;
}

async function open(cookie: string, query = ''): Promise<Stream> {
  const controller = new AbortController();
  const response = await fetch(`${base}/events${query}`, {
    headers: { cookie, 'sec-fetch-site': 'same-origin' },
    signal: controller.signal,
  });

  const stream: Stream = {
    status: response.status,
    events: [],
    resyncs: [],
    raw: '',
    close: () => controller.abort(),
    async waitFor(count, timeoutMs = 3000) {
      const until = Date.now() + timeoutMs;
      while (stream.events.length < count && Date.now() < until) {
        await new Promise((done) => setTimeout(done, 10));
      }
    },
  };

  if (!response.ok || !response.body) return stream;

  void (async () => {
    const decoder = new TextDecoder();
    try {
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        stream.raw += decoder.decode(chunk, { stream: true });

        // Frames are separated by a blank line; anything after the last one is a partial.
        const frames = stream.raw.split('\n\n');
        stream.raw = frames.pop() ?? '';
        for (const frame of frames) {
          const isResync = frame.includes('event: resync');
          const data = frame
            .split('\n')
            .find((line) => line.startsWith('data: '))
            ?.slice('data: '.length);
          if (data === undefined) continue;
          if (isResync) stream.resyncs.push(data);
          else stream.events.push(JSON.parse(data) as DomainEvent);
        }
      }
    } catch {
      // Aborted by the test, which is how a stream is meant to end here.
    }
  })();

  return stream;
}

/** Waits for a condition, because sockets in other tests close on their own schedule. */
const settle = async (predicate: () => boolean, timeoutMs = 3000) => {
  const until = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < until) await new Promise((done) => setTimeout(done, 25));
};

const cmd = (
  cookie: string,
  combat: CombatInstance,
  command: unknown,
  commandId = `rt-${(ids += 1)}`,
) =>
  call('POST', `/combats/${combat.id}/commands`, {
    cookie,
    body: { commandId, expectedVersion: combat.version ?? 0, command },
  });

async function startAFight(): Promise<CombatInstance> {
  const created = await call('POST', '/encounters', {
    cookie: dmCookie,
    body: { campaignId, name: `Realtime ${(ids += 1)}` },
  });
  const template = created.body as { id: string };
  await call('PUT', `/encounters/${template.id}`, {
    cookie: dmCookie,
    body: { ...(created.body as object), entries: [{ id: 'e1', monsterId: creatureId, count: 2 }] },
  });
  const started = await call('POST', `/encounters/${template.id}/start`, {
    cookie: dmCookie,
    body: {},
  });
  return started.body as CombatInstance;
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
      heartbeatMs: 200,
      cookie: { sameSite: 'Strict', secure: false },
      allowedOrigins: [],
      repositoriesFor: (actor) =>
        // Note the wrapping order: the event layer is outermost, so nothing is announced that
        // the authorization layer refused or the store did not commit.
        actor
          ? withServerEventsFor(actor)
          : createAuthorizedRepositories(createPostgresRepositories(db), null),
      logger: silentLogger,
      rateLimiter: createRateLimiter(),
    }),
  );
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  // Two real accounts, in one campaign, plus one who is in neither.
  const [dmRow] = await db.query<{ dm_user_id: string; id: string }>(
    `select c.id, c.dm_user_id from campaigns c
      where exists (select 1 from characters ch where ch.campaign_id = c.id
                     and ch.owner_user_id <> c.dm_user_id)
      limit 1`,
  );
  assert.ok(dmRow);
  campaignId = dmRow.id;

  const [playerRow] = await db.query<{ user_id: string }>(
    `select user_id from campaign_members where campaign_id = $1 and role = 'player' limit 1`,
    [campaignId],
  );
  assert.ok(playerRow);

  const [creature] = await db.query<{ id: string }>(
    `select id from monsters where origin = 'library' limit 1`,
  );
  assert.ok(creature);
  creatureId = creature.id;

  const signIn = async (userId: string) =>
    (
      await call('POST', '/auth/sign-in', {
        body: { email: devEmailFor(userId), password: DEV_PASSWORD },
      })
    ).cookie;

  dmCookie = await signIn(dmRow.dm_user_id);
  playerCookie = await signIn(playerRow.user_id);

  const outsider = await call('POST', '/auth/sign-up', {
    body: {
      email: `outsider-${Date.now()}@example.test`,
      password: 'a-long-enough-password',
      displayName: 'Stranger',
    },
  });
  outsiderCookie = outsider.cookie;
  assert.ok(dmCookie && playerCookie && outsiderCookie);
});

/** Built here so the listener above stays readable. */
function withServerEventsFor(actor: { userId: ReturnType<typeof id<'User'>> }) {
  return withServerEvents(
    createAuthorizedRepositories(
      createPostgresRepositories(db, { currentUserId: actor.userId }),
      actor,
    ),
    hub.publish,
  );
}

after(async () => {
  await new Promise<void>((closed) => {
    if (!server) {
      closed();
      return;
    }
    server.close(() => closed());
    // A stream never ends on its own, and `close` waits for every connection. Without this
    // the test process holds open sockets and their heartbeats for ever.
    server.closeAllConnections();
  });
  await db?.close();
});

/* ── Two clients ────────────────────────────────────────────────────────────── */

test('a DM and a player both see a committed change promptly', { skip }, async () => {
  const dm = await open(dmCookie);
  const player = await open(playerCookie);
  assert.equal(dm.status, 200);
  assert.equal(player.status, 200);

  try {
    const fight = await startAFight();
    await dm.waitFor(1);
    await player.waitFor(1);

    assert.ok(
      dm.events.some((event) => event.kind === 'combat.changed'),
      'the DM was told a fight started',
    );
    assert.ok(
      player.events.some((event) => event.kind === 'combat.changed'),
      'so was the player',
    );

    const goblin = fight.participants.find((entry) => entry.entityType === 'monster')!;
    const seenSoFar = player.events.length;
    await cmd(dmCookie, fight, { kind: 'health.damage', participantId: goblin.id, amount: 3 });

    await player.waitFor(seenSoFar + 1);
    assert.ok(player.events.length > seenSoFar, 'and about the damage that followed');
  } finally {
    dm.close();
    player.close();
  }
});

test('an encounter edit reaches the DM and not the player', { skip }, async () => {
  const dm = await open(dmCookie);
  const player = await open(playerCookie);

  try {
    const created = await call('POST', '/encounters', {
      cookie: dmCookie,
      body: { campaignId, name: 'DM only' },
    });
    await call('PUT', `/encounters/${(created.body as { id: string }).id}`, {
      cookie: dmCookie,
      body: { ...(created.body as object), notes: 'They wait in the trees.' },
    });

    await dm.waitFor(1);
    assert.ok(dm.events.some((event) => event.kind === 'encounter.changed'));

    // An encounter carries setup notes, so telling a player it changed would be telling them
    // it exists. Give it a beat to be sure nothing arrives late.
    await new Promise((done) => setTimeout(done, 300));
    assert.equal(
      player.events.some((event) => event.kind === 'encounter.changed'),
      false,
    );
  } finally {
    dm.close();
    player.close();
  }
});

test('a secret roll is not announced to a player at all', { skip }, async () => {
  const fight = await startAFight();
  const dm = await open(dmCookie);
  const player = await open(playerCookie);

  try {
    const secret: Roll = {
      id: id<'Roll'>(`r-secret-${(ids += 1)}`),
      combatId: fight.id,
      actor: 'DM',
      title: 'Stealth',
      expression: '1d20 +6',
      mode: 'normal',
      dice: [{ sides: 20, value: 18 }],
      modifier: 6,
      total: 24,
      outcome: 'normal',
      visibility: 'dm-only',
      at: new Date().toISOString(),
    };
    await call('POST', `/combats/${fight.id}/rolls`, { cookie: dmCookie, body: secret });

    await dm.waitFor(1);
    assert.ok(dm.events.some((event) => event.kind === 'roll.recorded'));

    await new Promise((done) => setTimeout(done, 300));
    assert.equal(
      player.events.some((event) => event.kind === 'roll.recorded'),
      false,
      'a player is not even told that a hidden roll happened',
    );

    // An open roll reaches both, which is what makes the filter a filter rather than a mute.
    await call('POST', `/combats/${fight.id}/rolls`, {
      cookie: dmCookie,
      body: { ...secret, id: id<'Roll'>(`r-open-${(ids += 1)}`), visibility: 'party' },
    });
    await player.waitFor(1);
    assert.ok(player.events.some((event) => event.kind === 'roll.recorded'));
  } finally {
    dm.close();
    player.close();
  }
});

/* ── Subscriptions are granted, not requested ───────────────────────────────── */

test(
  'a stream cannot be opened without a session, or onto somebody else’s campaign',
  { skip },
  async () => {
    const anonymous = await fetch(`${base}/events`, {
      headers: { 'sec-fetch-site': 'same-origin' },
    });
    assert.equal(anonymous.status, 401);
    await anonymous.body?.cancel();

    const wrongCampaign = await fetch(`${base}/events?campaignId=${campaignId}`, {
      headers: { cookie: outsiderCookie, 'sec-fetch-site': 'same-origin' },
    });
    assert.equal(wrongCampaign.status, 403);
    await wrongCampaign.body?.cancel();

    // And a stream that is allowed simply carries nothing from a campaign it is not in.
    const outsider = await open(outsiderCookie);
    try {
      await startAFight();
      await new Promise((done) => setTimeout(done, 300));
      assert.deepEqual(outsider.events, []);
    } finally {
      outsider.close();
    }
  },
);

/* ── The hub's own rules ────────────────────────────────────────────────────── */

const entry = (
  seq: number,
  campaign: string,
  audience: 'members' | 'dm',
): Omit<StreamEvent, 'seq'> => ({
  campaignId: campaign,
  audience,
  event: {
    kind: 'combat.changed',
    combatId: id<'CombatInstance'>(`cb-${seq}`),
    at: '2026-08-16T20:00:00.000Z',
    origin: 'server',
  },
});

test('replay hands back what was missed, in order, filtered by audience', () => {
  const local = createHub();
  local.publish(entry(1, 'c-1', 'members'));
  local.publish(entry(2, 'c-1', 'dm'));
  local.publish(entry(3, 'c-2', 'members'));
  local.publish(entry(4, 'c-1', 'members'));

  const asPlayer = local.replay(1, new Set(['c-1']), new Set());
  assert.ok(asPlayer);
  assert.deepEqual(
    asPlayer.map((event) => event.seq),
    [4],
    'the DM-only event and the other campaign are both absent',
  );

  const asDm = local.replay(1, new Set(['c-1']), new Set(['c-1']));
  assert.deepEqual(
    asDm?.map((event) => event.seq),
    [2, 4],
  );

  // Out of order in, in order out: a client applies what it missed as a sequence.
  const both = local.replay(0, new Set(['c-2', 'c-1']), new Set(['c-1']));
  assert.deepEqual(
    both?.map((event) => event.seq),
    [1, 2, 3, 4],
  );
});

test('a client that is already current is handed nothing, and asking twice is idempotent', () => {
  const local = createHub();
  local.publish(entry(1, 'c-1', 'members'));

  assert.deepEqual(local.replay(local.position(), new Set(['c-1']), new Set()), []);
  // Duplicate delivery is harmless by construction — an event is a notification and the
  // receiver re-reads — but replaying the same window twice must not invent anything either.
  const once = local.replay(0, new Set(['c-1']), new Set());
  const twice = local.replay(0, new Set(['c-1']), new Set());
  assert.deepEqual(once, twice);
});

test('a gap wider than the window is answered with nothing to replay', () => {
  const local = createHub();
  for (let n = 0; n < 400; n += 1) local.publish(entry(n, 'c-1', 'members'));

  // The client last saw event 1, which has long since rolled out of the window. Handing it a
  // partial history would be handing it a wrong fight.
  assert.equal(local.replay(1, new Set(['c-1']), new Set()), null);
  // A recent client is still served from the window.
  assert.ok(local.replay(local.position() - 5, new Set(['c-1']), new Set()));
});

test('a secret roll decides its own audience', () => {
  assert.equal(audienceForVisibility('party'), 'members');
  assert.equal(audienceForVisibility('public'), 'members');
  assert.equal(audienceForVisibility('dm-only'), 'dm');
  assert.equal(audienceForVisibility('secret'), 'dm');
});

/* ── Reconnect and recovery ─────────────────────────────────────────────────── */

test('a reconnecting client is handed exactly what it missed', { skip }, async () => {
  const first = await open(dmCookie);
  await first.waitFor(0);
  const lastSeen = hub.position();

  // It goes away, and the table carries on without it.
  first.close();
  await new Promise((done) => setTimeout(done, 100));

  const fight = await startAFight();
  const goblin = fight.participants.find((entry_) => entry_.entityType === 'monster')!;
  await cmd(dmCookie, fight, { kind: 'health.damage', participantId: goblin.id, amount: 2 });

  // It comes back saying how far it got, the way `EventSource` does with `Last-Event-ID`.
  const again = await open(dmCookie, `?lastEventId=${lastSeen}`);
  try {
    await again.waitFor(2);
    assert.ok(again.events.length >= 2, 'the events it missed were replayed');
    assert.deepEqual(again.resyncs, [], 'and it was not told to start over');
  } finally {
    again.close();
  }
});

test(
  'a client that fell too far behind is told to re-read, not handed a reconstruction',
  { skip },
  async () => {
    const stream = await open(dmCookie, '?lastEventId=1');
    try {
      // The hub has published far more than the window since sequence 1 in this file's other
      // tests; where it has not, the assertion below still holds because a `resync` is the only
      // answer to a gap it cannot fill.
      for (let n = 0; n < 250; n += 1) {
        hub.publish(entry(n, campaignId, 'members'));
      }

      const behind = await open(dmCookie, '?lastEventId=1');
      try {
        await new Promise((done) => setTimeout(done, 200));
        assert.equal(behind.resyncs.length, 1, 'one resync, not a partial history');
        assert.match(behind.resyncs[0] ?? '', /fell behind/);
      } finally {
        behind.close();
      }
    } finally {
      stream.close();
    }
  },
);

test('a stream that goes away is dropped rather than written to forever', { skip }, async () => {
  await settle(() => hub.size() === 0);
  const idle = hub.size();

  const stream = await open(dmCookie);
  await settle(() => hub.size() > idle);
  assert.ok(hub.size() > idle, 'the stream registered');

  stream.close();
  // The heartbeat is 200ms here, so the next write finds the socket gone and cleans up.
  await settle(() => hub.size() <= idle);
  assert.equal(hub.size(), idle, 'the subscriber was removed when its socket closed');
});
