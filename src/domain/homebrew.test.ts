/**
 * Homebrew creatures: cloning, saving, and the rules that decide what a valid creature is.
 *
 * The fixture library is a module-level array, so every test here cleans up what it wrote.
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

const OWNER = id<'User'>('u-dm');

test('a hit-dice expression reads as its published average', () => {
  assert.equal(rules.hitPointsFromDice('2d6'), 7);
  assert.equal(rules.hitPointsFromDice('2d6 + 2'), 9);
  assert.equal(rules.hitPointsFromDice('17d12 - 17'), 93);
  // Case and spacing are how a DM actually types it.
  assert.equal(rules.hitPointsFromDice('4D8+4'), 22);
});

test('nonsense is refused rather than guessed at', () => {
  // Silently returning a number here would put a wrong hit-point total on a real creature.
  for (const expression of ['', 'lots', '2d', 'd6', '0d6', '2d1', '2d6 + ']) {
    assert.equal(rules.hitPointsFromDice(expression), null, `"${expression}" should be refused`);
  }
});

test('validation names the field that is wrong, not just that something is', async () => {
  const goblin = await monster('Goblin');
  const broken: Monster = {
    ...goblin,
    name: '   ',
    health: { current: 0, max: 0, temporary: 0 },
    derived: goblin.derived.map((value) => (value.key === 'ac' ? { ...value, value: 99 } : value)),
    attributes: goblin.attributes.map((entry) =>
      entry.key === 'str' ? { ...entry, value: 41 } : entry,
    ),
    actionGroups: [{ key: 'actions', label: 'Actions', entries: [] }],
  };

  const fields = rules.validateMonster(broken).map((issue) => issue.fieldKey);
  assert.deepEqual(fields.toSorted(), ['ability-str', 'ac', 'actions', 'hp', 'name']);
});

test('a creature straight out of the library is already valid', async () => {
  const dragon = await monster('Adult Black Dragon');
  assert.deepEqual(rules.validateMonster(dragon), []);
});

test('the difficulty estimate rises with what the creature can take', async () => {
  const goblin = await monster('Goblin');
  const tough: Monster = { ...goblin, health: { current: 200, max: 200, temporary: 0 } };

  const weak = rules.estimateChallenge(goblin);
  const strong = rules.estimateChallenge(tough);

  assert.ok(strong.rank > weak.rank, 'more hit points should not read as an easier fight');
  // The estimate has to explain itself; a bare number is not something a DM can argue with.
  assert.match(strong.detail, /200 hit points/);
  assert.match(strong.label, /^CR /);
});

test('normalising rebuilds what the rules own and keeps what the DM stated', async () => {
  const goblin = await monster('Goblin');
  const edited: Monster = {
    ...goblin,
    subtitle: 'whatever was there before',
    facets: { ...goblin.facets, size: ['Large'], type: ['Fiend'] },
    health: { current: 3, max: 44, temporary: 0 },
    attributes: goblin.attributes.map((entry) =>
      entry.key === 'str' ? { ...entry, value: 18, modifier: 0 } : entry,
    ),
  };

  const normalised = rules.normaliseMonster(edited);

  assert.equal(normalised.subtitle, 'Large fiend, neutral evil');
  assert.equal(normalised.attributes.find((entry) => entry.key === 'str')?.modifier, 4);
  // A creature outside a fight is at full health by definition.
  assert.equal(normalised.health.current, 44);
  assert.equal(normalised.derived.find((value) => value.key === 'hp')?.value, 44);
  // Speed is the DM's to state; nothing derives it.
  assert.equal(
    normalised.derived.find((value) => value.key === 'speed')?.value,
    goblin.derived.find((value) => value.key === 'speed')?.value,
  );
});

test('editing a clone cannot reach back into the creature it came from', async () => {
  const goblin = await monster('Goblin');
  const before = structuredClone(goblin);

  const clone = await repos.monsters.cloneFrom(goblin.id, OWNER, 'Priya');
  try {
    assert.notEqual(clone.id, goblin.id);
    assert.equal(clone.name, 'Goblin (copy)');
    assert.equal(clone.origin, 'homebrew');
    assert.equal(clone.clonedFrom, goblin.id);

    clone.attributes[0]!.value = 20;
    clone.actionGroups[0]!.entries.push({ name: 'Bite', description: 'Chomp.' });
    clone.facets.type!.push('Fiend');
    clone.health.max = 99;

    assert.deepEqual(goblin, before, 'the source creature must be untouched');
  } finally {
    await repos.monsters.remove(clone.id);
  }
});

test('a saved clone is findable in the library the DM searches', async () => {
  const goblin = await monster('Goblin');
  const clone = await repos.monsters.cloneFrom(goblin.id, OWNER, 'Priya');

  try {
    const renamed = await repos.monsters.save({ ...clone, name: 'Cragmaw Sharpshooter' });
    assert.equal(renamed.name, 'Cragmaw Sharpshooter');

    const found = await repos.monsters.list({ search: 'sharpshooter' });
    assert.deepEqual(
      found.map((entry) => entry.name),
      ['Cragmaw Sharpshooter'],
    );

    // The library's Homebrew filter is what a DM reaches for to find their own work.
    const mine = await repos.monsters.list({ origin: 'homebrew' });
    assert.ok(mine.some((entry) => entry.id === clone.id));
    assert.ok(mine.every((entry) => entry.origin === 'homebrew'));
  } finally {
    await repos.monsters.remove(clone.id);
  }

  assert.equal(await repos.monsters.byId(clone.id), null, 'removing a clone deletes it');
});

test('library content cannot be edited in place, only cloned', async () => {
  const goblin = await monster('Goblin');

  await assert.rejects(
    () => repos.monsters.save({ ...goblin, name: 'Goblin, but mine' }),
    /Clone it first/,
    'a DM must not be able to rewrite what the book says',
  );

  // The refusal has to be real, not merely a thrown message over a mutated record.
  assert.equal((await monster('Goblin')).name, 'Goblin');
});

test('a removed library creature stays put', async () => {
  const goblin = await monster('Goblin');
  await repos.monsters.remove(goblin.id);

  assert.ok(await repos.monsters.byId(goblin.id), 'library content survives a delete');
});

test('anything written is homebrew whatever it claims to be', async () => {
  const goblin = await monster('Goblin');
  const created = await repos.monsters.create({
    ...goblin,
    id: id<'Monster'>('m-test-forged'),
    name: 'Forged Library Entry',
    origin: 'library',
    ownerUserId: OWNER,
  });

  try {
    assert.equal(created.origin, 'homebrew');
    // Which means it can then be edited, unlike genuine library content.
    await repos.monsters.save({ ...created, name: 'Forged, renamed' });
  } finally {
    await repos.monsters.remove(created.id);
  }
});
