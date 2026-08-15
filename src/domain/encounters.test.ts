/**
 * Encounter templates: difficulty, duplication, deletion, and the rule the whole feature
 * rests on — starting a fight must never write to the template it came from.
 *
 * The fixture arrays are module-level, so every test here removes what it created.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFixtureRepositories } from './data/fixtureRepositories.ts';
import { requireRuleset } from './ruleset/registry.ts';
import type { EncounterCreature } from './ruleset/Ruleset.ts';
import { id, type Character, type Monster } from './types.ts';

const SYSTEM = id<'GameSystem'>('dnd5e-2024');
const LMOP = id<'Campaign'>('c-lmop');
const STRAHD = id<'Campaign'>('c-strahd');
const rules = requireRuleset(SYSTEM);
const repos = createFixtureRepositories();

async function monster(name: string): Promise<Monster> {
  const all = await repos.monsters.list();
  const found = all.find((entry) => entry.name === name);
  assert.ok(found, `fixture creature "${name}" is missing`);
  return found;
}

async function encounter(name: string) {
  const all = await repos.encounters.listForCampaign(LMOP);
  const found = all.find((entry) => entry.name === name);
  assert.ok(found, `fixture encounter "${name}" is missing`);
  return found;
}

const party = (...levels: number[]): Character[] =>
  levels.map(
    (level, index) =>
      ({
        id: id<'Character'>(`ch-test-${index}`),
        systemId: SYSTEM,
        ownerUserId: id<'User'>('u-marta'),
        name: `Test ${index}`,
        subtitle: '',
        level,
        attributes: [],
        resources: [],
        health: { current: 10, max: 10, temporary: 0 },
        conditions: [],
        sectionVisibility: {},
        systemData: {},
      }) satisfies Character,
  );

/* ── Difficulty ─────────────────────────────────────────────────────────────── */

test('the same fight is harder for a smaller, lower party', async () => {
  const goblin = await monster('Goblin');
  const roster: EncounterCreature[] = [{ monster: goblin, count: 6 }];

  const veterans = rules.encounterDifficulty(roster, party(6, 6, 6, 6));
  const novices = rules.encounterDifficulty(roster, party(1, 1));

  assert.ok(veterans && novices);
  // Same creatures, same adjusted XP — only the threshold the party sets moves.
  assert.equal(veterans.metric?.value, novices.metric?.value);
  assert.equal(veterans.label, 'Trivial');
  assert.equal(novices.label, 'Deadly');
  assert.ok(novices.fill > veterans.fill);
});

test('crowding a fight counts for more than its raw experience', async () => {
  const goblin = await monster('Goblin');
  const four = rules.encounterDifficulty([{ monster: goblin, count: 4 }], party(3, 3, 3, 3));
  const eight = rules.encounterDifficulty([{ monster: goblin, count: 8 }], party(3, 3, 3, 3));

  assert.ok(four?.metric && eight?.metric);
  // Twice the goblins, more than twice the adjusted XP — the multiplier band moved.
  assert.ok(eight.metric.value > four.metric.value * 2);
});

test('an unrated encounter says so instead of printing a confident number', async () => {
  const ghoul = await monster('Ghoul');
  const rated = rules.encounterDifficulty([{ monster: ghoul, count: 2 }], []);

  assert.ok(rated);
  assert.equal(rated.label, 'Unrated');
  assert.equal(rated.fill, 0);
  // The XP is still worth stating; only the judgement is withheld.
  assert.ok(rated.metric && rated.metric.value > 0);
  assert.match(rated.detail, /add characters/);
});

test('the estimate shows its working rather than one word', async () => {
  const bugbear = await monster('Bugbear');
  const rated = rules.encounterDifficulty([{ monster: bugbear, count: 3 }], party(4, 4, 4));

  assert.ok(rated);
  const labels = rated.breakdown.map((row) => row.label);
  assert.deepEqual(labels, [
    'Party',
    'Creatures',
    'Adjusted XP',
    'Threshold — hard',
    'Threshold — deadly',
  ]);
  assert.ok(rated.fill > 0 && rated.fill <= 100);
});

test('a fight already past deadly is not warned about being close to it', async () => {
  const dragon = await monster('Adult Black Dragon');
  const rated = rules.encounterDifficulty([{ monster: dragon, count: 3 }], party(5, 5, 5, 5));

  assert.ok(rated);
  assert.equal(rated.label, 'Deadly');
  assert.equal(rated.warning, undefined);
  // The bar pins rather than overflowing.
  assert.equal(rated.fill, 100);
});

/* ── Templates ──────────────────────────────────────────────────────────────── */

test('a duplicate is a separate template that has not been run', async () => {
  const source = await encounter('Goblin Ambush');
  assert.ok(source.lastRunAt, 'the fixture original has been run');

  const copy = await repos.encounters.duplicate(source.id);
  try {
    assert.notEqual(copy.id, source.id);
    assert.equal(copy.name, 'Goblin Ambush (copy)');
    assert.equal(copy.lastRunAt, undefined);
    assert.deepEqual(
      copy.entries.map((entry) => entry.monsterId),
      source.entries.map((entry) => entry.monsterId),
    );

    // Editing the copy's roster must not reach the original.
    copy.entries[0]!.count = 99;
    assert.notEqual((await encounter('Goblin Ambush')).entries[0]?.count, 99);
  } finally {
    await repos.encounters.remove(copy.id);
  }
});

test('deleting a template removes it from its campaign and nothing else', async () => {
  const created = await repos.encounters.create({ campaignId: LMOP, name: 'Test skirmish' });
  const before = await repos.encounters.listForCampaign(LMOP);
  assert.ok(before.some((entry) => entry.id === created.id));

  await repos.encounters.remove(created.id);

  const after = await repos.encounters.listForCampaign(LMOP);
  assert.equal(after.length, before.length - 1);
  assert.equal(await repos.encounters.byId(created.id), null);
});

test('a new template is stamped and belongs to the campaign it was made in', async () => {
  const created = await repos.encounters.create({
    campaignId: STRAHD,
    name: 'The old bonegrinder',
  });
  try {
    assert.equal(created.campaignId, STRAHD);
    assert.deepEqual(created.entries, []);
    assert.ok(created.updatedAt, 'a template records when it was last edited');

    const saved = await repos.encounters.save({ ...created, name: 'Bonegrinder, upstairs' });
    assert.equal(saved.name, 'Bonegrinder, upstairs');
    assert.equal((await repos.encounters.byId(created.id))?.name, 'Bonegrinder, upstairs');
  } finally {
    await repos.encounters.remove(created.id);
  }
});

/* ── Starting a fight ───────────────────────────────────────────────────────── */

test('starting a combat does not change the template it came from', async () => {
  const template = await encounter('Wave Echo Cave — first landing');
  const before = structuredClone({ ...template, lastRunAt: undefined });

  const combat = await repos.combats.startFromTemplate(template.id);

  const after = await repos.encounters.byId(template.id);
  assert.ok(after);
  // lastRunAt is a note about the template, so it is the one field allowed to move.
  assert.deepEqual({ ...after, lastRunAt: undefined, updatedAt: before.updatedAt }, before);
  assert.equal(after.lastRunAt, combat.startedAt);

  // Wounding a combatant must not reach back into the roster.
  combat.participants[0]!.health.current = 0;
  assert.deepEqual((await repos.encounters.byId(template.id))?.entries, before.entries);
});

test('the same template run twice produces two independent fights', async () => {
  const template = await encounter('Owlbear in the ravine');

  const first = await repos.combats.startFromTemplate(template.id);
  const second = await repos.combats.startFromTemplate(template.id);

  assert.notEqual(first.id, second.id);
  assert.equal(first.encounterTemplateId, template.id);
  assert.equal(second.encounterTemplateId, template.id);

  first.participants[0]!.health.current = 1;
  assert.notEqual(second.participants[0]?.health.current, 1);
});

test('starting expands counts into named combatants and brings the party', async () => {
  const template = await encounter('The Redbrand Hideout');
  const combat = await repos.combats.startFromTemplate(template.id);

  const monsters = combat.participants.filter((entry) => entry.entityType === 'monster');
  const players = combat.participants.filter((entry) => entry.entityType === 'player');

  assert.equal(monsters.length, 8, 'six ruffians, their captain and one bodyguard');
  assert.equal(players.length, 4, 'the party is in the fight without being added by hand');

  // Identical creatures are numbered and share a group key so the list can collapse them.
  const bandits = monsters.filter((entry) => entry.name.startsWith('Bandit #'));
  assert.equal(bandits.length, 6);
  assert.equal(new Set(bandits.map((entry) => entry.groupKey)).size, 1);
  // A creature there is only one of keeps its plain name and needs no group.
  const captain = monsters.find((entry) => entry.name === 'Bandit Captain');
  assert.ok(captain);
  assert.equal(captain.groupKey, undefined);

  // Nothing has rolled initiative yet, and everything starts whole.
  assert.ok(combat.participants.every((entry) => entry.initiative === null));
  assert.equal(combat.status, 'preparing');
  assert.ok(monsters.every((entry) => entry.health.current === entry.health.max));
});

test('a creature the DM hid stays hidden when the fight starts', async () => {
  const template = await encounter('Orc raiders at Wyvern Tor');
  const combat = await repos.combats.startFromTemplate(template.id);

  const ogres = combat.participants.filter((entry) => entry.name.startsWith('Ogre #'));
  const orcs = combat.participants.filter((entry) => entry.name.startsWith('Orc #'));

  assert.equal(ogres.length, 2);
  assert.ok(ogres.every((entry) => entry.visibility === 'private'));
  assert.ok(orcs.every((entry) => entry.visibility === 'party'));
});
