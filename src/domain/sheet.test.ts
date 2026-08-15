/**
 * The character sheet, privacy and level up.
 *
 * The acceptance criterion asks for privacy and level-up states testable with fixtures,
 * so these run against the design's own party — Aria the Fighter, Bram who hid his
 * inventory, Quill with an unspent level-up.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFixtureRepositories } from './data/fixtureRepositories.ts';
import { CURRENT_USER_ID } from './data/fixtures.ts';
import { canSeeCharacterSection, type Viewer } from './permissions.ts';
import { requireRuleset } from './ruleset/registry.ts';
import { id, type Character } from './types.ts';

const SYSTEM = id<'GameSystem'>('dnd5e-2024');
const rules = requireRuleset(SYSTEM);
const repos = createFixtureRepositories();
const LMOP = id<'Campaign'>('c-lmop');

async function character(name: string): Promise<Character> {
  const party = await repos.characters.listForCampaign(LMOP);
  const found = party.find((entry) => entry.name === name);
  assert.ok(found, `fixture character "${name}" is missing`);
  return found;
}

/* ── Sections ───────────────────────────────────────────────────────────────── */

test('sheet sections are ordered by how often a player reaches for them', async () => {
  const aria = await character('Aria Nightfall');
  const ids = rules.sheetSections(aria).map((section) => section.id);

  // Actions first, long-form last. The design puts background two taps deep.
  assert.equal(ids[0], 'actions');
  assert.equal(ids.at(-1), 'background');
  assert.ok(ids.indexOf('skills') < ids.indexOf('features'));
});

test('a caster gets a spells tab and a martial class does not', async () => {
  const bram = await character('Bram Ironfoot');
  assert.ok(rules.sheetSections(bram).some((section) => section.id === 'spells'));

  const aria = await character('Aria Nightfall');
  assert.ok(!rules.sheetSections(aria).some((section) => section.id === 'spells'));
});

test('every section carries the privacy key that governs it', async () => {
  const aria = await character('Aria Nightfall');
  for (const section of rules.sheetSections(aria)) {
    assert.ok(section.privacyKey, `${section.id} has no privacy key`);
  }
});

/* ── Play-critical content ──────────────────────────────────────────────────── */

test('attacks arrive with modifiers already applied and still checkable', async () => {
  const aria = await character('Aria Nightfall');
  const actions = rules.sheetContent(aria, 'actions').rollables ?? [];

  const longsword = actions.find((entry) => entry.name === 'Longsword');
  assert.ok(longsword);

  // STR 17 is +3, proficiency at level 6 is +3, so the attack is 1d20 + 6.
  const attack = longsword.rolls?.find((roll) => roll.label === 'Attack');
  assert.equal(attack?.expression, '1d20 +6');

  // The damage die and the modifier are both visible, so the arithmetic is checkable.
  const damage = longsword.rolls?.find((roll) => roll.label === 'Damage');
  assert.equal(damage?.expression, '1d8 +3');
});

test('a fighting style changes the expression a player taps', async () => {
  const aria = await character('Aria Nightfall');

  // Archery is +2 to hit with ranged weapons, and must reach the button, not a footnote.
  const archer: Character = {
    ...aria,
    systemData: { ...aria.systemData, fightingStyle: 'archery' },
  };
  const bow = (rules.sheetContent(archer, 'actions').rollables ?? []).find(
    (entry) => entry.name === 'Longbow',
  );
  const attack = bow?.rolls?.find((roll) => roll.label === 'Attack');

  // DEX 14 is +2, proficiency +3, archery +2 → 1d20 + 7.
  assert.equal(attack?.expression, '1d20 +7');
});

test('skills apply proficiency and say so in a word', async () => {
  const aria = await character('Aria Nightfall');
  const values = rules.sheetContent(aria, 'skills').values ?? [];

  const athletics = values.find((entry) => entry.label === 'Athletics');
  assert.ok(athletics);
  assert.equal(athletics.proficient, true, 'Aria is trained in Athletics');
  // STR +3 plus proficiency +3.
  assert.equal(athletics.value, '+6');

  const untrained = values.find((entry) => entry.label === 'Arcana');
  assert.equal(untrained?.proficient, false, 'untrained is stated, not left absent');
  // WIS is not Arcana's ability; INT 10 gives a flat +0.
  assert.equal(untrained?.value, '+0');

  // Saves sit beside the abilities that produce them.
  const strengthSave = values.find((entry) => entry.label === 'Strength');
  assert.ok(strengthSave, 'saving throws are in the same section as skills');
  assert.equal(strengthSave.proficient, true, 'a Fighter is proficient in Strength saves');
});

test('an unprepared spell stays visible rather than disappearing', async () => {
  const bram = await character('Bram Ironfoot');
  const spells = rules.sheetContent(bram, 'spells').rollables ?? [];

  assert.ok(spells.length > 0);
  // Cantrips sort first, as the design specifies.
  assert.equal(spells[0]?.tier, 'Cantrip');

  // Hiding an unprepared spell makes a player think they lost it.
  const unprepared = spells.filter((entry) => entry.prepared === false);
  assert.ok(unprepared.length > 0, 'known-but-unprepared spells are still listed');
});

test('an unknown section returns empty rather than throwing', async () => {
  const aria = await character('Aria Nightfall');
  assert.deepEqual(rules.sheetContent(aria, 'nonsense'), {});
});

/* ── Privacy ────────────────────────────────────────────────────────────────── */

test('the three privacy states behave as specified', async () => {
  const bram = await character('Bram Ironfoot');

  const owner: Viewer = { userId: bram.ownerUserId, role: 'player' };
  const dm: Viewer = { userId: CURRENT_USER_ID, role: 'dm' };
  const otherPlayer: Viewer = { userId: id<'User'>('u-priya'), role: 'player' };

  // Bram hid his inventory from the party.
  assert.equal(canSeeCharacterSection(owner, bram, 'inventory'), true, 'owner: full access');
  assert.equal(canSeeCharacterSection(dm, bram, 'inventory'), true, 'DM: full access');
  assert.equal(
    canSeeCharacterSection(otherPlayer, bram, 'inventory'),
    false,
    'other players: public sections only',
  );

  // Anything not hidden stays visible to everyone in the party.
  assert.equal(canSeeCharacterSection(otherPlayer, bram, 'actions'), true);
});

test('a hidden section removes its tab for another player but not for the DM', async () => {
  const bram = await character('Bram Ironfoot');
  const dm: Viewer = { userId: CURRENT_USER_ID, role: 'dm' };
  const otherPlayer: Viewer = { userId: id<'User'>('u-priya'), role: 'player' };

  const visibleTo = (viewer: Viewer) =>
    rules
      .sheetSections(bram)
      .filter(
        (section) =>
          !section.privacyKey || canSeeCharacterSection(viewer, bram, section.privacyKey),
      )
      .map((section) => section.id);

  assert.ok(visibleTo(dm).includes('items'), 'the DM retains every section');
  assert.ok(!visibleTo(otherPlayer).includes('items'), 'a hidden section has no tab at all');
});

/* ── Level up ───────────────────────────────────────────────────────────────── */

test('the level-up step list is generated and short when there is little to decide', async () => {
  const aria = await character('Aria Nightfall');

  // A Battle Master Fighter reaching 7 has exactly one real decision.
  const steps = rules.levelUpSteps(aria, 7).map((step) => step.id);
  assert.deepEqual(steps, ['hit-points', 'manoeuvre', 'review']);

  // Level 8 is an ability score improvement instead.
  assert.ok(rules.levelUpSteps(aria, 8).some((step) => step.id === 'asi'));
});

test('level-up validation names the missing decision', async () => {
  const aria = await character('Aria Nightfall');

  const issues = rules.validateLevelUpStep(aria, 7, 'manoeuvre', {});
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.fieldKey, 'manoeuvre');

  assert.deepEqual(rules.validateLevelUpStep(aria, 7, 'manoeuvre', { manoeuvre: 'precision' }), []);
});

test('the review splits what the player chose from what the rules applied', async () => {
  const aria = await character('Aria Nightfall');
  const choices = { hitPointMethod: 'roll', hitPointRoll: 7, manoeuvre: 'precision' };
  const outcome = rules.levelUpChanges(aria, 7, choices);

  // Chosen: the manoeuvre and the hit-point method.
  const chosen = outcome.chosen.map((change) => change.key);
  assert.ok(chosen.includes('manoeuvre'));
  assert.ok(chosen.includes('hit-points'));

  // Automatic: the totals the rules moved.
  const automatic = outcome.automatic.map((change) => change.key);
  assert.ok(automatic.includes('hp-total'));
  assert.ok(automatic.includes('proficiency'));

  // CON 15 is +2, so a rolled 7 gives +9 — the design's own figure.
  const hp = outcome.automatic.find((change) => change.key === 'hp-total');
  assert.equal(hp?.badge, '+9');
  assert.match(hp?.summary ?? '', /58 → 67/);

  // Proficiency does not move at 7, and saying "No change" is more useful than silence.
  const prof = outcome.automatic.find((change) => change.key === 'proficiency');
  assert.equal(prof?.badge, 'No change');

  // A Battle Master's superiority dice do grow at 7.
  assert.ok(automatic.includes('superiority'));
});

test('taking the average is never worse than half the die', async () => {
  const aria = await character('Aria Nightfall');

  const averaged = rules.levelUpChanges(aria, 7, { hitPointMethod: 'average' });
  const hp = averaged.automatic.find((change) => change.key === 'hp-total');

  // A d10 averages to 6, plus +2 Constitution.
  assert.equal(hp?.badge, '+8');
});

test('applying a level up advances the character and clears the pending flag', async () => {
  const quill = await character('Quill Featherwind');
  assert.equal(quill.pendingLevelUp, true, 'the fixture has an unspent level-up');

  const advanced = rules.applyLevelUp(quill, quill.level + 1, {
    hitPointMethod: 'average',
    subclass: 'Assassin',
  });

  assert.equal(advanced.level, quill.level + 1);
  assert.equal(advanced.pendingLevelUp, false);
  assert.ok(advanced.health.max > quill.health.max, 'the maximum rises');
  assert.equal(
    advanced.health.max - quill.health.max,
    advanced.health.current - quill.health.current,
    'current follows the maximum by the same amount',
  );
});

test('an ability score improvement reaches the attributes and their modifiers', async () => {
  const aria = await character('Aria Nightfall');
  const before = aria.attributes.find((attribute) => attribute.key === 'str')?.value ?? 0;

  // Picking the same ability twice raises it by 2.
  const advanced = rules.applyLevelUp(aria, 8, {
    hitPointMethod: 'average',
    asi: ['str', 'str'],
  });
  const after = advanced.attributes.find((attribute) => attribute.key === 'str');

  assert.equal(after?.value, before + 2);
  assert.equal(after?.modifier, Math.floor((before + 2 - 10) / 2));

  // And the derived values move with it.
  const derived = rules.deriveCharacter(advanced);
  assert.equal(derived.find((value) => value.key === 'proficiency')?.value, 3);
});
