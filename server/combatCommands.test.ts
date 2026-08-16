/**
 * Combat under contention, against a real database.
 *
 * These are the tests the whole of TC-P04 exists to pass. Everything here needs PostgreSQL,
 * because what is being checked is a row lock, a transaction and a unique index — the three
 * things an in-memory double cannot have and the three things that decide whether two people
 * at one table can act at the same time without losing each other's work.
 *
 * With `DATABASE_URL` unset every test below skips.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase, type Database } from './db.ts';
import { migrate } from './migrate.ts';
import { seed } from './seed.ts';
import { createPostgresRepositories, StoreError } from './store.ts';
import { id, type CombatInstance, type ParticipantId } from '../src/domain/types.ts';
import type { CombatCommand } from '../src/domain/combat/commands.ts';
import type { CombatCommandOutcome, Repositories } from '../src/domain/data/repositories.ts';

const DATABASE_URL = process.env.DATABASE_URL?.trim();
const skip = DATABASE_URL
  ? false
  : 'DATABASE_URL is not set. Run `docker compose up -d` and see .env.example.';

const TEST_SCHEMA = 'tc_test_combat';
const DM = id<'User'>('u-marta');

let db: Database;
let repos: Repositories;
let campaignId: string;
let creatureId: string;

let ids = 0;
const commandId = () => `cmd-${(ids += 1)}`;

/** A fresh fight, so no test inherits what another one did. */
async function startAFight(): Promise<CombatInstance> {
  const template = await repos.encounters.create({
    campaignId: id<'Campaign'>(campaignId),
    name: `Contended ${ids}`,
  });
  const prepared = await repos.encounters.save({
    ...template,
    entries: [{ id: 'e1', monsterId: id<'Monster'>(creatureId), count: 2 }],
  });
  return repos.combats.startFromTemplate(prepared.id);
}

/** Issues a command against a stated version, without any bookkeeping of its own. */
const at = (
  combatId: string,
  expectedVersion: number,
  command: CombatCommand,
  attempt = commandId(),
): Promise<CombatCommandOutcome> =>
  repos.combats.command({
    combatId: id<'CombatInstance'>(combatId),
    commandId: attempt,
    expectedVersion,
    command,
  });

/** Runs a fight forward, threading the version through, the way a screen does. */
async function run(combat: CombatInstance, commands: CombatCommand[]): Promise<CombatInstance> {
  let current = combat;
  for (const command of commands) {
    const outcome = await at(current.id, current.version ?? 0, command);
    current = outcome.combat;
  }
  return current;
}

const healthOf = (combat: CombatInstance, participantId: string) =>
  combat.participants.find((entry) => entry.id === participantId)!.health.current;

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
  repos = createPostgresRepositories(db, { currentUserId: DM });

  const [campaign] = await db.query<{ id: string }>(
    'select id from campaigns where dm_user_id = $1 order by created_at limit 1',
    [DM],
  );
  assert.ok(campaign);
  campaignId = campaign.id;

  const [creature] = await db.query<{ id: string }>(
    `select id from monsters where origin = 'library' limit 1`,
  );
  assert.ok(creature);
  creatureId = creature.id;
});

after(async () => {
  await db?.close();
});

/* ── Concurrency ────────────────────────────────────────────────────────────── */

test('two commands issued at once both land, one after the other', { skip }, async () => {
  const fight = await startAFight();
  const goblin = fight.participants.find((entry) => entry.entityType === 'monster')!;
  const full = healthOf(fight, goblin.id);
  const version = fight.version ?? 0;

  // Both are built from the *same* version, which is what two devices looking at one fight
  // actually do. The row lock serialises them; the version check refuses the loser.
  const [first, second] = await Promise.allSettled([
    at(fight.id, version, { kind: 'health.damage', participantId: goblin.id, amount: 3 }),
    at(fight.id, version, { kind: 'health.damage', participantId: goblin.id, amount: 4 }),
  ]);

  const landed = [first, second].filter((entry) => entry.status === 'fulfilled');
  const refused = [first, second].filter((entry) => entry.status === 'rejected');
  assert.equal(landed.length, 1, 'exactly one of two same-version commands applies');
  assert.equal(refused.length, 1);
  assert.ok(
    (refused[0] as PromiseRejectedResult).reason instanceof StoreError &&
      ((refused[0] as PromiseRejectedResult).reason as StoreError).status === 409,
    'the loser is told it is stale rather than silently overwriting',
  );

  // The refused one is re-issued against what the fight is actually at. Now both have landed
  // and neither has been lost — which is the whole point.
  const current = await repos.combats.byId(fight.id);
  assert.ok(current);
  const again = await at(fight.id, current.version ?? 0, {
    kind: 'health.damage',
    participantId: goblin.id,
    amount: 4,
  });
  assert.equal(healthOf(again.combat, goblin.id), full - 7);
});

test('a stale version is refused deterministically, and says what to do', { skip }, async () => {
  const fight = await startAFight();
  const goblin = fight.participants.find((entry) => entry.entityType === 'monster')!;
  const stale = fight.version ?? 0;

  await at(fight.id, stale, { kind: 'health.damage', participantId: goblin.id, amount: 2 });

  const refused = await assert.rejects(
    () => at(fight.id, stale, { kind: 'health.damage', participantId: goblin.id, amount: 2 }),
    (error: unknown) => error instanceof StoreError && error.status === 409,
  );
  assert.equal(refused, undefined);

  // Twice more, to make the point that it is deterministic rather than timing-dependent.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(
      () => at(fight.id, stale, { kind: 'turn.next' }),
      (error: unknown) => error instanceof StoreError && error.status === 409,
    );
  }

  const current = await repos.combats.byId(fight.id);
  assert.equal(current?.version, stale + 1, 'the refusals changed nothing');
});

test('a retried command is recognised, not applied twice', { skip }, async () => {
  const fight = await startAFight();
  const goblin = fight.participants.find((entry) => entry.entityType === 'monster')!;
  const full = healthOf(fight, goblin.id);
  const attempt = commandId();

  const first = await at(
    fight.id,
    fight.version ?? 0,
    { kind: 'health.damage', participantId: goblin.id, amount: 5 },
    attempt,
  );
  assert.equal(healthOf(first.combat, goblin.id), full - 5);
  assert.notEqual(first.replayed, true);

  // The same attempt again — a client that never saw the answer. Note the version it sends
  // is the *stale* one, because it does not know the first landed. It is still not a second
  // hit: the command id is checked before the version is.
  const replay = await at(
    fight.id,
    fight.version ?? 0,
    { kind: 'health.damage', participantId: goblin.id, amount: 5 },
    attempt,
  );
  assert.equal(replay.replayed, true);
  assert.equal(replay.seq, first.seq);
  assert.equal(healthOf(replay.combat, goblin.id), full - 5, 'still five, not ten');

  const [rows] = await db.query<{ total: number }>(
    `select count(*)::int as total from combat_events where combat_id = $1 and kind = 'health.damage'`,
    [fight.id],
  );
  assert.equal(rows?.total, 1, 'one command, one audit row');
});

test('a turn advance and damage racing each other both survive', { skip }, async () => {
  const started = await run(await startAFight(), [{ kind: 'combat.begin' }]);
  const goblin = started.participants.find((entry) => entry.entityType === 'monster')!;
  const wasAt = healthOf(started, goblin.id);
  const round = started.round;

  const version = started.version ?? 0;
  const [turn, damage] = await Promise.allSettled([
    at(started.id, version, { kind: 'turn.next' }),
    at(started.id, version, { kind: 'health.damage', participantId: goblin.id, amount: 6 }),
  ]);

  // One wins the version; the other retries against what it finds. Neither is lost, and the
  // fight never holds a state that only one of them believed in.
  const loser = [turn, damage].find((entry) => entry.status === 'rejected');
  assert.ok(loser, 'one of two same-version commands is refused');

  const current = await repos.combats.byId(started.id);
  assert.ok(current);
  const retry =
    turn.status === 'rejected'
      ? await at(started.id, current.version ?? 0, { kind: 'turn.next' })
      : await at(started.id, current.version ?? 0, {
          kind: 'health.damage',
          participantId: goblin.id,
          amount: 6,
        });

  assert.equal(healthOf(retry.combat, goblin.id), wasAt - 6);
  assert.notEqual(retry.combat.activeParticipantId, started.activeParticipantId);
  assert.ok(retry.combat.round >= round);
});

/* ── Undo ───────────────────────────────────────────────────────────────────── */

test(
  'undo puts back exactly what the event recorded, and keeps the history',
  { skip },
  async () => {
    const fight = await startAFight();
    const goblin = fight.participants.find((entry) => entry.entityType === 'monster')!;
    const full = healthOf(fight, goblin.id);

    const hurt = await at(fight.id, fight.version ?? 0, {
      kind: 'health.damage',
      participantId: goblin.id,
      amount: 7,
    });
    assert.equal(healthOf(hurt.combat, goblin.id), full - 7);

    const undone = await at(fight.id, hurt.combat.version ?? 0, { kind: 'undo', seq: hurt.seq });
    assert.equal(healthOf(undone.combat, goblin.id), full, 'restored, not recomputed');

    // The history grew. Nothing was deleted from it — the correction is a row of its own, and
    // the row it corrects is still there, marked.
    const events = await db.query<{
      seq: number;
      kind: string;
      undoes_seq: number | null;
      undone_by_seq: number | null;
    }>(
      'select seq, kind, undoes_seq, undone_by_seq from combat_events where combat_id = $1 order by seq',
      [fight.id],
    );
    const original = events.find((event) => event.seq === hurt.seq);
    const correction = events.find((event) => event.kind === 'undo');
    assert.ok(original && correction);
    assert.equal(original.undone_by_seq, correction.seq);
    assert.equal(correction.undoes_seq, hurt.seq);
  },
);

test('undoing the same change twice is refused', { skip }, async () => {
  const fight = await startAFight();
  const goblin = fight.participants.find((entry) => entry.entityType === 'monster')!;

  const hurt = await at(fight.id, fight.version ?? 0, {
    kind: 'health.damage',
    participantId: goblin.id,
    amount: 4,
  });
  const undone = await at(fight.id, hurt.combat.version ?? 0, { kind: 'undo', seq: hurt.seq });

  await assert.rejects(
    () => at(fight.id, undone.combat.version ?? 0, { kind: 'undo', seq: hurt.seq }),
    (error: unknown) => error instanceof StoreError && error.status === 409,
  );
});

test('an irreversible change cannot be undone', { skip }, async () => {
  const started = await run(await startAFight(), [{ kind: 'combat.begin' }]);
  const advanced = await at(started.id, started.version ?? 0, { kind: 'turn.next' });

  await assert.rejects(
    () => at(started.id, advanced.combat.version ?? 0, { kind: 'undo', seq: advanced.seq }),
    (error: unknown) => error instanceof StoreError && error.status === 409,
  );
});

test('undoing an old change leaves everything that happened since alone', { skip }, async () => {
  const fight = await startAFight();
  const creatures = fight.participants.filter((entry) => entry.entityType === 'monster');
  const first = creatures[0]!;
  const second = creatures[1]!;
  const firstFull = healthOf(fight, first.id);
  const secondFull = healthOf(fight, second.id);

  // Hit one, then do three unrelated things, then put the first hit back.
  const hurt = await at(fight.id, fight.version ?? 0, {
    kind: 'health.damage',
    participantId: first.id,
    amount: 5,
  });
  const later = await run(hurt.combat, [
    { kind: 'health.damage', participantId: second.id, amount: 2 },
    { kind: 'participant.rename', participantId: second.id, name: 'The loud one' },
    { kind: 'combat.begin' },
  ]);

  const undone = await at(fight.id, later.version ?? 0, { kind: 'undo', seq: hurt.seq });

  assert.equal(healthOf(undone.combat, first.id), firstFull, 'the undone hit is back');
  assert.equal(
    healthOf(undone.combat, second.id),
    secondFull - 2,
    'the later hit on somebody else is untouched',
  );
  assert.equal(
    undone.combat.participants.find((entry) => entry.id === second.id)?.name,
    'The loud one',
    'the later rename survived',
  );
  assert.equal(undone.combat.status, 'live', 'the fight is still running');
});

/* ── Server-owned randomness ────────────────────────────────────────────────── */

test('initiative is rolled by the server, from nothing the caller sent', { skip }, async () => {
  const fight = await startAFight();
  assert.ok(
    fight.participants.every((entry) => entry.initiative === null),
    'a fresh fight has rolled nothing',
  );

  const rolled = await at(fight.id, fight.version ?? 0, {
    kind: 'initiative.roll',
    onlyMissing: true,
  });
  const numbers = rolled.combat.participants.map((entry) => entry.initiative);
  assert.ok(numbers.every((value) => typeof value === 'number'));

  // The command carries no number and has nowhere to put one — the shape is
  // `{ kind, onlyMissing }` and the schema refuses anything else.
  const audit = await db.query<{ payload: { kind: string; onlyMissing: boolean } }>(
    `select payload from combat_events where combat_id = $1 and kind = 'initiative.roll'`,
    [fight.id],
  );
  assert.deepEqual(audit[0]?.payload, { kind: 'initiative.roll', onlyMissing: true });
});

test('a death save is rolled by the server and recorded with its total', { skip }, async () => {
  const started = await run(await startAFight(), [{ kind: 'combat.begin' }]);
  const goblin = started.participants.find((entry) => entry.entityType === 'monster')!;

  // Put them down first: a death save only means something to someone who is out.
  const down = await at(started.id, started.version ?? 0, {
    kind: 'health.override',
    participantId: goblin.id,
    current: 0,
  });
  const save = await at(started.id, down.combat.version ?? 0, {
    kind: 'deathSave.roll',
    participantId: goblin.id,
  });

  assert.ok(save.deathSave, 'the outcome comes back with the roll');
  assert.ok(save.deathSave.total >= 1);
  assert.match(save.summary ?? '', /death save/i);

  const audit = await db.query<{ payload: Record<string, unknown> }>(
    `select payload from combat_events where combat_id = $1 and kind = 'deathSave.roll'`,
    [started.id],
  );
  assert.deepEqual(Object.keys(audit[0]?.payload ?? {}).toSorted(), ['kind', 'participantId']);
});

/* ── Auditability and resync ────────────────────────────────────────────────── */

test('every accepted command leaves exactly one audit row, in order', { skip }, async () => {
  const fight = await startAFight();
  const goblin = fight.participants.find((entry) => entry.entityType === 'monster')!;

  await run(fight, [
    { kind: 'initiative.roll', onlyMissing: true },
    { kind: 'combat.begin' },
    { kind: 'health.damage', participantId: goblin.id, amount: 2 },
    { kind: 'turn.next' },
  ]);

  const events = await db.query<{ seq: number; kind: string; version: number; summary: string }>(
    'select seq, kind, version, summary from combat_events where combat_id = $1 order by seq',
    [fight.id],
  );
  assert.deepEqual(
    events.map((event) => event.kind),
    ['combat.started', 'initiative.roll', 'combat.begin', 'health.damage', 'turn.next'],
  );
  assert.deepEqual(
    events.map((event) => event.seq),
    [1, 2, 3, 4, 5],
  );
  // Every row says which revision it produced, so a row can be matched to a state.
  const versions = events.slice(1).map((event) => event.version);
  assert.deepEqual(
    versions,
    [...versions].toSorted((a, b) => a - b),
  );
  assert.ok(events.every((event) => (event.summary ?? '').length > 0 || event.seq === 1));
});

test(
  'a refresh returns the same authoritative fight the command answered with',
  { skip },
  async () => {
    const fight = await startAFight();
    const goblin = fight.participants.find((entry) => entry.entityType === 'monster')!;

    const outcome = await at(fight.id, fight.version ?? 0, {
      kind: 'health.damage',
      participantId: goblin.id,
      amount: 6,
    });

    // A second pool: nothing this process holds is involved in answering it.
    const reconnected = createDatabase(DATABASE_URL ?? '', { schema: TEST_SCHEMA });
    try {
      const fresh = createPostgresRepositories(reconnected, { currentUserId: DM });
      const reread = await fresh.combats.byId(fight.id);
      assert.deepEqual(reread, outcome.combat);
    } finally {
      await reconnected.close();
    }
  },
);

test('a command against a fight that is gone is a not-found, not a crash', { skip }, async () => {
  await assert.rejects(
    () =>
      at(id<'CombatInstance'>('cb-does-not-exist'), 0, {
        kind: 'turn.next',
      }),
    (error: unknown) => error instanceof StoreError && error.status === 404,
  );
});

test('a refused command rolls the whole transaction back, history included', { skip }, async () => {
  const fight = await startAFight();
  const [auditBefore] = await db.query<{ total: number }>(
    'select count(*)::int as total from combat_events where combat_id = $1',
    [fight.id],
  );

  // `turn.next` on a fight that has not begun. The refusal happens after the row is locked
  // and the version checked, so the rollback has something to undo.
  await assert.rejects(
    () => at(fight.id, fight.version ?? 0, { kind: 'turn.next' }),
    (error: unknown) => error instanceof StoreError && error.status === 409,
  );

  const [afterRows] = await db.query<{ total: number }>(
    'select count(*)::int as total from combat_events where combat_id = $1',
    [fight.id],
  );
  assert.equal(
    afterRows?.total,
    auditBefore?.total,
    'no audit row for a command that did not apply',
  );

  const current = await repos.combats.byId(fight.id);
  assert.equal(current?.version, fight.version, 'and the version did not move');
});

test('a participant who left cannot be commanded', { skip }, async () => {
  const fight = await startAFight();
  await assert.rejects(
    () =>
      at(fight.id, fight.version ?? 0, {
        kind: 'health.damage',
        participantId: id<'CombatParticipant'>('p-ghost') as ParticipantId,
        amount: 1,
      }),
    (error: unknown) => error instanceof StoreError && error.status === 409,
  );
});
