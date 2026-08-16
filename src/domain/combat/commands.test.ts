/**
 * The command reducer and the player permission rule. No database: `applyCommand` is a pure
 * function of a fight and a command, which is exactly why it is a separate module from the
 * transaction that runs it.
 *
 * The permission tests replace TC-P02's diff policy. That file had to compare the fight a
 * client sent against the one it was shown, because a whole-record write does not say what it
 * meant. A command does, so these ask a question about the intent — which is both shorter and
 * impossible to fool with a change nobody thought to look for.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCommand,
  canPlayerIssue,
  CommandRefused,
  COMMAND_KINDS,
  type CombatCommand,
} from './commands.ts';
import { requireRuleset } from '../ruleset/registry.ts';
import { listGameSystems } from '../ruleset/registry.ts';
import { id, type CombatInstance, type CombatParticipant } from '../types.ts';

const SYSTEM = listGameSystems().find((entry) => entry.status === 'ready')!.id;
const rules = requireRuleset(SYSTEM);

/** A die that always comes up the same, so an outcome is a fact rather than a coin flip. */
const fixed = (value: number) => () => value;

const context = (random = fixed(0.5)) => ({
  rules,
  now: '2026-08-16T20:00:00.000Z',
  random,
  attributesFor: () => [],
});

function participant(
  overrides: Omit<Partial<CombatParticipant>, 'id'> & { id: string },
): CombatParticipant {
  return {
    id: id<'CombatParticipant'>(overrides.id),
    name: overrides.name ?? 'Someone',
    subtitle: '',
    entityType: overrides.entityType ?? 'player',
    initiative: overrides.initiative ?? 10,
    health: overrides.health ?? { current: 20, max: 20, temporary: 0 },
    conditions: overrides.conditions ?? [],
    state: overrides.state ?? 'waiting',
    visibility: overrides.visibility ?? 'party',
    ...(overrides.deathSaves ? { deathSaves: overrides.deathSaves } : {}),
    source: overrides.source ?? { kind: 'character', characterId: id<'Character'>('ch-someone') },
  };
}

const MINE = participant({ id: 'p-mine', name: 'Quill', state: 'active' });
const THEIRS = participant({
  id: 'p-theirs',
  name: 'Bram',
  initiative: 8,
  source: { kind: 'character', characterId: id<'Character'>('ch-bram') },
});
const GOBLIN = participant({
  id: 'p-goblin',
  name: 'Goblin #1',
  entityType: 'monster',
  initiative: 6,
  source: { kind: 'monster', monsterId: id<'Monster'>('m-goblin') },
});

const FIGHT: CombatInstance = {
  id: id<'CombatInstance'>('cb-1'),
  campaignId: id<'Campaign'>('c-lmop'),
  name: 'Cragmaw Hideout',
  status: 'live',
  round: 2,
  activeParticipantId: MINE.id,
  participants: [MINE, THEIRS, GOBLIN],
  version: 7,
};

const OWNED = new Set<string>([MINE.id]);
const of = (fight: CombatInstance, participantId: string) =>
  fight.participants.find((entry) => entry.id === participantId)!;

/* ── The reducer ────────────────────────────────────────────────────────────── */

test('the amount is stated; the arithmetic is not the caller to do', () => {
  const result = applyCommand(
    FIGHT,
    { kind: 'health.damage', participantId: MINE.id, amount: 5 },
    context(),
  );
  assert.equal(of(result.combat, MINE.id).health.current, 15);
  // And the input is untouched — a reducer that mutated its argument would be a reducer a
  // transaction could not roll back.
  assert.equal(of(FIGHT, MINE.id).health.current, 20);
});

test('damage past zero floors rather than going negative, and downs a character', () => {
  const result = applyCommand(
    FIGHT,
    { kind: 'health.damage', participantId: MINE.id, amount: 999 },
    context(),
  );
  assert.equal(of(result.combat, MINE.id).health.current, 0);
  assert.equal(of(result.combat, MINE.id).state, 'unconscious');
});

test('an amount that is not a number of hit points is refused', () => {
  for (const amount of [0, -3, 1.5]) {
    assert.throws(
      () =>
        applyCommand(FIGHT, { kind: 'health.damage', participantId: MINE.id, amount }, context()),
      CommandRefused,
    );
  }
});

test('a condition the ruleset does not know is refused rather than invented', () => {
  assert.throws(
    () =>
      applyCommand(
        FIGHT,
        { kind: 'condition.add', participantId: MINE.id, key: 'bewildered' },
        context(),
      ),
    CommandRefused,
  );

  const known = rules.conditions[0]!;
  const added = applyCommand(
    FIGHT,
    { kind: 'condition.add', participantId: MINE.id, key: known.key },
    context(),
  );
  assert.equal(of(added.combat, MINE.id).conditions[0]?.key, known.key);
});

test('a death save is rolled here, and the same die always gives the same answer', () => {
  const down: CombatInstance = {
    ...FIGHT,
    participants: FIGHT.participants.map((entry) =>
      entry.id === MINE.id
        ? { ...entry, state: 'unconscious', health: { ...entry.health, current: 0 } }
        : entry,
    ),
  };

  // A high roll and a low roll are different outcomes, from the same command — which is the
  // proof that the die is the server's and not the caller's.
  const high = applyCommand(
    down,
    { kind: 'deathSave.roll', participantId: MINE.id },
    context(fixed(0.99)),
  );
  const low = applyCommand(
    down,
    { kind: 'deathSave.roll', participantId: MINE.id },
    context(fixed(0.01)),
  );

  assert.ok(high.deathSave);
  assert.ok(low.deathSave);
  assert.notEqual(high.deathSave.total, low.deathSave.total);
  // Nothing in the command said what came up. There is nowhere for a client to put it.
  assert.equal('total' in { kind: 'deathSave.roll', participantId: MINE.id }, false);
});

test('a fight that has not started has no turn to advance, and an ended one takes nothing', () => {
  const preparing: CombatInstance = { ...FIGHT, status: 'preparing', activeParticipantId: null };
  assert.throws(() => applyCommand(preparing, { kind: 'turn.next' }, context()), CommandRefused);

  const ended: CombatInstance = { ...FIGHT, status: 'ended' };
  assert.throws(() => applyCommand(ended, { kind: 'turn.next' }, context()), CommandRefused);
  assert.throws(
    () =>
      applyCommand(ended, { kind: 'health.damage', participantId: MINE.id, amount: 1 }, context()),
    CommandRefused,
  );
  // Reopening is the one thing an ended fight accepts.
  assert.equal(applyCommand(ended, { kind: 'combat.reopen' }, context()).combat.status, 'live');
});

test('a reversible command records what to put back; an irreversible one records nothing', () => {
  const hurt = applyCommand(
    FIGHT,
    { kind: 'health.damage', participantId: MINE.id, amount: 4 },
    context(),
  );
  assert.deepEqual(hurt.undo?.health, MINE.health);
  assert.equal(hurt.undo?.state, MINE.state);

  // A turn advance is not a thing to put back — undoing one would mean guessing at what the
  // fight did in between.
  assert.equal(applyCommand(FIGHT, { kind: 'turn.next' }, context()).undo, null);
  assert.equal(applyCommand(FIGHT, { kind: 'combat.end' }, context()).undo, null);
});

test('a command naming a combatant who is not in the fight is refused', () => {
  assert.throws(
    () =>
      applyCommand(
        FIGHT,
        { kind: 'health.damage', participantId: id<'CombatParticipant'>('p-ghost'), amount: 1 },
        context(),
      ),
    CommandRefused,
  );
});

/* ── Who may issue what ─────────────────────────────────────────────────────── */

const allowed = (command: Parameters<typeof canPlayerIssue>[0]) =>
  canPlayerIssue(command, FIGHT, OWNED).allowed;

test('a player may act on their own combatant and against a creature', () => {
  assert.ok(allowed({ kind: 'health.damage', participantId: MINE.id, amount: 3 }));
  assert.ok(allowed({ kind: 'health.heal', participantId: MINE.id, amount: 3 }));
  assert.ok(allowed({ kind: 'health.damage', participantId: GOBLIN.id, amount: 3 }));
  assert.ok(allowed({ kind: 'deathSave.roll', participantId: MINE.id }));
  assert.ok(allowed({ kind: 'target.set', participantId: THEIRS.id }));
  assert.ok(allowed({ kind: 'turn.next' }));
});

test('everything about the fight itself is the DM to issue', () => {
  const dmOnly = [
    { kind: 'combat.begin' },
    { kind: 'combat.end' },
    { kind: 'combat.reopen' },
    { kind: 'turn.previous' },
    { kind: 'turn.resort' },
    { kind: 'turn.jump', participantId: MINE.id },
    { kind: 'turn.move', participantId: MINE.id, direction: 'earlier' },
    { kind: 'initiative.set', participantIds: [MINE.id], value: 20 },
    { kind: 'initiative.roll', onlyMissing: true },
    { kind: 'health.override', participantId: MINE.id, current: 20 },
    { kind: 'state.override', participantId: MINE.id, state: 'active' },
    { kind: 'participant.rename', participantId: MINE.id, name: 'Cheat' },
    { kind: 'participant.visibility', participantIds: [GOBLIN.id], visibility: 'party' },
    { kind: 'participant.remove', participantIds: [GOBLIN.id] },
    { kind: 'undo', seq: 1 },
  ] satisfies CombatCommand[];

  for (const command of dmOnly) {
    assert.equal(allowed(command), false, `${command.kind} should be the DM's`);
  }
});

test("a player may not touch another character's state, or roll their death save", () => {
  assert.equal(allowed({ kind: 'health.damage', participantId: THEIRS.id, amount: 3 }), false);
  assert.equal(allowed({ kind: 'health.heal', participantId: THEIRS.id, amount: 3 }), false);
  assert.equal(allowed({ kind: 'deathSave.roll', participantId: THEIRS.id }), false);
  assert.equal(allowed({ kind: 'condition.add', participantId: THEIRS.id, key: 'prone' }), false);
  // A creature's conditions are the DM's to set, too.
  assert.equal(allowed({ kind: 'condition.add', participantId: GOBLIN.id, key: 'prone' }), false);
});

test('a player may only end their own turn', () => {
  assert.ok(canPlayerIssue({ kind: 'turn.next' }, FIGHT, OWNED).allowed);

  const notTheirs: CombatInstance = { ...FIGHT, activeParticipantId: THEIRS.id };
  const verdict = canPlayerIssue({ kind: 'turn.next' }, notTheirs, OWNED);
  assert.equal(verdict.allowed, false);
  assert.match(verdict.reason ?? '', /own turn/);
});

test('every command kind is one the permission rule has an answer for', () => {
  // A kind added later is refused by having said nothing, which is the safe direction — but
  // it should be a deliberate choice rather than an oversight, so the list is walked.
  for (const kind of COMMAND_KINDS) {
    const verdict = canPlayerIssue({ kind } as never, FIGHT, OWNED);
    assert.equal(typeof verdict.allowed, 'boolean', `${kind} has no verdict`);
  }
});
