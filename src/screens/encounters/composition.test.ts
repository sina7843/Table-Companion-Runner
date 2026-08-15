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
import { id, type Character, type EncounterTemplate, type Monster } from '../../domain/types.ts';
import {
  MAX_PER_GROUP,
  addCreature,
  blockingIssues,
  mergeRoster,
  patchEntry,
  removeEntry,
  searchCreatures,
  setPresent,
  summarise,
  validateEncounter,
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

/* ── Summary and validation ─────────────────────────────────────────────────── */

const party = (count: number): Character[] =>
  Array.from({ length: count }, (_, index) => ({
    id: id<'Character'>(`ch-${index}`),
    systemId: id<'GameSystem'>('dnd5e-2024'),
    ownerUserId: id<'User'>('u-marta'),
    name: `Test ${index}`,
    subtitle: '',
    level: 5,
    attributes: [],
    resources: [],
    health: { current: 10, max: 10, temporary: 0 },
    conditions: [],
    sectionVisibility: {},
    systemData: {},
  }));

async function creature(name: string): Promise<Monster> {
  const all = await repos.monsters.list();
  const found = all.find((monster) => monster.name === name);
  assert.ok(found, `fixture creature "${name}" is missing`);
  return found;
}

test('the summary counts groups, creatures and everyone who will roll initiative', async () => {
  const goblin = await creature('Goblin');
  const bugbear = await creature('Bugbear');

  const encounter: EncounterTemplate = {
    ...blank(),
    entries: [
      { id: 'a', monsterId: goblin.id, count: 8 },
      { id: 'b', monsterId: bugbear.id, count: 4 },
    ],
  };
  const summary = summarise(
    encounter,
    [
      { monster: goblin, count: 8 },
      { monster: bugbear, count: 4 },
    ],
    party(4),
  );

  assert.equal(summary.creatures, 12);
  assert.equal(summary.groups, 2, 'twelve creatures are two rows, not twelve');
  assert.equal(summary.present, 4);
  assert.equal(summary.combatants, 16);
  assert.equal(summary.missing, 0);
});

test('a creature deleted from the library is counted as missing, not silently dropped', async () => {
  const goblin = await creature('Goblin');
  const encounter: EncounterTemplate = {
    ...blank(),
    entries: [
      { id: 'a', monsterId: goblin.id, count: 2 },
      { id: 'b', monsterId: id<'Monster'>('m-deleted'), count: 3 },
    ],
  };

  // The roster resolves only what still exists; the template still declares five.
  const summary = summarise(encounter, [{ monster: goblin, count: 2 }], party(4));
  assert.equal(summary.creatures, 2);
  assert.equal(summary.missing, 3);

  const issue = validateEncounter(encounter, summary).find((entry) => entry.severity === 'warning');
  assert.ok(issue);
  assert.match(issue.message, /3 creatures are/);
});

test('an empty or unnamed encounter cannot be started', () => {
  const summary = summarise(blank(), [], party(4));
  const stops = blockingIssues(validateEncounter(blank(), summary));
  assert.deepEqual(
    stops.map((issue) => issue.message),
    ['Add at least one creature before starting this fight'],
  );

  const unnamed = { ...blank(), name: '   ' };
  assert.equal(blockingIssues(validateEncounter(unnamed, summary)).length, 2);
});

test('a normal fight raises nothing at all', async () => {
  const bugbear = await creature('Bugbear');
  const encounter: EncounterTemplate = {
    ...blank(),
    entries: [{ id: 'a', monsterId: bugbear.id, count: 4 }],
  };

  const roster = [{ monster: bugbear, count: 4 }];
  assert.deepEqual(validateEncounter(encounter, summarise(encounter, roster, party(4))), []);
});

test('a crowded fight is warned about but never blocked', async () => {
  const goblin = await creature('Goblin');
  const encounter: EncounterTemplate = {
    ...blank(),
    entries: [{ id: 'a', monsterId: goblin.id, count: 18 }],
  };

  const summary = summarise(encounter, [{ monster: goblin, count: 18 }], party(4));
  const issues = validateEncounter(encounter, summary);

  const crowded = issues.find((issue) => issue.message.includes('combatants take a long time'));
  assert.ok(crowded);
  assert.equal(crowded.severity, 'warning');
  assert.match(crowded.message, /22 combatants/);
  assert.deepEqual(blockingIssues(issues), [], 'a DM running a siege knows what they are doing');
});

test('nobody present, and nothing visible, are both said out loud', async () => {
  const goblin = await creature('Goblin');
  const encounter: EncounterTemplate = {
    ...blank(),
    entries: [{ id: 'a', monsterId: goblin.id, count: 2, hidden: true }],
  };
  const roster = [{ monster: goblin, count: 2 }];

  const said = validateEncounter(encounter, summarise(encounter, roster, [])).map(
    (issue) => issue.message,
  );
  assert.ok(said.some((message) => message.includes('Nobody from the party')));
  assert.ok(said.some((message) => message.includes('Every creature starts hidden')));

  // One hidden group among several is an ambush, not a mistake.
  const ambush: EncounterTemplate = {
    ...encounter,
    entries: [...encounter.entries, { id: 'b', monsterId: goblin.id, count: 1 }],
  };
  const fine = validateEncounter(ambush, summarise(ambush, roster, party(4))).map(
    (issue) => issue.message,
  );
  assert.ok(!fine.some((message) => message.includes('Every creature starts hidden')));
});
