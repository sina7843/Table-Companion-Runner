/**
 * What a player's phone may show, and what it offers them to do.
 *
 * The first rule is the one that matters: a combatant the DM has not revealed is absent
 * from this device, not dimmed and not counted. The second is that the actions on the
 * thumb are the character's own, asked of the ruleset.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFixtureRepositories } from '../../domain/data/fixtureRepositories.ts';
import { requireRuleset } from '../../domain/ruleset/registry.ts';
import { viewerFor, type Viewer } from '../../domain/permissions.ts';
import { id, type Campaign, type CombatParticipant } from '../../domain/types.ts';
import {
  ACTIONS_ON_THE_THUMB,
  breakdownOf,
  damageRollFor,
  isLowHealth,
  ownParticipant,
  playerOrder,
  quickActions,
} from './turn.ts';

const rules = requireRuleset(id<'GameSystem'>('dnd5e-2024'));
const repos = createFixtureRepositories();
const COMBAT = id<'CombatInstance'>('cb-goblin-ambush');

const campaign: Campaign = {
  id: id<'Campaign'>('c-lmop'),
  name: 'Lost Mine of Phandelver',
  systemId: id<'GameSystem'>('dnd5e-2024'),
  dmUserId: id<'User'>('u-marta'),
  inviteCode: 'CRAGMAW-7742',
  members: [],
  createdAt: '2026-05-02T18:00:00.000Z',
};

const player: Viewer = { userId: id<'User'>('u-priya'), role: 'player' };
const dm = viewerFor(campaign, id<'User'>('u-marta'));

async function fight() {
  const combat = await repos.combats.byId(COMBAT);
  assert.ok(combat);
  return combat;
}

async function aria() {
  const roster = await repos.characters.listForCampaign(id<'Campaign'>('c-lmop'));
  const found = roster.find((entry) => entry.name === 'Aria Nightfall');
  assert.ok(found);
  return found;
}

/* ── What the phone may show ────────────────────────────────────────────────── */

test('an unrevealed creature is absent from the player order, not dimmed', async () => {
  const combat = await fight();

  const hidden = combat.participants.filter((entry) => entry.visibility === 'dm-only');
  assert.ok(hidden.length > 0, 'the fixture has something the DM has not revealed');

  const mine = playerOrder(combat, player);
  const theirs = playerOrder(combat, dm);

  assert.equal(theirs.length, combat.participants.length, 'the DM sees the whole order');
  assert.equal(mine.length, combat.participants.length - hidden.length);

  for (const secret of hidden) {
    assert.ok(
      !mine.some((entry) => entry.id === secret.id),
      `${secret.name} must not reach a player device`,
    );
  }
});

test('nothing in the player order hints that a row was removed', async () => {
  const combat = await fight();
  const mine = playerOrder(combat, player);

  // Every row a player sees is a whole participant, with no placeholder among them.
  assert.ok(mine.every((entry) => entry.name.length > 0));
  assert.ok(mine.every((entry) => entry.visibility !== 'dm-only' && entry.visibility !== 'secret'));
});

test('a player finds their own combatant, and nobody else is mistaken for it', async () => {
  const combat = await fight();
  const character = await aria();

  const me = ownParticipant(combat, character);
  assert.equal(me?.name, 'Aria Nightfall');
  assert.equal(ownParticipant(combat, null), null);

  // A character who is not in this fight has no participant, rather than the first row.
  const absent = { ...character, id: id<'Character'>('ch-nobody') };
  assert.equal(ownParticipant(combat, absent), null);
});

/* ── Low health ─────────────────────────────────────────────────────────────── */

test('low health is a quarter of the track, and zero is not low — it is down', () => {
  const at = (current: number, max: number): CombatParticipant => ({
    id: id<'CombatParticipant'>('p-test'),
    name: 'Test',
    subtitle: '',
    entityType: 'player',
    initiative: 10,
    health: { current, max, temporary: 0 },
    conditions: [],
    state: 'waiting',
    visibility: 'party',
    source: { kind: 'character', characterId: id<'Character'>('ch-aria') },
  });

  assert.equal(isLowHealth(at(10, 40)), true);
  assert.equal(isLowHealth(at(11, 40)), false);
  assert.equal(isLowHealth(at(1, 40)), true);
  assert.equal(isLowHealth(at(0, 40)), false, 'zero is unconscious, which says more than "low"');
  assert.equal(isLowHealth(null), false);
});

/* ── What the thumb is offered ──────────────────────────────────────────────── */

test('the quick actions are the character own rollables, without their damage rolls', async () => {
  const character = await aria();
  const actions = quickActions(rules, character);

  assert.ok(actions.length > 0, 'a fighter has something to do');
  assert.ok(
    actions.every((entry) => entry.label !== 'Damage'),
    'a damage button on its own is how damage gets rolled for an attack that missed',
  );
  assert.ok(actions.some((entry) => entry.label === 'Attack'));
  assert.ok(
    actions.every((entry) => /d\d/.test(entry.expression)),
    'each one is rollable',
  );
});

test('an attack knows the damage that follows it', async () => {
  const character = await aria();
  const attack = quickActions(rules, character).find((entry) => entry.label === 'Attack');
  assert.ok(attack);

  const damage = damageRollFor(rules, character, attack.entryKey);
  assert.ok(damage, 'the sheet resolves attack then damage without a second tap');
  assert.match(damage.expression, /d\d/);

  assert.equal(damageRollFor(rules, character, 'not-a-thing'), null);
});

test('four actions is what fits a thumb', async () => {
  const character = await aria();
  assert.equal(ACTIONS_ON_THE_THUMB, 4);
  assert.ok(quickActions(rules, character).slice(0, ACTIONS_ON_THE_THUMB).length <= 4);
});

/* ── The arithmetic stays checkable ─────────────────────────────────────────── */

test('a breakdown shows the kept dice and leaves a dropped one out of the sum', () => {
  assert.equal(breakdownOf([{ value: 17 }], 7), '17 + 7');
  assert.equal(breakdownOf([{ value: 6 }, { value: 5 }, { value: 9 }], 4), '6 + 5 + 9 + 4');
  assert.equal(breakdownOf([{ value: 3, dropped: true }, { value: 18 }], 7), '18 + 7');
  assert.equal(breakdownOf([{ value: 12 }], 0), '12');
  assert.equal(breakdownOf([{ value: 12 }], -1), '12 − 1');
});
