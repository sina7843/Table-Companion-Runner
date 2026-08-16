/**
 * Starting a fight.
 *
 * The rule the whole slice rests on is the last test: a template goes into a combat and
 * comes back out unchanged, however much the fight is edited on the way.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFixtureRepositories } from '../../domain/data/fixtureRepositories.ts';
import { requireRuleset } from '../../domain/ruleset/registry.ts';
import {
  id,
  type CombatInstance,
  type CombatParticipant,
  type ParticipantId,
} from '../../domain/types.ts';
import {
  beginCombat,
  groupParticipants,
  removeParticipants,
  renameParticipant,
  rollInitiative,
  setInitiative,
  setupIssues,
  setVisibility,
} from './setup.ts';

const SYSTEM = id<'GameSystem'>('dnd5e-2024');
const LMOP = id<'Campaign'>('c-lmop');
const rules = requireRuleset(SYSTEM);
const repos = createFixtureRepositories();

/** A d20 that always shows `value`, without sitting on a bucket boundary. */
const fixedRandom = (value: number) => () => (value - 0.5) / 20;

const dexterous = () => [{ key: 'dex', label: 'DEX', value: 18 }];

function participant(
  name: string,
  entityType: CombatParticipant['entityType'],
  extra: Partial<CombatParticipant> = {},
): CombatParticipant {
  return {
    id: id<'CombatParticipant'>(`p-${name.toLowerCase().replaceAll(/\W+/g, '-')}`),
    name,
    subtitle: '',
    entityType,
    initiative: null,
    health: { current: 10, max: 10, temporary: 0 },
    conditions: [],
    state: 'waiting',
    visibility: 'party',
    source:
      entityType === 'player'
        ? { kind: 'character', characterId: id<'Character'>('ch-aria') }
        : { kind: 'monster', monsterId: id<'Monster'>('m-goblin') },
    ...extra,
  };
}

function fight(...participants: CombatParticipant[]): CombatInstance {
  return {
    id: id<'CombatInstance'>('cb-test'),
    campaignId: LMOP,
    name: 'Test fight',
    status: 'preparing',
    round: 0,
    activeParticipantId: null,
    participants,
  };
}

const goblins = [1, 2, 3, 4].map((index) =>
  participant(`Goblin #${index}`, 'monster', { groupKey: 'm-goblin' }),
);

/* ── Grouping ───────────────────────────────────────────────────────────────── */

test('identical creatures are one row and one turn', () => {
  const groups = groupParticipants(fight(...goblins, participant('Aria', 'player')));

  assert.equal(groups.length, 2, 'four goblins are one row, not four');
  assert.equal(groups[0]?.name, 'Goblin ×4');
  assert.equal(groups[0]?.members.length, 4);
  assert.equal(groups[1]?.name, 'Aria');
});

test('a row reports one initiative only when its members agree', () => {
  const combat = fight(...goblins);
  const ids = goblins.map((entry) => entry.id);

  assert.equal(groupParticipants(combat)[0]?.initiative, null, 'nothing rolled yet');

  const rolled = setInitiative(combat, ids, 14);
  assert.equal(groupParticipants(rolled)[0]?.initiative, 14);

  // One goblin given its own count breaks the shared number rather than hiding it.
  const split = setInitiative(rolled, [ids[0]!], 3);
  assert.equal(groupParticipants(split)[0]?.initiative, null);
});

/* ── Pre-start adjustments ──────────────────────────────────────────────────── */

test('setting a row sets every member of it', () => {
  const combat = setInitiative(
    fight(...goblins),
    goblins.map((entry) => entry.id),
    17,
  );
  assert.ok(combat.participants.every((entry) => entry.initiative === 17));
});

test('renaming and hiding touch only who they were pointed at', () => {
  const combat = fight(...goblins, participant('Aria', 'player'));
  const first = goblins[0]!.id;

  const named = renameParticipant(combat, first, 'Goblin on the ridge');
  assert.equal(named.participants[0]?.name, 'Goblin on the ridge');
  assert.equal(named.participants[1]?.name, 'Goblin #2');

  const hidden = setVisibility(named, [first], 'private');
  assert.equal(hidden.participants[0]?.visibility, 'private');
  assert.ok(hidden.participants.slice(1).every((entry) => entry.visibility === 'party'));
});

test('removing a combatant takes it out of the fight and off the turn', () => {
  const aria = participant('Aria', 'player');
  const combat: CombatInstance = { ...fight(...goblins, aria), activeParticipantId: aria.id };

  const without = removeParticipants(combat, [aria.id]);
  assert.equal(without.participants.length, 4);
  assert.equal(without.activeParticipantId, null, 'the turn cannot point at nobody');

  // Removing someone else leaves the turn where it was.
  const stillOn = removeParticipants(combat, [goblins[0]!.id]);
  assert.equal(stillOn.activeParticipantId, aria.id);
});

/* ── Rolling ────────────────────────────────────────────────────────────────── */

test('initiative is rolled once per row, not once per creature', () => {
  const rolled = rollInitiative(fight(...goblins), rules, () => [], fixedRandom(11));

  const values = new Set(rolled.participants.map((entry) => entry.initiative));
  assert.equal(values.size, 1, 'eight goblins acting on eight counts is what grouping prevents');
  assert.equal(rolled.participants[0]?.initiative, 11);
});

test('rolling what is missing leaves what a DM already typed alone', () => {
  const aria = participant('Aria', 'player');
  const typed = setInitiative(fight(...goblins, aria), [aria.id], 20);

  const filled = rollInitiative(typed, rules, () => [], fixedRandom(5));
  assert.equal(
    filled.participants.find((entry) => entry.id === aria.id)?.initiative,
    20,
    'a stated number is not a gap to fill',
  );
  assert.equal(filled.participants[0]?.initiative, 5);

  // Re-rolling all is the explicit opt-in that does overwrite it.
  const rerolled = rollInitiative(typed, rules, () => [], fixedRandom(9), false);
  assert.equal(rerolled.participants.find((entry) => entry.id === aria.id)?.initiative, 9);
});

test('the roll includes the ability modifier the ruleset asks for', () => {
  const aria = participant('Aria', 'player');
  const rolled = rollInitiative(fight(aria), rules, dexterous, fixedRandom(10));
  assert.equal(rolled.participants[0]?.initiative, 14, 'a 10 with +4 Dexterity');
});

/* ── Readiness ──────────────────────────────────────────────────────────────── */

test('an empty fight blocks; an unrolled or player-less one only warns', () => {
  const empty = setupIssues(fight());
  assert.deepEqual(
    empty.map((issue) => issue.severity),
    ['blocking'],
  );

  const unrolled = setupIssues(fight(...goblins));
  assert.ok(unrolled.every((issue) => issue.severity === 'warning'));
  assert.ok(unrolled.some((issue) => issue.message.includes('1 row has no initiative')));
  assert.ok(unrolled.some((issue) => issue.message.includes('No characters')));

  const ready = setupIssues(
    setInitiative(
      fight(...goblins, participant('Aria', 'player')),
      [...goblins.map((entry) => entry.id), id<'CombatParticipant'>('p-aria')],
      12,
    ),
  );
  assert.deepEqual(ready, []);
});

/* ── Round 1 ────────────────────────────────────────────────────────────────── */

test('beginning sorts by initiative and puts the first combatant on turn', () => {
  const aria = participant('Aria', 'player');
  const bram = participant('Bram', 'player');

  let combat = fight(...goblins, aria, bram);
  combat = setInitiative(
    combat,
    goblins.map((entry) => entry.id),
    15,
  );
  combat = setInitiative(combat, [aria.id], 21);
  combat = setInitiative(combat, [bram.id], 4);

  const live = beginCombat(combat, rules, '2026-08-15T19:00:00.000Z');

  assert.equal(live.status, 'live');
  assert.equal(live.round, 1);
  assert.equal(live.startedAt, '2026-08-15T19:00:00.000Z');
  assert.deepEqual(
    live.participants.map((entry) => entry.name),
    ['Aria', 'Goblin #1', 'Goblin #2', 'Goblin #3', 'Goblin #4', 'Bram'],
  );
  assert.equal(live.activeParticipantId, aria.id);
  assert.equal(live.participants[0]?.state, 'active');
  assert.ok(live.participants.slice(1).every((entry) => entry.state === 'waiting'));
});

test('a tie puts characters first, and nobody who has not rolled goes before someone who has', () => {
  const aria = participant('Aria', 'player');
  const unrolled = participant('Skeleton', 'monster');

  let combat = fight(...goblins, aria, unrolled);
  combat = setInitiative(combat, [...goblins.map((entry) => entry.id), aria.id], 12);

  const order = rules.initiativeOrder(combat.participants).map((entry) => entry.name);
  assert.equal(order[0], 'Aria', 'the character wins the tie');
  assert.equal(order.at(-1), 'Skeleton', 'no roll means last, not a zero that beats a −1');
});

/* ── The template is untouched ──────────────────────────────────────────────── */

test('a whole start-combat flow leaves the encounter template exactly as it was', async () => {
  const templates = await repos.encounters.listForCampaign(LMOP);
  const template = templates.find((entry) => entry.name === 'Wolves on the road');
  assert.ok(template);

  const before = structuredClone({ ...template, lastRunAt: undefined });

  const combat = await repos.combats.startFromTemplate(template.id);

  // Everything a DM can do on the setup screen, then round 1.
  let edited = rollInitiative(combat, rules, () => [], fixedRandom(13));
  edited = renameParticipant(edited, edited.participants[0]!.id, 'The big one');
  edited = setVisibility(edited, [edited.participants[0]!.id as ParticipantId], 'private');
  edited = removeParticipants(edited, [edited.participants[1]!.id as ParticipantId]);
  edited = beginCombat(edited, rules, '2026-08-15T20:00:00.000Z');
  await repos.combats.save(edited);

  const after = await repos.encounters.byId(template.id);
  assert.ok(after);
  // lastRunAt is a note about the template; nothing else may have moved.
  assert.deepEqual({ ...after, lastRunAt: undefined, updatedAt: before.updatedAt }, before);

  // And the fight really did keep the edits.
  const saved = await repos.combats.byId(combat.id);
  assert.equal(saved?.status, 'live');
  assert.equal(saved?.round, 1);
  assert.equal(saved?.participants.length, combat.participants.length - 1);
  assert.ok(saved?.participants.some((entry) => entry.name === 'The big one'));
});
