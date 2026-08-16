/**
 * Damage, healing, targeting, conditions, concentration and death saves.
 *
 * The flow the prompt names — attack, damage, target, apply, hit points move — is the last
 * test here, driven end to end through the ruleset without a screen.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requireRuleset } from '../../domain/ruleset/registry.ts';
import { id, type CombatInstance, type CombatParticipant } from '../../domain/types.ts';
import {
  addCondition,
  applyDeathSave,
  applyHealth,
  overrideHealth,
  overrideState,
  removeCondition,
  reopenCombat,
  revertHealth,
  setTargeted,
  targetedParticipant,
} from './actions.ts';

const rules = requireRuleset(id<'GameSystem'>('dnd5e-2024'));

/** A d20 that always shows `value`, without sitting on a bucket boundary. */
const fixedRandom = (value: number) => () => (value - 0.5) / 20;

function combatant(
  name: string,
  entityType: CombatParticipant['entityType'],
  extra: Partial<CombatParticipant> = {},
): CombatParticipant {
  return {
    id: id<'CombatParticipant'>(`p-${name.toLowerCase()}`),
    name,
    subtitle: '',
    entityType,
    initiative: 10,
    health: { current: 20, max: 20, temporary: 0 },
    conditions: [],
    state: 'waiting',
    visibility: 'party',
    source: { kind: 'monster', monsterId: id<'Monster'>('m-goblin') },
    ...extra,
  };
}

function fight(...participants: CombatParticipant[]): CombatInstance {
  return {
    id: id<'CombatInstance'>('cb-actions'),
    campaignId: id<'Campaign'>('c-lmop'),
    name: 'Actions',
    status: 'live',
    round: 1,
    activeParticipantId: null,
    participants,
  };
}

const goblin = combatant('Goblin', 'monster');
const aria = combatant('Aria', 'player', {
  source: { kind: 'character', characterId: id<'Character'>('ch-aria') },
});

/* ── Damage and healing ─────────────────────────────────────────────────────── */

test('damage lands immediately, with no approval step in the way', () => {
  const { combat, change } = applyHealth(fight(goblin), goblin.id, -7, rules);

  assert.equal(combat.participants[0]?.health.current, 13);
  assert.equal(change?.delta, -7);
  assert.equal(change?.before.current, 20, 'undo restores rather than recomputes');
});

test('temporary hit points absorb before the real ones, as the ruleset says', () => {
  const shielded = combatant('Shielded', 'monster', {
    health: { current: 20, max: 20, temporary: 5 },
  });
  const { combat } = applyHealth(fight(shielded), shielded.id, -8, rules);

  assert.equal(combat.participants[0]?.health.temporary, 0);
  assert.equal(combat.participants[0]?.health.current, 17);
});

test('a character at zero goes unconscious and starts a tally; a creature is out', () => {
  const down = applyHealth(fight(aria), aria.id, -50, rules).combat;
  assert.equal(down.participants[0]?.state, 'unconscious');
  assert.deepEqual(down.participants[0]?.deathSaves, { successes: 0, failures: 0 });

  const dead = applyHealth(fight(goblin), goblin.id, -50, rules).combat;
  assert.equal(dead.participants[0]?.state, 'defeated');
  assert.equal(dead.participants[0]?.deathSaves, undefined, 'a goblin does not roll saves');
});

test('healing above zero brings someone back and clears the tally', () => {
  const down = applyHealth(fight(aria), aria.id, -50, rules).combat;
  const up = applyHealth(down, aria.id, 6, rules).combat;

  assert.equal(up.participants[0]?.health.current, 6);
  assert.equal(up.participants[0]?.state, 'waiting');
  assert.equal(up.participants[0]?.deathSaves, undefined);
});

test('undo puts the track back exactly, including the state it was in', () => {
  const before = fight(aria);
  const { combat, change } = applyHealth(before, aria.id, -50, rules);
  assert.ok(change);

  const back = revertHealth(combat, change);
  assert.deepEqual(back.participants[0]?.health, before.participants[0]?.health);
  assert.equal(back.participants[0]?.state, 'waiting');
  assert.equal(back.participants[0]?.deathSaves, undefined);
});

/* ── Targeting ──────────────────────────────────────────────────────────────── */

test('exactly one combatant is targeted, and targeting it again clears it', () => {
  const combat = fight(goblin, aria);

  const first = setTargeted(combat, goblin.id);
  assert.equal(targetedParticipant(first)?.name, 'Goblin');

  const second = setTargeted(first, aria.id);
  assert.equal(targetedParticipant(second)?.name, 'Aria');
  assert.ok(!second.participants[0]?.targeted, 'the next damage is singular');

  assert.equal(targetedParticipant(setTargeted(second, aria.id)), null);
});

/* ── Conditions ─────────────────────────────────────────────────────────────── */

test('a condition is added once and removed by key', () => {
  const poisoned = rules.conditions.find((entry) => entry.key === 'poisoned');
  assert.ok(poisoned);

  const once = addCondition(fight(goblin), goblin.id, poisoned, '2 rounds');
  assert.equal(once.participants[0]?.conditions.length, 1);
  assert.equal(once.participants[0]?.conditions[0]?.duration, '2 rounds');

  const twice = addCondition(once, goblin.id, poisoned);
  assert.equal(twice.participants[0]?.conditions.length, 1, 'no duplicates');

  assert.deepEqual(removeCondition(twice, goblin.id, 'poisoned').participants[0]?.conditions, []);
});

/* ── Concentration ──────────────────────────────────────────────────────────── */

test('damage to someone concentrating asks the ruleset for a save', () => {
  const key = rules.concentrationKey();
  assert.ok(key);

  const caster = combatant('Thessaly', 'player', {
    source: { kind: 'character', characterId: id<'Character'>('ch-thessaly') },
  });
  const holding = addCondition(fight(caster), caster.id, {
    key,
    label: 'Hex',
    tone: 'concentration',
    icon: 'brain',
    description: '',
  });

  const hit = applyHealth(holding, caster.id, -9, rules);
  assert.ok(hit.concentration, 'the screen is told to roll');
  assert.equal(hit.concentration.damage, 9);

  // The difficulty is the system's: half the damage, floored at ten.
  assert.equal(rules.concentrationCheck(9)?.difficulty, 10);
  assert.equal(rules.concentrationCheck(30)?.difficulty, 15);

  // Nobody concentrating means nothing to ask.
  assert.equal(applyHealth(fight(goblin), goblin.id, -9, rules).concentration, null);
  assert.equal(
    applyHealth(holding, caster.id, 5, rules).concentration,
    null,
    'healing is not a hit',
  );
});

/* ── Death saves ────────────────────────────────────────────────────────────── */

function downed() {
  return applyHealth(fight(aria), aria.id, -50, rules).combat;
}

function saveWith(natural: number) {
  const request = rules.deathSaveRequest();
  assert.ok(request);
  return rules.evaluateRoll(request, 0, fixedRandom(natural));
}

test('a death save above the target succeeds and below it fails', () => {
  const success = applyDeathSave(downed(), aria.id, saveWith(14), rules);
  assert.deepEqual(success.combat.participants[0]?.deathSaves, { successes: 1, failures: 0 });
  assert.equal(success.outcome, 'pending');

  const failure = applyDeathSave(downed(), aria.id, saveWith(6), rules);
  assert.deepEqual(failure.combat.participants[0]?.deathSaves, { successes: 0, failures: 1 });
});

test('a natural 1 costs two failures and a natural 20 gets them up', () => {
  const fumbled = applyDeathSave(downed(), aria.id, saveWith(1), rules);
  assert.deepEqual(fumbled.combat.participants[0]?.deathSaves, { successes: 0, failures: 2 });

  const revived = applyDeathSave(downed(), aria.id, saveWith(20), rules);
  assert.equal(revived.revived, true);
  assert.equal(revived.combat.participants[0]?.health.current, 1);
  assert.equal(revived.combat.participants[0]?.state, 'waiting');
  assert.equal(revived.combat.participants[0]?.deathSaves, undefined);
});

test('three failures is dead, three successes is stable', () => {
  let combat = downed();
  for (let index = 0; index < 3; index += 1) {
    combat = applyDeathSave(combat, aria.id, saveWith(6), rules).combat;
  }
  assert.equal(combat.participants[0]?.state, 'defeated');

  let stable = downed();
  let outcome = 'pending';
  for (let index = 0; index < 3; index += 1) {
    const result = applyDeathSave(stable, aria.id, saveWith(14), rules);
    stable = result.combat;
    outcome = result.outcome;
  }
  assert.equal(outcome, 'stable');
  assert.equal(stable.participants[0]?.state, 'unconscious', 'stable is still down, not up');
});

/* ── The flow the prompt names ──────────────────────────────────────────────── */

test('attack, damage, target, apply — hit points move, end to end', () => {
  // A fighter with a longsword, straight out of the ruleset rather than made up here.
  const attack = { label: 'Attack', expression: '1d20 + 6' };
  const damage = { label: 'Damage', expression: '1d8 + 4' };

  const attackRoll = rules.evaluateRoll(
    { expression: attack.expression, mode: 'normal', title: 'Longsword attack' },
    0,
    fixedRandom(17),
  );
  assert.equal(attackRoll.total, 23, '17 plus 6');

  // The DM targets the goblin, then rolls damage.
  let combat = setTargeted(fight(goblin, aria), goblin.id);
  const targeted = targetedParticipant(combat);
  assert.equal(targeted?.name, 'Goblin');

  const damageRoll = rules.evaluateRoll(
    { expression: damage.expression, mode: 'normal', title: 'Longsword damage' },
    0,
    () => 0.99,
  );
  assert.equal(damageRoll.total, 12, 'an 8 plus 4');

  const applied = applyHealth(combat, targeted!.id, -damageRoll.total, rules);
  combat = applied.combat;

  assert.equal(combat.participants[0]?.health.current, 8, 'the target took it immediately');
  assert.equal(applied.change?.name, 'Goblin', 'and the undo can name what it will put back');
});

/* ── DM overrides and recovery ──────────────────────────────────────────────── */

test('an override states the number rather than applying a delta', () => {
  const shielded = combatant('Shielded', 'monster', {
    health: { current: 20, max: 20, temporary: 5 },
  });

  // A delta of −8 would eat the temporary hit points first; an override does not.
  const set = overrideHealth(fight(shielded), shielded.id, 12);
  assert.equal(set.combat.participants[0]?.health.current, 12);
  assert.equal(set.combat.participants[0]?.health.temporary, 5, 'temporary points are untouched');
  assert.equal(set.change?.delta, -8, 'and it is still reversible by name');
  assert.equal(set.concentration, null, 'stating a number is not a hit');
});

test('an override is clamped to the track it is setting', () => {
  assert.equal(
    overrideHealth(fight(goblin), goblin.id, 999).combat.participants[0]?.health.current,
    20,
  );
  assert.equal(
    overrideHealth(fight(goblin), goblin.id, -5).combat.participants[0]?.health.current,
    0,
  );
});

test('an override to zero downs a character and back up clears the tally', () => {
  const down = overrideHealth(fight(aria), aria.id, 0).combat;
  assert.equal(down.participants[0]?.state, 'unconscious');
  assert.deepEqual(down.participants[0]?.deathSaves, { successes: 0, failures: 0 });

  const up = overrideHealth(down, aria.id, 9).combat;
  assert.equal(up.participants[0]?.state, 'waiting');
  assert.equal(up.participants[0]?.deathSaves, undefined);
});

test('an override can be undone like any other change', () => {
  const before = fight(aria);
  const { combat, change } = overrideHealth(before, aria.id, 3);
  assert.ok(change);

  assert.deepEqual(revertHealth(combat, change).participants[0], before.participants[0]);
});

test('state can be set by hand for the cases the rules do not cover', () => {
  const surrendered = overrideState(fight(goblin), goblin.id, 'defeated');
  assert.equal(surrendered.participants[0]?.state, 'defeated');
  assert.equal(surrendered.participants[0]?.health.current, 20, 'hit points are not touched');

  // Putting someone back in the fight clears a tally they no longer need.
  const knocked = overrideState(fight(aria), aria.id, 'unconscious');
  assert.deepEqual(knocked.participants[0]?.deathSaves, { successes: 0, failures: 0 });
  assert.equal(overrideState(knocked, aria.id, 'waiting').participants[0]?.deathSaves, undefined);
});

test('reopening an ended fight keeps everything it accumulated', () => {
  const hurt = applyHealth(fight(goblin, aria), goblin.id, -13, rules).combat;
  const ended: CombatInstance = {
    ...hurt,
    status: 'ended',
    round: 4,
    activeParticipantId: null,
    endedAt: '2026-08-15T21:00:00.000Z',
  };

  const back = reopenCombat(ended);
  assert.equal(back.status, 'live');
  assert.equal(back.round, 4, 'the fight resumes where it stopped');
  assert.equal(back.endedAt, undefined);
  assert.equal(back.activeParticipantId, goblin.id);
  assert.equal(
    back.participants[0]?.health.current,
    7,
    'every hit point survives — restarting from the template would not',
  );
});

test('reopening a fight that is not ended changes nothing', () => {
  const live = fight(goblin);
  assert.deepEqual(reopenCombat(live), live);
});
