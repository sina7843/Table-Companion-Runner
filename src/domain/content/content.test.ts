/**
 * The content boundary: what a record must be, what a licence permits, and that the ruleset
 * adapter actually reads its catalogue from here rather than from literals it used to hold.
 *
 * No database. The pipeline's storage half is `server/content/import.test.ts`; this is the
 * model, the licence rules and the adapter's dependency on them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContentLibrary, attributionsFor, CONTENT_KINDS } from './model.ts';
import type { ContentRecord, SourceRef } from './model.ts';
import { CC_BY_4_0, NOT_LICENSED, mayRedistribute, verdictFor } from './licenses.ts';
import { validateBundle } from './validate.ts';
import { shippedContent } from './bundles.ts';
import { libraryMonsters, monstersFrom } from './monsters.ts';
import * as content from '../ruleset/dnd5e/content.ts';
import { requireRuleset } from '../ruleset/registry.ts';
import { id } from '../types.ts';

const SOURCE: SourceRef = {
  id: 'srd-5.1',
  name: 'System Reference Document 5.1',
  publisher: 'Wizards of the Coast LLC',
  version: '5.1',
  license: CC_BY_4_0,
};

const bundle = (records: unknown[], source: unknown = SOURCE) => ({ source, records });

const entry = (kind: string, key: string, name = key) => ({
  kind,
  key,
  name,
  systemId: 'dnd5e-2024',
  // `key` inside the bag too: that is where the adapter's own shapes carry theirs, and these
  // records stand in for real ones.
  data: { key, label: name },
});

/* ── The licence boundary ───────────────────────────────────────────────────── */

test('the approved list is a list, and the unapproved one says why', () => {
  assert.equal(mayRedistribute(CC_BY_4_0), true);
  assert.equal(mayRedistribute(NOT_LICENSED), false);

  // The SRD is the one D&D-shaped source this product may ship, and the reason is written down.
  assert.match(verdictFor('srd-5.1')?.reason ?? '', /CC BY 4\.0/);

  // The dataset `Requirements.md` §6.35 named is blocked, and the entry says so rather than
  // the requirement quietly going missing.
  const community = verdictFor('5etools');
  assert.equal(community?.license.redistributable, false);
  assert.match(community?.reason ?? '', /§6\.35/);

  assert.equal(verdictFor('rulebook')?.license.redistributable, false);
});

test('an approved source carries the attribution it owes, with the content', () => {
  const library = createContentLibrary([
    { ...entry('species', 'human'), source: SOURCE } as unknown as ContentRecord,
  ]);
  const credits = attributionsFor(library);
  assert.equal(credits.length, 1);
  assert.match(credits[0]?.text ?? '', /System Reference Document 5\.1/);
  assert.match(credits[0]?.text ?? '', /creativecommons\.org/);

  // A source with nothing to require contributes no line rather than an empty one.
  const own = createContentLibrary([
    {
      ...entry('monster', 'mine'),
      source: { ...SOURCE, id: 'operator', license: { ...CC_BY_4_0, attribution: '' } },
    } as unknown as ContentRecord,
  ]);
  assert.deepEqual(attributionsFor(own), []);
});

/* ── Validation ─────────────────────────────────────────────────────────────── */

test('a bundle that does not validate imports nothing, and says which field', () => {
  const missingSource = validateBundle({ records: [] });
  assert.equal(missingSource.records.length, 0);
  assert.match(missingSource.problems[0]?.message ?? '', /source/);

  const badKind = validateBundle(bundle([entry('sorcery', 'fireball')]));
  assert.equal(badKind.records.length, 0);
  assert.match(badKind.problems[0]?.message ?? '', /kind/);
});

test('an invalid record is refused by name and the rest of the bundle survives', () => {
  const checked = validateBundle(
    bundle([
      entry('species', 'human'),
      { ...entry('species', 'elf'), name: '' },
      { ...entry('class', 'fighter'), extra: 'over-posted' },
      entry('class', 'cleric'),
    ]),
  );

  assert.deepEqual(
    checked.records.map((record) => record.key),
    ['human', 'cleric'],
  );
  assert.equal(checked.problems.length, 2);
  assert.ok(checked.problems.some((problem) => problem.where === 'species:elf'));
  assert.ok(checked.problems.some((problem) => problem.message.includes('extra')));
});

test('a key a source repeats is dropped once and named, not silently overwritten', () => {
  const checked = validateBundle(
    bundle([
      { ...entry('monster', 'goblin', 'Goblin'), data: { hp: 7 } },
      { ...entry('monster', 'goblin', 'Goblin (again)'), data: { hp: 999 } },
    ]),
  );

  assert.equal(checked.records.length, 1);
  assert.equal(checked.records[0]?.name, 'Goblin', 'the first wins, not the last');
  assert.deepEqual(checked.duplicates, ['monster:goblin']);
});

test('a key is a key, not a sentence', () => {
  const checked = validateBundle(bundle([{ ...entry('species', 'Human Variant!') }]));
  assert.equal(checked.records.length, 0);
  assert.match(checked.problems[0]?.message ?? '', /key/);
});

test('the data bag is checked as an object and no further', () => {
  // The core cannot know what a species is, so it must not pretend to validate one.
  const checked = validateBundle(
    bundle([
      { ...entry('species', 'human'), data: { anything: [1, { nested: true }], at: 'all' } },
    ]),
  );
  assert.equal(checked.records.length, 1);

  const notAnObject = validateBundle(bundle([{ ...entry('species', 'elf'), data: 'a string' }]));
  assert.equal(notAnObject.records.length, 0);
});

/* ── The index ──────────────────────────────────────────────────────────────── */

test('a library indexes by kind and key, and reports the sources behind it', () => {
  const other: SourceRef = { ...SOURCE, id: 'other', name: 'Another source', version: '1.0' };
  const library = createContentLibrary([
    { ...entry('species', 'human'), source: SOURCE } as unknown as ContentRecord,
    { ...entry('class', 'fighter'), source: SOURCE } as unknown as ContentRecord,
    { ...entry('monster', 'goblin'), source: other } as unknown as ContentRecord,
  ]);

  assert.equal(library.size(), 3);
  assert.equal(library.list('species').length, 1);
  assert.equal(library.get('class', 'fighter')?.name, 'fighter');
  assert.equal(library.get('class', 'wizard'), null);
  assert.deepEqual(
    library
      .sources()
      .map((source) => source.id)
      .toSorted(),
    ['other', 'srd-5.1'],
  );
});

/* ── What the adapter now depends on ────────────────────────────────────────── */

test('the shipped catalogue is content, and it is not empty', () => {
  const library = shippedContent();
  assert.ok(library.size() > 100, 'the bundles carry a real catalogue');

  // Every kind the builder needs is present, from a source that may be shipped.
  for (const kind of ['species', 'background', 'class', 'spell', 'equipment', 'monster'] as const) {
    assert.ok(library.list(kind).length > 0, `no ${kind} content`);
  }
  assert.ok(
    library.sources().every((source) => source.license.redistributable),
    'nothing shipped comes from a source that may not be',
  );
  assert.ok(CONTENT_KINDS.includes('other'));
});

test('the character builder reads its catalogue from content, not from literals', () => {
  // These were arrays in `builder.ts` until TC-P06. If they came back, this passes for the
  // wrong reason — so the assertion is that swapping the library changes what the adapter says.
  assert.ok(content.species().length >= 8);
  assert.ok(content.backgrounds().length >= 6);
  assert.ok(content.classes().length >= 8);

  const before = content.classes().length;
  content.useContentLibrary(createContentLibrary([]));
  assert.equal(content.classes().length, 0, 'the adapter is reading the library, not a constant');
  content.useContentLibrary(shippedContent());
  assert.equal(content.classes().length, before);
});

test('a representative build path resolves entirely from content', () => {
  const fighter = content.classes().find((entry_) => entry_.key === 'fighter');
  const human = content.species().find((entry_) => entry_.key === 'human');
  const soldier = content.backgrounds().find((entry_) => entry_.key === 'soldier');

  assert.ok(fighter && human && soldier, 'the fixture character can still be built');
  assert.equal(fighter.hitDie, 10);
  assert.ok(fighter.savingThrows.length > 0);
  assert.ok(soldier.increases.length > 0, 'a background still grants its ability increases');
  assert.ok(human.traits.length > 0);

  // A fighting style is an `other` record this adapter tells apart by its own category, and
  // nothing generic reads that field.
  assert.ok(content.fightingStyles().some((style) => style.value === 'defence'));
  assert.ok(content.equipmentPacks().some((pack) => pack.value === 'dungeoneer'));
});

test('spell lists rebuild from flat records, by class and tier', () => {
  const spells = content.spellsByClass();
  const wizard = spells.wizard;

  assert.ok(wizard, 'a caster class has a list');
  assert.ok(wizard.cantrips.length > 0);
  assert.ok(wizard.first.length > 0);
  assert.ok(
    wizard.cantrips.every((option) => typeof option.value === 'string' && option.label.length > 0),
  );

  // A flat record per spell is what lets each one carry a source; the nested shape the builder
  // wants is assembled, not stored.
  const flat = shippedContent().list('spell');
  assert.ok(flat.length > 0);
  assert.ok(flat.every((record) => typeof record.data.classId === 'string'));
});

test('creature content reaches the library with its actions intact', () => {
  const creatures = libraryMonsters();
  assert.ok(creatures.length >= 40);

  const dragon = creatures.find((monster) => monster.name === 'Adult Black Dragon');
  assert.ok(dragon, 'a high-CR creature survived the round trip');
  assert.ok(dragon.actionGroups.length > 1, 'its action groups came with it');
  assert.ok(dragon.actionGroups.some((group) => group.entries.length > 0));

  // The roll expressions are still the ruleset's to build, from the stored numbers.
  const rules = requireRuleset(id<'GameSystem'>('dnd5e-2024'));
  const groups = rules.monsterActionGroups(dragon);
  assert.ok(groups.flatMap((group) => group.entries).some((entry_) => entry_.rolls?.length));

  // Every creature says which source it came from, which is the column a DM reads.
  assert.ok(creatures.every((monster) => monster.source === 'System Reference Document 5.1'));
});

test('content that may not be shipped is not in the shipped library', () => {
  // Two creatures are Product Identity — named in no licence the product holds. They live in
  // `content/quarantine/` so the decision is visible, and nothing imports them.
  const names = new Set(libraryMonsters().map((monster) => monster.name));
  assert.equal(names.has('Beholder'), false);
  assert.equal(names.has('Mind Flayer'), false);
});

test('filtering by system is what keeps two rulesets out of each other', () => {
  const pathfinderish: ContentRecord = {
    key: 'ancestry-elf',
    systemId: id<'GameSystem'>('some-other-system'),
    kind: 'species',
    name: 'Elf',
    source: SOURCE,
    data: { label: 'Elf', heritages: ['Ancient', 'Cavern'] },
  };

  const mixed = createContentLibrary([
    { ...entry('species', 'human'), source: SOURCE } as unknown as ContentRecord,
    pathfinderish,
  ]);

  assert.equal(mixed.list('species').length, 2, 'one table holds both');
  content.useContentLibrary(mixed);
  assert.deepEqual(
    content.species().map((species) => species.key),
    ['human'],
    'and the D&D adapter sees only its own',
  );
  content.useContentLibrary(shippedContent());

  // The other system's record survived untouched, bag and all — nothing generic normalised it.
  assert.deepEqual(monstersFrom(mixed, 'some-other-system'), []);
  assert.deepEqual(mixed.get('species', 'ancestry-elf')?.data.heritages, ['Ancient', 'Cavern']);
});
