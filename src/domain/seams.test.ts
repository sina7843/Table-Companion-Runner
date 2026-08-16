/**
 * The seams TC-13 made explicit.
 *
 * Three things are checked here, and each of them is a rule that would otherwise rot
 * silently: no screen reaches into fixture data, every write announces itself, and the
 * HTTP client talks to the contract rather than to strings of its own.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createFixtureRepositories } from './data/fixtureRepositories.ts';
import { createHttpRepositories } from './data/httpRepositories.ts';
import { API_ROUTES, ApiError } from './data/apiContract.ts';
import { createLocalChannel, createNullChannel, type DomainEvent } from './data/realtime.ts';
import { withRealtime } from './data/withRealtime.ts';
import { id } from './types.ts';

/** A fetch that always answers with one status and no body. */
const failWith = (status: number) =>
  (async () => new Response('', { status })) as unknown as typeof globalThis.fetch;

/* ── No screen reaches into fixture data ────────────────────────────────────── */

function sourceFiles(root: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry) && !entry.includes('.test.')) found.push(path);
  }
  return found;
}

test('no screen or shell file imports fixture data', () => {
  const offenders: string[] = [];

  for (const path of [...sourceFiles('src/screens'), ...sourceFiles('src/app')]) {
    const source = readFileSync(path, 'utf8');
    if (/from\s+['"][^'"]*data\/fixtures/.test(source)) offenders.push(`${path}: fixture import`);
    if (/\bCURRENT_USER_ID\b/.test(source)) offenders.push(`${path}: CURRENT_USER_ID`);
    if (/createFixtureRepositories/.test(source)) offenders.push(`${path}: constructs fixtures`);
  }

  assert.deepEqual(
    offenders,
    [],
    'the UI reads through the repositories and the session, never the demo data',
  );
});

test('the domain barrel does not re-export the fixture user', () => {
  const barrel = readFileSync('src/domain/index.ts', 'utf8');
  assert.ok(
    !/export\s*{[^}]*CURRENT_USER_ID/.test(barrel),
    'removing the export is what keeps the coupling removed',
  );
});

/* ── Every write announces itself ───────────────────────────────────────────── */

function recorder() {
  const seen: DomainEvent[] = [];
  const channel = createNullChannel();
  return {
    seen,
    channel: {
      ...channel,
      publish: (event: Parameters<typeof channel.publish>[0]) => {
        seen.push({ ...event, origin: 'test', at: '2026-08-15T00:00:00.000Z' } as DomainEvent);
      },
    },
  };
}

test('saving a fight announces it, and ending one says so specifically', async () => {
  const { seen, channel } = recorder();
  const repos = withRealtime(createFixtureRepositories(), channel);

  const combat = await repos.combats.byId(id<'CombatInstance'>('cb-goblin-ambush'));
  assert.ok(combat);

  await repos.combats.save({ ...combat, round: 4 });
  assert.deepEqual(seen.at(-1)?.kind, 'combat.changed');

  await repos.combats.save({ ...combat, status: 'ended' });
  assert.deepEqual(seen.at(-1)?.kind, 'combat.ended');
});

test('starting a fight announces both the fight and the template it came from', async () => {
  const { seen, channel } = recorder();
  const repos = withRealtime(createFixtureRepositories(), channel);

  const templates = await repos.encounters.listForCampaign(id<'Campaign'>('c-lmop'));
  const template = templates.find((entry) => entry.name === 'Wolves on the road');
  assert.ok(template);

  await repos.combats.startFromTemplate(template.id);
  assert.deepEqual(
    seen.map((event) => event.kind),
    ['combat.changed', 'encounter.changed'],
  );
});

test('an encounter edit announces itself and a read does not', async () => {
  const { seen, channel } = recorder();
  const repos = withRealtime(createFixtureRepositories(), channel);

  await repos.encounters.listForCampaign(id<'Campaign'>('c-lmop'));
  assert.equal(seen.length, 0, 'a read is not an event');

  const created = await repos.encounters.create({
    campaignId: id<'Campaign'>('c-lmop'),
    name: 'Announced',
  });
  try {
    assert.equal(seen.at(-1)?.kind, 'encounter.changed');
    await repos.encounters.save({ ...created, name: 'Renamed' });
    assert.equal(seen.length, 2);
  } finally {
    await repos.encounters.remove(created.id);
  }
});

test('a recorded roll announces that a roll happened, and carries no result', async () => {
  const { seen, channel } = recorder();
  const repos = withRealtime(createFixtureRepositories(), channel);
  const combatId = id<'CombatInstance'>('cb-goblin-ambush');

  await repos.rolls.record({
    id: id<'Roll'>('r-seam-test'),
    combatId,
    actor: 'Cragmaw Ambusher',
    title: 'Stealth',
    expression: '1d20 + 6',
    mode: 'normal',
    dice: [{ sides: 20, value: 17 }],
    modifier: 6,
    total: 23,
    outcome: 'normal',
    // A secret roll still announces that one happened. The event is a notification, so
    // the total and the visibility never travel — the receiver re-reads and the DM-only
    // rule is enforced where it already lives.
    visibility: 'dm-only',
    at: '2026-08-15T19:44:00.000Z',
  });

  const event = seen.at(-1);
  assert.equal(event?.kind, 'roll.recorded');
  assert.ok(!JSON.stringify(event).includes('23'), 'no total travels with the event');
  assert.ok(!JSON.stringify(event).includes('dm-only'), 'no visibility travels with it');
});

/* ── The local channel is a real channel ────────────────────────────────────── */

test('a device does not hear its own echo', () => {
  const channel = createLocalChannel('test-no-echo');
  const heard: DomainEvent[] = [];
  channel.subscribe((event) => heard.push(event));

  channel.publish({ kind: 'combat.changed', combatId: id<'CombatInstance'>('cb-1') });
  assert.deepEqual(heard, [], 'a tab re-reading its own write would fight itself');

  channel.close();
});

/* ── The HTTP client talks to the contract ──────────────────────────────────── */

// Bodies that satisfy the response schemas: since TC-P03 the client validates what it is
// given, so a stub that answers `{}` to every call is a stub that lies about the contract.
const bodyFor = (url: string): { status: number; body: string } => {
  if (url.endsWith('/me')) return { status: 200, body: '{"id":"u-1","displayName":"Marta"}' };
  if (url.includes('/combats/')) return { status: 200, body: 'null' };
  return { status: 204, body: '' };
};

test('every repository call goes to the path the contract states', async () => {
  const calls: { url: string; method: string }[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? 'GET' });
    const { status, body } = bodyFor(String(url));
    return new Response(body || null, {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof globalThis.fetch;

  const repos = createHttpRepositories({ baseUrl: 'https://api.example.test/v1/', fetch: fetcher });

  await repos.users.current();
  await repos.combats.byId(id<'CombatInstance'>('cb-1'));
  await repos.encounters.remove(id<'EncounterTemplate'>('e-1'));

  assert.deepEqual(calls, [
    { url: 'https://api.example.test/v1/me', method: 'GET' },
    { url: 'https://api.example.test/v1/combats/cb-1', method: 'GET' },
    { url: 'https://api.example.test/v1/encounters/e-1', method: 'DELETE' },
  ]);
});

test('a monster query becomes the query string the contract describes', async () => {
  let seen = '';
  const fetcher = (async (url: string | URL | Request) => {
    seen = String(url);
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof globalThis.fetch;

  const repos = createHttpRepositories({ baseUrl: 'https://api.example.test', fetch: fetcher });
  await repos.monsters.list({ search: 'gob', challengeMin: 1, facets: { type: ['Dragon'] } });

  assert.ok(seen.includes('search=gob'));
  assert.ok(seen.includes('challengeMin=1'));
  assert.ok(seen.includes('facet.type=Dragon'));
});

test('a failure says whether trying again is worth it', async () => {
  const server = createHttpRepositories({ baseUrl: 'https://x.test', fetch: failWith(503) });
  await assert.rejects(
    () => server.users.current(),
    (error: unknown) => error instanceof ApiError && error.retryable && error.status === 503,
  );

  const notFound = createHttpRepositories({ baseUrl: 'https://x.test', fetch: failWith(404) });
  await assert.rejects(
    () => notFound.users.current(),
    (error: unknown) => error instanceof ApiError && !error.retryable,
  );

  // A network failure is status 0, which is retryable and distinguishable from a rejection.
  const offline = createHttpRepositories({
    baseUrl: 'https://x.test',
    fetch: (async () => {
      throw new TypeError('failed to fetch');
    }) as unknown as typeof globalThis.fetch,
  });
  await assert.rejects(
    () => offline.users.current(),
    (error: unknown) => error instanceof ApiError && error.status === 0 && error.retryable,
  );
});

test('the contract names a route for every repository method the client uses', () => {
  const source = readFileSync('src/domain/data/httpRepositories.ts', 'utf8');
  const used = new Set(
    [...source.matchAll(/API_ROUTES\['([^']+)'\]/g)].map((match) => match[1] as string),
  );

  assert.ok(used.size > 30, 'the whole surface is covered, not a sample');
  for (const route of used) {
    assert.ok(route in API_ROUTES, `${route} is not in the contract`);
  }
});
