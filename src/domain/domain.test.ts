import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { createFixtureRepositories } from './data/fixtureRepositories.ts';
import { CURRENT_USER_ID } from './data/fixtures.ts';
import {
  canSee,
  canSeeCharacterSection,
  viewerFor,
  visibleParticipants,
  type Viewer,
} from './permissions.ts';
import { requireRuleset } from './ruleset/registry.ts';
import { id, type Character, type CombatParticipant } from './types.ts';

const SYSTEM = id<'GameSystem'>('dnd5e-2024');
const rules = requireRuleset(SYSTEM);
const repos = createFixtureRepositories();

/* ── The boundary that makes the product game-system agnostic ───────────────── */

const SRC = path.resolve(import.meta.dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

test('only the ruleset registry imports the D&D adapter', () => {
  const offenders = sourceFiles(SRC)
    .filter((file) => !file.includes(path.join('ruleset', 'dnd5e')))
    .filter((file) => path.basename(file) !== 'registry.ts')
    .filter((file) => path.basename(file) !== 'domain.test.ts')
    .filter((file) => /from\s+['"][^'"]*ruleset\/dnd5e/.test(readFileSync(file, 'utf8')))
    .map((file) => path.relative(SRC, file));

  assert.deepEqual(
    offenders,
    [],
    `These files reach past the ruleset seam into the D&D adapter. Widen the Ruleset ` +
      `interface instead of importing across the boundary:\n  ${offenders.join('\n  ')}`,
  );
});

/** Drops block and line comments, so a check can look at code rather than prose. */
function stripComments(source: string): string {
  return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
}

test('the generic type surface names no D&D concepts', () => {
  // Comments are stripped first: the docs in types.ts explain the boundary by naming what
  // is kept out ("no armour class, no spell slots"), and that prose is the point, not a
  // violation. What must stay clean is the declared surface — field and type names.
  const core = stripComments(
    readFileSync(path.join(SRC, 'domain', 'types.ts'), 'utf8'),
  ).toLowerCase();

  for (const banned of [
    'armourclass',
    'armorclass',
    'spellslot',
    'proficiency',
    'abilityscore',
    'd20',
    'challengerating',
  ]) {
    assert.ok(!core.includes(banned), `the core type surface names "${banned}"`);
  }
});

/* ── Ruleset: derived values ────────────────────────────────────────────────── */

async function character(name: string): Promise<Character> {
  const all = await repos.characters.listForCampaign(id<'Campaign'>('c-lmop'));
  const found = all.find((entry) => entry.name === name);
  assert.ok(found, `fixture character "${name}" is missing`);
  return found;
}

test('armour class is derived from armour, capped Dexterity and shield', async () => {
  // Aria: chain mail (16, Dex cap 0) + shield (2) = 18, matching the design's party table.
  const aria = await character('Aria Nightfall');
  const ac = rules.deriveCharacter(aria).find((value) => value.key === 'ac');
  assert.equal(ac?.value, 18);

  // Thessaly: leather (11, uncapped) + Dex 14 (+2) = 13.
  const thessaly = await character('Thessaly Vane');
  const thessalyAc = rules.deriveCharacter(thessaly).find((value) => value.key === 'ac');
  assert.equal(thessalyAc?.value, 13);
});

test('an overridden armour class wins and is marked as overridden', async () => {
  const aria = await character('Aria Nightfall');
  const pinned: Character = {
    ...aria,
    systemData: { ...aria.systemData, armourClassOverride: 21 },
  };
  const ac = rules.deriveCharacter(pinned).find((value) => value.key === 'ac');
  assert.equal(ac?.value, 21);
  assert.equal(ac?.overridden, true);
});

test('proficiency bonus follows the level table', async () => {
  const aria = await character('Aria Nightfall');
  const bonusAt = (level: number) =>
    rules.deriveCharacter({ ...aria, level }).find((value) => value.key === 'proficiency')?.value;

  assert.equal(bonusAt(1), 2);
  assert.equal(bonusAt(4), 2);
  assert.equal(bonusAt(5), 3);
  assert.equal(bonusAt(9), 4);
  assert.equal(bonusAt(20), 6);
});

/* ── Ruleset: capabilities that other systems may decline ───────────────────── */

test('spell slots follow the caster progression, and non-casters get none', async () => {
  const aria = await character('Aria Nightfall');
  assert.equal(rules.spellSlots(aria), null, 'a Fighter has no spell slots');

  // Warlock pact magic: two slots at 6th level, not the full-caster table.
  const thessaly = await character('Thessaly Vane');
  const pact = rules.spellSlots(thessaly);
  assert.equal(pact?.length, 1);
  assert.equal(pact?.[0]?.max, 2);

  // Cleric is a full caster: 6th level is 4/3/3.
  const bram = await character('Bram Ironfoot');
  const slots = rules.spellSlots(bram);
  assert.deepEqual(
    slots?.map((slot) => slot.max),
    [4, 3, 3],
  );
});

test('death saves resolve to stable, dead or pending', () => {
  assert.equal(rules.deathSaveOutcome({ successes: 3, failures: 0 }), 'stable');
  assert.equal(rules.deathSaveOutcome({ successes: 0, failures: 3 }), 'dead');
  // Bram's fixture state: still rolling, which is what makes the row urgent rather than final.
  assert.equal(rules.deathSaveOutcome({ successes: 1, failures: 2 }), 'pending');
});

test('the builder step list is generated, not fixed', async () => {
  const aria = await character('Aria Nightfall');
  const fighterSteps = rules.characterCreationSteps(aria).map((step) => step.id);
  assert.ok(fighterSteps.includes('fighting-style'), 'a Fighter gains a Fighting style step');
  assert.ok(!fighterSteps.includes('spells'), 'a Fighter has no Spells step');

  const bram = await character('Bram Ironfoot');
  const clericSteps = rules.characterCreationSteps(bram).map((step) => step.id);
  assert.ok(clericSteps.includes('spells'), 'a Cleric gains a Spells step');
  assert.ok(!clericSteps.includes('fighting-style'));

  // Level 7 for a Battle Master Fighter: hit points, a manoeuvre, then review.
  assert.deepEqual(
    rules.levelUpSteps(aria, 7).map((step) => step.id),
    ['hit-points', 'manoeuvre', 'review'],
  );
  // Level 4 adds an ability score improvement.
  assert.ok(rules.levelUpSteps(aria, 4).some((step) => step.id === 'asi'));
});

/* ── Ruleset: health ────────────────────────────────────────────────────────── */

test('damage consumes temporary hit points first and never goes negative', () => {
  const health = { current: 47, max: 58, temporary: 5 };

  const grazed = rules.applyHealthDelta(health, -3);
  assert.deepEqual(grazed, { current: 47, max: 58, temporary: 2 });

  const through = rules.applyHealthDelta(health, -9);
  assert.deepEqual(through, { current: 43, max: 58, temporary: 0 });

  // Overkill floors at zero: 5e tracks how far down through death saves, not negative HP.
  assert.equal(rules.applyHealthDelta(health, -500).current, 0);
});

test('healing is capped at maximum and leaves temporary hit points alone', () => {
  const health = { current: 47, max: 58, temporary: 5 };
  assert.deepEqual(rules.applyHealthDelta(health, 4), { current: 51, max: 58, temporary: 5 });
  assert.deepEqual(rules.applyHealthDelta(health, 100), { current: 58, max: 58, temporary: 5 });
});

/* ── Ruleset: dice ──────────────────────────────────────────────────────────── */

/**
 * Deterministic randomness: replays the given d20 faces in order.
 *
 * The adapter computes `1 + floor(random() * sides)`, so landing exactly on face `v`
 * needs the midpoint of its bucket — `(v - 0.5) / 20`. Using `(v - 1) / 20` sits on the
 * boundary and floats one face low. d20 only, which is all these tests roll.
 */
function fixedRandom(...faces: number[]): () => number {
  let index = 0;
  return () => {
    const face = faces[index++] ?? 1;
    return (face - 0.5) / 20;
  };
}

test('advantage keeps the higher d20 and marks the other dropped, not hidden', () => {
  const result = rules.evaluateRoll(
    { expression: '1d20 + 5', mode: 'advantage', title: 'Attack' },
    0,
    fixedRandom(4, 17),
  );

  assert.equal(result.dice.length, 2, 'both dice stay in the breakdown');
  const kept = result.dice.filter((die) => !die.dropped);
  assert.equal(kept.length, 1);
  assert.equal(kept[0]?.value, 17);
  assert.equal(result.total, 22);
});

test('a natural 20 is critical and a natural 1 is a fumble', () => {
  const crit = rules.evaluateRoll(
    { expression: '1d20', mode: 'normal', title: 'x' },
    0,
    fixedRandom(20),
  );
  assert.equal(crit.outcome, 'critical');

  const fumble = rules.evaluateRoll(
    { expression: '1d20', mode: 'normal', title: 'x' },
    0,
    fixedRandom(1),
  );
  assert.equal(fumble.outcome, 'fumble');
});

test('the expression parser handles the minus sign the design uses', () => {
  // The design's sample data writes "1d20 − 1" with U+2212, not a hyphen.
  const result = rules.evaluateRoll(
    { expression: '1d20 − 1', mode: 'normal', title: 'Save' },
    0,
    fixedRandom(5),
  );
  assert.equal(result.modifier, -1);
  assert.equal(result.total, 4);
});

/* ── Permissions ────────────────────────────────────────────────────────────── */

test('a private section is hidden from the party but not from its owner or the DM', async () => {
  const campaign = await repos.campaigns.byId(id<'Campaign'>('c-lmop'));
  assert.ok(campaign);

  const bram = await character('Bram Ironfoot');
  const dm = viewerFor(campaign, CURRENT_USER_ID);
  const owner: Viewer = { userId: bram.ownerUserId, role: 'player' };
  const otherPlayer: Viewer = { userId: id<'User'>('u-priya'), role: 'player' };

  assert.equal(canSeeCharacterSection(dm, bram, 'inventory'), true, 'the DM retains full access');
  assert.equal(canSeeCharacterSection(owner, bram, 'inventory'), true, 'Tomás sees his own');
  assert.equal(canSeeCharacterSection(otherPlayer, bram, 'inventory'), false);

  // Sections with no explicit setting stay visible to the party.
  assert.equal(canSeeCharacterSection(otherPlayer, bram, 'actions'), true);
});

test('a dm-only participant is absent from a player order entirely', async () => {
  const combat = await repos.combats.liveForCampaign(id<'Campaign'>('c-lmop'));
  assert.ok(combat);

  const player: Viewer = { userId: id<'User'>('u-priya'), role: 'player' };
  const dm: Viewer = { userId: CURRENT_USER_ID, role: 'dm' };

  const forPlayer = visibleParticipants(player, combat.participants);
  const forDm = visibleParticipants(dm, combat.participants);

  assert.equal(forDm.length, combat.participants.length);
  assert.equal(forPlayer.length, combat.participants.length - 1);
  assert.ok(
    !forPlayer.some((p: CombatParticipant) => p.name === 'Cragmaw Ambusher'),
    'the unrevealed monster must not leak to a player device',
  );
});

test('secret rolls reach the DM only', () => {
  const dm: Viewer = { userId: CURRENT_USER_ID, role: 'dm' };
  const player: Viewer = { userId: id<'User'>('u-priya'), role: 'player' };

  assert.equal(canSee(dm, 'secret', false), true);
  assert.equal(canSee(player, 'secret', false), false);
  assert.equal(canSee(player, 'party', false), true);
});

/* ── Repositories ───────────────────────────────────────────────────────────── */

test('repositories resolve the fixture graph', async () => {
  const campaigns = await repos.campaigns.listForUser(CURRENT_USER_ID);
  assert.equal(campaigns.length, 2);

  const party = await repos.characters.listForCampaign(id<'Campaign'>('c-lmop'));
  assert.equal(party.length, 4, 'the design shows a party of four');

  const homebrew = await repos.monsters.list({ origin: 'homebrew' });
  assert.equal(homebrew.length, 1);
  assert.equal(homebrew[0]?.name, 'Cragmaw Ambusher');

  // Ingested library content stays separate from user-owned homebrew.
  const library = await repos.monsters.list({ origin: 'library' });
  assert.ok(library.every((monster) => monster.ownerUserId === undefined));

  const encounters = await repos.encounters.listForCampaign(id<'Campaign'>('c-lmop'));
  assert.equal(encounters.length, 4);

  const search = await repos.monsters.list({ search: 'gob' });
  assert.deepEqual(
    search.map((monster) => monster.name),
    ['Goblin'],
  );
});

test('every fixture character resolves against its ruleset', async () => {
  const owned = await repos.characters.listForOwner(CURRENT_USER_ID);
  for (const entry of owned) {
    const ruleset = requireRuleset(entry.systemId);
    const derived = ruleset.deriveCharacter(entry);
    assert.ok(
      derived.some((value) => value.key === 'ac'),
      `${entry.name} has no derived armour class`,
    );
  }
});

/* ── Fixture scenarios: the states the homes must handle ────────────────────── */

test('the first-time scenario has no campaigns, characters or live combat', async () => {
  const blank = createFixtureRepositories({ scenario: 'first-time' });

  assert.deepEqual(await blank.campaigns.listForUser(CURRENT_USER_ID), []);
  assert.deepEqual(await blank.characters.listForOwner(CURRENT_USER_ID), []);
  assert.equal(await blank.combats.liveForUser(CURRENT_USER_ID), null);
  assert.deepEqual(await blank.recents.listForUser(CURRENT_USER_ID), []);
  assert.deepEqual(await blank.activity.listForUser(CURRENT_USER_ID), []);
});

test('the empty scenario keeps the campaign but strips what lives inside it', async () => {
  const empty = createFixtureRepositories({ scenario: 'empty' });

  // This is what separates it from first-time: the account exists and has campaigns,
  // so the home renders its normal frame around empty sections rather than onboarding.
  assert.equal((await empty.campaigns.listForUser(CURRENT_USER_ID)).length, 2);
  assert.deepEqual(await empty.characters.listForOwner(CURRENT_USER_ID), []);
  assert.deepEqual(await empty.monsters.list(), []);
});

test('the error scenario rejects with a recoverable, transport-free message', async () => {
  const broken = createFixtureRepositories({ scenario: 'error' });

  await assert.rejects(
    () => broken.campaigns.listForUser(CURRENT_USER_ID),
    (error: Error) => {
      // The design's rule for every error: what happened, what is still safe, what next —
      // and never a word about the transport.
      assert.match(error.message, /Nothing has been lost/);
      assert.ok(!/websocket|http|fetch|socket/i.test(error.message));
      return true;
    },
  );
});

test('a live combat is found across every campaign the user belongs to', async () => {
  // The homes ask this once rather than once per campaign; the fight lives in Lost Mine,
  // and Marta is in two campaigns.
  const live = await repos.combats.liveForUser(CURRENT_USER_ID);
  assert.equal(live?.name, 'Goblin Ambush');
  assert.equal(live?.status, 'live');

  // A user in no campaign sees nothing, even though the fight exists.
  const stranger = await repos.combats.liveForUser(id<'User'>('u-nobody'));
  assert.equal(stranger, null);
});

test('recall is newest first and capped', async () => {
  const recall = await repos.recents.listForUser(CURRENT_USER_ID, 3);
  assert.equal(recall.length, 3);
  assert.equal(recall[0]?.label, 'Goblin Ambush', 'the live fight was opened most recently');

  const times = recall.map((entry) => entry.at);
  assert.deepEqual(times, times.toSorted().toReversed());
});

test('party activity is scoped to the campaigns the user is in', async () => {
  const changes = await repos.activity.listForUser(CURRENT_USER_ID);
  assert.ok(changes.length > 0);
  assert.ok(changes.every((entry) => entry.campaignId === id<'Campaign'>('c-lmop')));

  const stranger = await repos.activity.listForUser(id<'User'>('u-nobody'));
  assert.deepEqual(stranger, []);
});
