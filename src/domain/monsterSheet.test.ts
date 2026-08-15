/**
 * The monster sheet: grouped actions, roll affordances and the volume a real creature
 * carries at the top of the range.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFixtureRepositories } from './data/fixtureRepositories.ts';
import { requireRuleset } from './ruleset/registry.ts';
import { id, type Monster } from './types.ts';

const SYSTEM = id<'GameSystem'>('dnd5e-2024');
const rules = requireRuleset(SYSTEM);
const repos = createFixtureRepositories();

async function monster(name: string): Promise<Monster> {
  const all = await repos.monsters.list();
  const found = all.find((entry) => entry.name === name);
  assert.ok(found, `fixture creature "${name}" is missing`);
  return found;
}

test('every creature can be run, not merely picked', async () => {
  // Speed and senses are what a DM needs to actually use a creature at the table, so no
  // entry may be missing them however minor it is.
  for (const entry of await repos.monsters.list()) {
    const keys = entry.derived.map((value) => value.key);
    assert.ok(keys.includes('ac'), `${entry.name} has no armour class`);
    assert.ok(keys.includes('speed'), `${entry.name} has no speed`);
    assert.ok(keys.includes('senses'), `${entry.name} has no senses`);
    assert.ok(entry.actionGroups.length > 0, `${entry.name} has nothing it can do`);
  }
});

test('a high-difficulty creature carries reactions and legendary actions', async () => {
  const dragon = await monster('Adult Black Dragon');
  const groups = rules.monsterActionGroups(dragon).map((group) => group.key);

  assert.deepEqual(groups, ['actions', 'legendary', 'reactions']);

  // The count qualifier travels with the group rather than living in prose.
  const legendary = rules.monsterActionGroups(dragon).find((group) => group.key === 'legendary');
  assert.equal(legendary?.note, '3 per round');
});

test('a minor creature is not given legendary actions it does not have', async () => {
  const goblin = await monster('Goblin');
  const groups = rules.monsterActionGroups(goblin).map((group) => group.key);

  // Uniform-looking data would be worse than honest data.
  assert.deepEqual(groups, ['actions']);
});

test('every attack arrives with a rollable expression', async () => {
  const dragon = await monster('Adult Black Dragon');
  const groups = rules.monsterActionGroups(dragon);

  const bite = groups[0]?.entries.find((entry) => entry.name === 'Bite');
  const attack = bite?.rolls?.find((roll) => roll.label === 'Attack');
  const damage = bite?.rolls?.find((roll) => roll.label === 'Damage');

  assert.equal(attack?.expression, '1d20 +11');
  // The damage type is stripped from the expression but stays on the row for reading.
  assert.equal(damage?.expression, '2d10 + 6');
  assert.equal(bite?.damage, '2d10 + 6 piercing');
});

test('an action with no attack or damage still renders without inventing a roll', async () => {
  const dragon = await monster('Adult Black Dragon');
  const multiattack = rules
    .monsterActionGroups(dragon)[0]
    ?.entries.find((entry) => entry.name === 'Multiattack');

  assert.ok(multiattack);
  assert.equal(multiattack.rolls, undefined);
});

test('a pre-built roll is left alone rather than recomputed', async () => {
  const dragon = await monster('Adult Black Dragon');
  const detect = rules
    .monsterActionGroups(dragon)
    .find((group) => group.key === 'legendary')
    ?.entries.find((entry) => entry.name === 'Detect');

  // Detect rolls Perception, which is not derivable from an attack bonus.
  assert.deepEqual(detect?.rolls, [{ label: 'Perception', expression: '1d20 +11' }]);
});

test('resource state travels with the action rather than a DM’s memory', async () => {
  const dragon = await monster('Adult Black Dragon');
  const entries = rules.monsterActionGroups(dragon)[0]?.entries ?? [];

  const breath = entries.find((entry) => entry.name === 'Acid Breath');
  assert.deepEqual(breath?.tags, ['Recharge 5–6']);

  const presence = entries.find((entry) => entry.name === 'Frightful Presence');
  assert.deepEqual(presence?.tags, ['1 per day']);
});

test('spells are a group like any other, with their tier on each entry', async () => {
  const flayer = await monster('Mind Flayer');
  const spells = rules.monsterActionGroups(flayer).find((group) => group.key === 'spells');

  assert.ok(spells, 'a caster creature has a spell group');
  assert.equal(spells.note, 'Intelligence, DC 15');
  assert.ok(spells.entries.every((entry) => entry.tier !== undefined));
  assert.ok(spells.entries.some((entry) => entry.tier === 'At will'));
  assert.ok(spells.entries.some((entry) => entry.tier === '1 per day'));
});

test('a creature with many actions stays one flat pass, not a nested walk', async () => {
  const beholder = await monster('Beholder');
  const groups = rules.monsterActionGroups(beholder);
  const total = groups.reduce((sum, group) => sum + group.entries.length, 0);

  // The eye-ray creature is the volume case the sheet has to stay readable under.
  assert.ok(total >= 8, 'the Beholder should carry its full ray list');
  assert.ok(groups.every((group) => Array.isArray(group.entries)));
});

test('homebrew reaches the sheet with the same shape as printed content', async () => {
  const ambusher = await monster('Cragmaw Ambusher');
  const groups = rules.monsterActionGroups(ambusher);

  assert.equal(groups.length, 1);
  const shortsword = groups[0]?.entries[0];
  assert.equal(shortsword?.rolls?.[0]?.expression, '1d20 +5');
});

test('an instance is not the template it came from', async () => {
  // Editing a creature in a fight must never touch the library record. The sheet takes
  // instance health as a prop rather than reading the monster, and this pins the shape
  // that makes that possible.
  const goblin = await monster('Goblin');
  const instance = { ...goblin, health: { current: 3, max: goblin.health.max, temporary: 0 } };

  assert.equal(goblin.health.current, goblin.health.max, 'the library entry stays untouched');
  assert.notEqual(instance.health.current, goblin.health.current);
});
