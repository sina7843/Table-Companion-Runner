/**
 * The builder's composition rules.
 *
 * Every one of these is what a DM does with a mouse or a keyboard — add, adjust, hide,
 * remove, include, merge — so they are checked as data transforms rather than through the
 * screen. None of them may mutate the template they were handed.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFixtureRepositories } from '../../domain/data/fixtureRepositories.ts';
import { id, type EncounterTemplate, type Monster } from '../../domain/types.ts';
import {
  MAX_PER_GROUP,
  addCreature,
  mergeRoster,
  patchEntry,
  removeEntry,
  searchCreatures,
  setPresent,
} from './composition.ts';

const LMOP = id<'Campaign'>('c-lmop');
const GOBLIN = id<'Monster'>('m-goblin');
const BUGBEAR = id<'Monster'>('m-bugbear');
const repos = createFixtureRepositories();

const blank = (): EncounterTemplate => ({
  id: id<'EncounterTemplate'>('e-test'),
  campaignId: LMOP,
  name: 'Untitled encounter',
  entries: [],
});

test('adding is one action, and adding again raises the count', () => {
  const once = addCreature(blank(), GOBLIN);
  assert.equal(once.entries.length, 1);
  assert.equal(once.entries[0]?.count, 1);

  const twice = addCreature(once, GOBLIN);
  assert.equal(twice.entries.length, 1, 'the same creature does not get a second row');
  assert.equal(twice.entries[0]?.count, 2);

  const other = addCreature(twice, BUGBEAR);
  assert.equal(other.entries.length, 2);
});

test('a group cannot be pushed past the cap by clicking add', () => {
  let encounter = addCreature(blank(), GOBLIN);
  for (let index = 0; index < 40; index += 1) encounter = addCreature(encounter, GOBLIN);
  assert.equal(encounter.entries[0]?.count, MAX_PER_GROUP);
});

test('a typed quantity is clamped rather than believed', () => {
  const encounter = addCreature(blank(), GOBLIN);
  const entryId = encounter.entries[0]!.id;

  assert.equal(patchEntry(encounter, entryId, { count: 0 }).entries[0]?.count, 1);
  assert.equal(patchEntry(encounter, entryId, { count: -7 }).entries[0]?.count, 1);
  assert.equal(patchEntry(encounter, entryId, { count: 999 }).entries[0]?.count, MAX_PER_GROUP);
  assert.equal(patchEntry(encounter, entryId, { count: 3.6 }).entries[0]?.count, 4);
});

test('hiding a group is a flag on the entry, and leaves its count alone', () => {
  const seeded = addCreature(addCreature(blank(), GOBLIN), GOBLIN);
  const entryId = seeded.entries[0]!.id;

  const hidden = patchEntry(seeded, entryId, { hidden: true });
  assert.equal(hidden.entries[0]?.hidden, true);
  assert.equal(hidden.entries[0]?.count, seeded.entries[0]?.count);

  assert.equal(patchEntry(hidden, entryId, { hidden: false }).entries[0]?.hidden, false);
});

test('removing takes out one group and nothing else', () => {
  const encounter = addCreature(addCreature(blank(), GOBLIN), BUGBEAR);
  const goblins = encounter.entries.find((entry) => entry.monsterId === GOBLIN)!;

  const after = removeEntry(encounter, goblins.id);
  assert.deepEqual(
    after.entries.map((entry) => entry.monsterId),
    [BUGBEAR],
  );
});

test('every transform leaves the template it was given untouched', () => {
  const encounter = addCreature(blank(), GOBLIN);
  const before = structuredClone(encounter);
  const entryId = encounter.entries[0]!.id;

  addCreature(encounter, GOBLIN);
  patchEntry(encounter, entryId, { count: 9, hidden: true });
  removeEntry(encounter, entryId);
  setPresent(encounter, id<'Character'>('ch-aria'), false);
  mergeRoster(encounter, { ...blank(), entries: [{ id: 'x', monsterId: BUGBEAR, count: 2 }] });

  assert.deepEqual(encounter, before);
});

test('a character sitting one out is recorded as absent, not deleted', () => {
  const aria = id<'Character'>('ch-aria');
  const bram = id<'Character'>('ch-bram');

  const split = setPresent(setPresent(blank(), aria, false), bram, false);
  assert.deepEqual(split.absentCharacterIds?.toSorted(), [aria, bram].toSorted());

  const back = setPresent(split, aria, true);
  assert.deepEqual(back.absentCharacterIds, [bram]);

  // Marking someone present who never left changes nothing.
  assert.deepEqual(setPresent(back, aria, true).absentCharacterIds, [bram]);
});

test('merging a saved encounter folds counts together and copies its rows', () => {
  const target = addCreature(blank(), GOBLIN);
  const source: EncounterTemplate = {
    ...blank(),
    id: id<'EncounterTemplate'>('e-source'),
    entries: [
      { id: 's1', monsterId: GOBLIN, count: 4 },
      { id: 's2', monsterId: BUGBEAR, count: 2, hidden: true },
    ],
  };

  const merged = mergeRoster(target, source);
  assert.equal(merged.entries.find((entry) => entry.monsterId === GOBLIN)?.count, 5);

  const bugbears = merged.entries.find((entry) => entry.monsterId === BUGBEAR);
  assert.equal(bugbears?.count, 2);
  assert.equal(bugbears?.hidden, true, 'a hidden group stays hidden when it is reused');
  assert.notEqual(bugbears?.id, 's2', 'the copied row gets its own entry id');

  // Editing the merge must not reach back into the encounter it was taken from.
  assert.equal(source.entries[1]?.count, 2);
});

test('merging cannot push a group past the cap either', () => {
  const target = { ...blank(), entries: [{ id: 'a', monsterId: GOBLIN, count: 18 }] };
  const merged = mergeRoster(target, {
    ...blank(),
    entries: [{ id: 'b', monsterId: GOBLIN, count: 9 }],
  });
  assert.equal(merged.entries[0]?.count, MAX_PER_GROUP);
});

test('search is forgiving and bounded', async () => {
  const creatures: Monster[] = await repos.monsters.list();

  // Case and stray spaces are the DM's typing, not a filter.
  const goblins = searchCreatures(creatures, '  GOB ');
  assert.deepEqual(
    goblins.map((monster) => monster.name).toSorted(),
    searchCreatures(creatures, 'gob')
      .map((monster) => monster.name)
      .toSorted(),
  );
  assert.ok(goblins.some((monster) => monster.name === 'Goblin'));
  assert.ok(goblins.some((monster) => monster.name === 'Goblin Boss'));

  // An empty term is every creature, capped so a long library cannot stall the rail.
  assert.equal(searchCreatures(creatures, '', 5).length, 5);
  assert.equal(searchCreatures(creatures, '   ').length, Math.min(60, creatures.length));
});
