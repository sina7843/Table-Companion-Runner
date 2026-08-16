/**
 * The creature library: search, progressive filters, sort and the homebrew boundary.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFixtureRepositories } from './data/fixtureRepositories.ts';
import { requireRuleset } from './ruleset/registry.ts';
import { id } from './types.ts';

const SYSTEM = id<'GameSystem'>('dnd5e-2024');
const rules = requireRuleset(SYSTEM);
const repos = createFixtureRepositories();

test('the library is long enough to be worth filtering', async () => {
  const all = await repos.monsters.list();
  assert.ok(all.length >= 40, 'a library that fits on one screen proves nothing about filtering');

  // Every difficulty band is represented, so a range filter has something to exclude.
  assert.ok(all.some((monster) => monster.challengeRank < 1));
  assert.ok(all.some((monster) => monster.challengeRank >= 10));
});

test('results sort by difficulty descending by default', async () => {
  const all = await repos.monsters.list();
  const ranks = all.map((monster) => monster.challengeRank);
  assert.deepEqual(
    ranks,
    [...ranks].toSorted((a, b) => b - a),
  );

  const ascending = await repos.monsters.list({ sort: 'challenge-asc' });
  assert.ok((ascending[0]?.challengeRank ?? 99) <= (ascending.at(-1)?.challengeRank ?? 0));

  const byName = await repos.monsters.list({ sort: 'name' });
  assert.deepEqual(
    byName.map((monster) => monster.name),
    byName.map((monster) => monster.name).toSorted((a, b) => a.localeCompare(b)),
  );
});

test('search matches the subtitle as well as the name', async () => {
  // A DM typing "goblinoid" is searching as legitimately as one typing "goblin".
  const byType = await repos.monsters.list({ search: 'goblinoid' });
  assert.ok(byType.length > 0);
  assert.ok(byType.every((monster) => /goblinoid/i.test(monster.subtitle)));
});

test('facet values are OR-ed within a facet and AND-ed across facets', async () => {
  const dragons = await repos.monsters.list({ facets: { type: ['Dragon'] } });
  assert.ok(dragons.length > 0);
  assert.ok(dragons.every((monster) => monster.facets.type?.includes('Dragon')));

  // Adding a second type widens the result.
  const both = await repos.monsters.list({ facets: { type: ['Dragon', 'Undead'] } });
  assert.ok(both.length > dragons.length);

  // Adding a different facet narrows it.
  const hugeDragons = await repos.monsters.list({
    facets: { type: ['Dragon'], size: ['Huge'] },
  });
  assert.ok(hugeDragons.length < dragons.length);
  assert.ok(hugeDragons.every((monster) => monster.facets.size?.includes('Huge')));
});

test('the difficulty range filters inclusively at both ends', async () => {
  const midRange = await repos.monsters.list({ challengeMin: 10, challengeMax: 16 });
  assert.ok(midRange.length > 0);
  assert.ok(
    midRange.every((monster) => monster.challengeRank >= 10 && monster.challengeRank <= 16),
  );

  // The design's own filter chip reads "CR 10 – 16" with a dragon in it.
  assert.ok(midRange.some((monster) => monster.name === 'Adult Black Dragon'));

  // An impossible range returns nothing rather than everything.
  assert.deepEqual(await repos.monsters.list({ challengeMin: 40 }), []);
});

test('filters compose, and a search inside a filtered set narrows further', async () => {
  const dragons = await repos.monsters.list({ facets: { type: ['Dragon'] } });
  const ancient = await repos.monsters.list({
    facets: { type: ['Dragon'] },
    search: 'ancient',
  });

  assert.ok(ancient.length > 0);
  assert.ok(ancient.length < dragons.length);
});

test('homebrew sits in the same list as printed content, distinguishable but not filed apart', async () => {
  const all = await repos.monsters.list();
  const homebrew = all.filter((monster) => monster.origin === 'homebrew');

  assert.ok(homebrew.length > 0);
  // The distinction matters for trust, not for navigation: it is in the main list, and
  // its source column names the person rather than a book.
  assert.equal(homebrew[0]?.source, 'Marta');
  assert.ok(all.some((monster) => monster.source === 'System Reference Document 5.1'));

  // And it can still be isolated when a DM wants only their own.
  const onlyMine = await repos.monsters.list({ origin: 'homebrew' });
  assert.equal(onlyMine.length, homebrew.length);
});

test('every creature carries the facets the ruleset says it filters by', async () => {
  const all = await repos.monsters.list();
  const declared = rules.monsterFacets().map((facet) => facet.key);

  for (const monster of all) {
    for (const facet of declared) {
      assert.ok(
        (monster.facets[facet] ?? []).length > 0,
        `${monster.name} has no "${facet}" facet, so it would vanish from that filter`,
      );
    }
  }
});

test('the ruleset marks exactly one facet as primary', () => {
  // The design shows creature type in the bar and the rest behind "More filters".
  const primary = rules.monsterFacets().filter((facet) => facet.primary);
  assert.equal(primary.length, 1);
  assert.equal(primary[0]?.key, 'type');
});

test('the challenge scale is ascending and starts below 1', () => {
  const scale = rules.challengeScale();
  const values = scale.map((entry) => entry.value);

  assert.deepEqual(
    values,
    [...values].toSorted((a, b) => a - b),
  );
  assert.ok(values.includes(0.25), 'fractional ratings exist and must be selectable');
  assert.equal(scale.find((entry) => entry.value === 0.25)?.label, '1/4');
});

test('count ignores paging so the result line can say "N of M"', async () => {
  const total = await repos.monsters.count();
  const firstPage = await repos.monsters.list({ limit: 5 });

  assert.equal(firstPage.length, 5);
  assert.ok(total > firstPage.length);
});
