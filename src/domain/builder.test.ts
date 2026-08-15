/**
 * The guided character builder.
 *
 * These exercise the ruleset side of the wizard — the step list, validation, dependency
 * clearing and the calculated values. The shell that renders them is generic, so proving
 * the adapter behaves is proving the builder behaves.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFixtureRepositories } from './data/fixtureRepositories.ts';
import { CURRENT_USER_ID } from './data/fixtures.ts';
import { requireRuleset } from './ruleset/registry.ts';
import { id, type CharacterDraft } from './types.ts';

const SYSTEM = id<'GameSystem'>('dnd5e-2024');
const rules = requireRuleset(SYSTEM);

function newDraft(): CharacterDraft {
  return {
    id: id<'CharacterDraft'>('draft-test'),
    systemId: SYSTEM,
    ownerUserId: CURRENT_USER_ID,
    name: '',
    choices: { ruleset: SYSTEM },
    stepId: 'ruleset',
    updatedAt: '2026-08-15T12:00:00.000Z',
  };
}

/** Answers a field and hands back the new draft, exactly as the wizard does. */
function answer(draft: CharacterDraft, field: string, value: unknown): CharacterDraft {
  return rules.applyChoice(draft, field, value);
}

const stepIds = (draft: CharacterDraft) => rules.draftSteps(draft).map((step) => step.id);

test('the step list is generated from the class, not fixed', () => {
  let draft = newDraft();

  // Before a class is chosen there is neither a fighting style nor a spells step.
  const initial = stepIds(draft);
  assert.ok(!initial.includes('style'));
  assert.ok(!initial.includes('spells'));

  draft = answer(draft, 'class', 'fighter');
  const fighter = stepIds(draft);
  assert.ok(fighter.includes('style'), 'a Fighter gains a Fighting style step');
  assert.ok(!fighter.includes('spells'), 'and never sees Spells');

  draft = answer(draft, 'class', 'cleric');
  const cleric = stepIds(draft);
  assert.ok(cleric.includes('spells'));
  assert.ok(!cleric.includes('style'));

  // The count moves with the list, which is what the builder's header reports.
  assert.notEqual(fighter.length, initial.length);
});

test('changing class clears the choices that no longer apply', () => {
  let draft = newDraft();
  draft = answer(draft, 'class', 'fighter');
  draft = answer(draft, 'fightingStyle', 'defence');
  draft = answer(draft, 'skills', ['Athletics', 'Perception']);

  draft = answer(draft, 'class', 'wizard');

  const current = draft.choices as Record<string, unknown>;
  assert.equal(current.fightingStyle, undefined, 'a Wizard has no fighting style');
  assert.equal(current.skills, undefined, 'the Fighter skill list is not the Wizard list');
});

test('validation names the missing field rather than failing the whole step', () => {
  let draft = newDraft();
  draft = answer(draft, 'class', 'fighter');

  const issues = rules.validateStep(draft, 'style');
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.fieldKey, 'fightingStyle');
  assert.match(issues[0]?.message ?? '', /fighting style/i);

  draft = answer(draft, 'fightingStyle', 'defence');
  assert.deepEqual(rules.validateStep(draft, 'style'), []);
});

test('a bounded multiple choice reports how many are still needed', () => {
  let draft = newDraft();
  draft = answer(draft, 'class', 'rogue');
  draft = answer(draft, 'background', 'criminal');

  // A Rogue picks four skills.
  let issues = rules.validateStep(draft, 'proficiencies');
  assert.match(issues[0]?.message ?? '', /Choose 4 more/);

  draft = answer(draft, 'skills', ['Acrobatics', 'Perception']);
  issues = rules.validateStep(draft, 'proficiencies');
  assert.match(issues[0]?.message ?? '', /Choose 2 more/);

  draft = answer(draft, 'skills', ['Acrobatics', 'Perception', 'Investigation', 'Persuasion']);
  assert.deepEqual(rules.validateStep(draft, 'proficiencies'), []);
});

test('a background skill is shown but not selectable twice', () => {
  let draft = newDraft();
  draft = answer(draft, 'class', 'fighter');
  draft = answer(draft, 'background', 'soldier');

  const form = rules.draftStepForm(draft, 'proficiencies');
  const skills = form?.fields.find((entry) => entry.key === 'skills');
  const athletics = skills?.options?.find((option) => option.value === 'Athletics');

  // Soldier already grants Athletics, so spending a class pick on it would be wasted.
  assert.equal(athletics?.disabled, true);
  assert.match(athletics?.disabledReason ?? '', /background/i);
});

test('choosing a background drops a class skill it now grants for free', () => {
  let draft = newDraft();
  draft = answer(draft, 'class', 'fighter');
  draft = answer(draft, 'skills', ['Athletics', 'Perception']);
  draft = answer(draft, 'background', 'soldier');

  assert.deepEqual((draft.choices as Record<string, unknown>).skills, ['Perception']);
});

/**
 * The acceptance criterion: a realistic D&D character all the way to Create, with every
 * deterministic value calculated rather than typed in.
 */
test('a realistic character builds end to end with values calculated', () => {
  let draft = newDraft();

  draft = answer(draft, 'species', 'human');
  draft = answer(draft, 'background', 'soldier');
  draft = answer(draft, 'class', 'fighter');
  draft = answer(draft, 'abilityMethod', 'standard');
  draft = answer(draft, 'abilities', { str: 15, dex: 14, con: 14, int: 10, wis: 12, cha: 13 });
  draft = answer(draft, 'fightingStyle', 'defence');
  draft = answer(draft, 'skills', ['Perception', 'Survival']);
  draft = answer(draft, 'equipment', 'dungeoneer');
  draft = { ...draft, name: 'Aria Nightfall' };

  // Every step in the generated list is satisfied.
  for (const step of rules.draftSteps(draft)) {
    assert.deepEqual(rules.validateStep(draft, step.id), [], `step "${step.id}" is incomplete`);
  }

  const character = rules.draftToCharacter(draft);
  assert.equal(character.name, 'Aria Nightfall');
  assert.equal(character.level, 1);
  assert.equal(character.archetype, 'Fighter');

  // Soldier's 2024 increases are +2 Strength and +1 Constitution, applied on top of the
  // assigned array: STR 15 becomes 17, CON 14 becomes 15.
  const score = (ability: string) =>
    character.attributes.find((attribute) => attribute.key === ability)?.value;
  assert.equal(score('str'), 17);
  assert.equal(score('con'), 15);
  assert.equal(score('dex'), 14);

  // Hit points: a d10 hit die plus the Constitution modifier of +2.
  assert.equal(character.health.max, 12);
  assert.equal(character.health.current, 12);

  // Armour class: chain mail 16, Dexterity capped at 0, plus a shield.
  const derived = rules.deriveCharacter(character);
  const value = (name: string) => derived.find((entry) => entry.key === name)?.value;
  assert.equal(value('ac'), 18);
  assert.equal(value('initiative'), 2);
  assert.equal(value('proficiency'), 2);
});

test('the review reads back grouped, split into chosen and calculated', () => {
  let draft = newDraft();
  draft = answer(draft, 'species', 'human');
  draft = answer(draft, 'background', 'soldier');
  draft = answer(draft, 'class', 'fighter');
  draft = answer(draft, 'abilities', { str: 15, dex: 14, con: 14, int: 10, wis: 12, cha: 13 });
  draft = { ...draft, name: 'Aria Nightfall' };

  const groups = rules.reviewGroups(draft);
  const combat = groups.find((group) => group.title === 'Combat values');

  assert.ok(combat?.calculated, 'combat values are the rules’ work, not the player’s');
  assert.equal(combat?.items.find((item) => item.label === 'Hit points')?.value, '12');
  assert.equal(combat?.items.find((item) => item.label === 'Armour class')?.value, '18');

  // Every group points at the step that produced it, so a correction is one click.
  const steps = new Set(stepIds(draft));
  for (const group of groups) assert.ok(steps.has(group.stepId), `${group.title} has no step`);
});

test('only combat values may be overridden by hand', () => {
  assert.equal(rules.canOverride('hp'), true);
  assert.equal(rules.canOverride('ac'), true);
  assert.equal(rules.canOverride('species'), false);
  assert.equal(rules.canOverride('proficiency'), false);
});

test('an override wins over the calculated value and is honoured downstream', () => {
  let draft = newDraft();
  draft = answer(draft, 'class', 'fighter');
  draft = answer(draft, 'abilities', { str: 15, dex: 14, con: 14, int: 10, wis: 12, cha: 13 });
  draft = answer(draft, 'overrides', { hp: 14, ac: 20 });

  const character = rules.draftToCharacter(draft);
  assert.equal(character.health.max, 14);
  assert.equal(rules.deriveCharacter(character).find((entry) => entry.key === 'ac')?.value, 20);
});

test('a caster gets spell steps and a martial class does not', () => {
  let wizard = newDraft();
  wizard = answer(wizard, 'class', 'wizard');
  const form = rules.draftStepForm(wizard, 'spells');

  assert.ok(form, 'a Wizard has a spells step');
  assert.equal(form?.fields.length, 2, 'cantrips and level 1 spells');
  assert.equal(form?.fields[0]?.choose, 2);

  let fighter = newDraft();
  fighter = answer(fighter, 'class', 'fighter');
  assert.equal(rules.draftStepForm(fighter, 'spells'), null);
});

test('the live summary tolerates a draft with nothing chosen yet', () => {
  // It drives the panel from step one, so an unchosen class means no hit die yet — not a
  // thrown exception that takes the builder down on its first render.
  const character = rules.draftToCharacter(newDraft());
  assert.equal(character.health.max, 0);
  assert.equal(character.attributes.length, 6);
  assert.doesNotThrow(() => rules.deriveCharacter(character));
});

test('drafts autosave, list and finalise into a real character', async () => {
  const store = createFixtureRepositories();

  const draft = await store.drafts.create({ systemId: SYSTEM, ownerUserId: CURRENT_USER_ID });
  assert.equal(draft.stepId, 'ruleset');
  assert.ok((await store.drafts.listForOwner(CURRENT_USER_ID)).some((d) => d.id === draft.id));

  const progressed = await store.drafts.save({ ...draft, name: 'Osric', stepId: 'class' });
  assert.equal(progressed.name, 'Osric');
  assert.equal((await store.drafts.byId(draft.id))?.stepId, 'class');

  const character = rules.draftToCharacter({ ...progressed, choices: { class: 'wizard' } });
  await store.drafts.finalise(draft.id, character);

  // The draft is gone and the character is real.
  assert.equal(await store.drafts.byId(draft.id), null);
  assert.ok(
    (await store.characters.listForOwner(CURRENT_USER_ID)).some(
      (entry) => entry.id === character.id,
    ),
  );
});
