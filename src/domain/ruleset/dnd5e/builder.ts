/**
 * D&D 5e (2024) character-creation content and rules.
 *
 * Everything here is D&D. It reaches the wizard only as `BuilderStepForm` shapes, so the
 * builder shell renders species, classes and ability scores without knowing that any of
 * those words exist.
 *
 * The content is a realistic working subset rather than the whole book — enough to build
 * a genuine character end to end, and enough to cover every fixture character.
 */
import type {
  BuilderField,
  BuilderGrant,
  BuilderIssue,
  BuilderOption,
  BuilderStep,
  BuilderStepForm,
  ReviewGroup,
} from '../Ruleset.ts';
import type { CharacterDraft } from '../../types.ts';
import * as content from './content.ts';
import type { BackgroundDefinition, ClassDefinition, SpeciesDefinition } from './builderTypes.ts';
import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  ABILITY_NAMES,
  abilityModifier,
  proficiencyBonus,
} from './constants.ts';

/* ── Content ────────────────────────────────────────────────────────────────── */

/* ── Content ────────────────────────────────────────────────────────────────── */

/**
 * The catalogue, read rather than written.
 *
 * These were literals here until TC-P06 — a hand-maintained subset with no source, no licence
 * and no way to update it but editing TypeScript. They are content records now, imported from
 * an approved source by the pipeline and read through `content.ts`. The functions below are
 * called rather than the constants they replaced, because a deployment can point the adapter at
 * a different catalogue and everything downstream has to see the change.
 */
export type { BackgroundDefinition, ClassDefinition, SpeciesDefinition } from './builderTypes.ts';

export const SPECIES = (): SpeciesDefinition[] => content.species();
export const BACKGROUNDS = (): BackgroundDefinition[] => content.backgrounds();
export const CLASSES = (): ClassDefinition[] => content.classes();
export const FIGHTING_STYLES = (): BuilderOption[] => content.fightingStyles();
export const EQUIPMENT_PACKS = (): BuilderOption[] => content.equipmentPacks();
export const SPELLS = (): Record<string, { cantrips: BuilderOption[]; first: BuilderOption[] }> =>
  content.spellsByClass();

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

/* ── Reading a draft ────────────────────────────────────────────────────────── */

export interface DraftAnswers {
  species?: string;
  background?: string;
  class?: string;
  fightingStyle?: string;
  abilityMethod?: string;
  /** Ability key → the score assigned to it, before background increases. */
  abilities?: Record<string, number>;
  skills?: string[];
  equipment?: string;
  cantrips?: string[];
  spells?: string[];
  appearance?: string;
  backstory?: string;
  /** Review-step overrides, keyed by derived value. */
  overrides?: Record<string, number>;
}

export function answers(draft: CharacterDraft): DraftAnswers {
  return draft.choices as DraftAnswers;
}

export function classOf(draft: CharacterDraft): ClassDefinition | undefined {
  return CLASSES().find((entry) => entry.key === answers(draft).class);
}

export function speciesOf(draft: CharacterDraft): SpeciesDefinition | undefined {
  return SPECIES().find((entry) => entry.key === answers(draft).species);
}

export function backgroundOf(draft: CharacterDraft): BackgroundDefinition | undefined {
  return BACKGROUNDS().find((entry) => entry.key === answers(draft).background);
}

/** Final ability scores: the assigned array plus the background's 2024 increases. */
export function finalAbilities(draft: CharacterDraft): Record<string, number> {
  const assigned = answers(draft).abilities ?? {};
  const background = backgroundOf(draft);
  const result: Record<string, number> = {};

  for (const key of ABILITY_KEYS) {
    const base = assigned[key] ?? 10;
    const increase = background?.increases.find((entry) => entry.ability === key)?.amount ?? 0;
    result[key] = base + increase;
  }
  return result;
}

/** Level-1 hit points: the class hit die plus the Constitution modifier. */
export function startingHitPoints(draft: CharacterDraft): number {
  const klass = classOf(draft);
  if (!klass) return 0;
  const con = finalAbilities(draft).con ?? 10;
  return klass.hitDie + abilityModifier(con);
}

/* ── Steps ──────────────────────────────────────────────────────────────────── */

function casterKind(classKey: string | undefined): 'full' | 'half' | 'pact' | null {
  if (!classKey) return null;
  if (['cleric', 'wizard', 'druid'].includes(classKey)) return 'full';
  if (classKey === 'ranger') return 'half';
  if (classKey === 'warlock') return 'pact';
  return null;
}

/**
 * The step list, generated from what has been chosen.
 *
 * Choosing a Fighter adds Fighting Style and never shows Spells; choosing a Cleric does
 * the reverse. The count in the header moves with it, which is what the design means by
 * "the left column is the rules engine's output, not a fixed list".
 */
export function draftSteps(draft: CharacterDraft): BuilderStep[] {
  const classKey = answers(draft).class;

  const steps: BuilderStep[] = [
    { id: 'ruleset', label: 'Ruleset', summary: 'Which rules this character follows' },
    { id: 'species', label: 'Species', summary: 'Traits, speed and senses' },
    { id: 'background', label: 'Background', summary: 'Ability increases and two skills' },
    { id: 'class', label: 'Class', summary: 'How this character fights and what they can do' },
    {
      id: 'abilities',
      label: 'Ability scores',
      summary: 'The six numbers everything else derives from',
    },
  ];

  if (classKey === 'fighter') {
    steps.push({ id: 'style', label: 'Fighting style', summary: 'One combat specialism' });
  }
  if (casterKind(classKey)) {
    steps.push({ id: 'spells', label: 'Spells', summary: 'Your starting magic' });
  }

  steps.push(
    { id: 'proficiencies', label: 'Proficiencies', summary: 'The skills you are trained in' },
    { id: 'equipment', label: 'Equipment', summary: 'What you carry' },
    { id: 'details', label: 'Details', optional: true, summary: 'Appearance and backstory' },
    { id: 'review', label: 'Review', summary: 'Check everything before creating' },
  );

  return steps;
}

function toOptions<T extends { key: string; label: string; description: string }>(
  entries: T[],
): BuilderOption[] {
  return entries.map((entry) => ({
    value: entry.key,
    label: entry.label,
    description: entry.description,
  }));
}

/** What a chosen class hands the character, stated in words and marked as calculated. */
function classGrants(draft: CharacterDraft): BuilderGrant[] {
  const klass = classOf(draft);
  if (!klass) return [];

  const con = abilityModifier(finalAbilities(draft).con ?? 10);
  return [
    { label: 'Hit dice', value: `1d${klass.hitDie} per level` },
    {
      label: 'Hit points at level 1',
      value: `${klass.hitDie} + Constitution modifier = ${klass.hitDie + con}`,
    },
    { label: 'Saving throws', value: klass.savingThrows.join(', ') },
    { label: 'Armour and weapons', value: `${klass.armour}, ${klass.weapons}` },
    {
      label: 'Skills',
      value: `Choose ${klass.skillCount} — set on the Proficiencies step`,
    },
    { label: 'Level 1 features', value: klass.levelOneFeatures.join(', ') },
    { label: 'Subclass', value: `Chosen at level ${klass.subclassLevel}` },
  ];
}

export function draftStepForm(draft: CharacterDraft, stepId: string): BuilderStepForm | null {
  const current = answers(draft);
  const klass = classOf(draft);

  switch (stepId) {
    case 'ruleset':
      return {
        stepId,
        title: 'Ruleset',
        intro:
          'The system decides which steps this builder asks for, how initiative and armour class are calculated, and whether death saves exist.',
        fields: [
          {
            key: 'ruleset',
            label: 'Rules',
            kind: 'single-choice',
            required: true,
            options: [
              {
                value: 'dnd5e-2024',
                label: 'Dungeons & Dragons 5e (2024)',
                description: 'The campaign’s system',
              },
            ],
          },
        ],
      };

    case 'species':
      return {
        stepId,
        title: 'Species',
        intro:
          'Species sets your speed, your senses and a handful of traits. It does not restrict your class — anything can be anything.',
        fields: [
          {
            key: 'species',
            label: 'Species',
            kind: 'single-choice',
            required: true,
            columns: 2,
            options: toOptions(SPECIES()),
          },
        ],
        grants: speciesOf(draft)
          ? [
              { label: 'Speed', value: `${speciesOf(draft)?.speed} ft` },
              { label: 'Traits', value: speciesOf(draft)?.traits.join(', ') ?? '' },
            ]
          : undefined,
      };

    case 'background':
      return {
        stepId,
        title: 'Background',
        intro:
          'Under the 2024 rules your background is where your ability score increases come from, along with two skills and one feature.',
        fields: [
          {
            key: 'background',
            label: 'Background',
            kind: 'single-choice',
            required: true,
            columns: 2,
            options: toOptions(BACKGROUNDS()),
          },
        ],
        grants: backgroundOf(draft)
          ? [
              {
                label: 'Ability increases',
                value:
                  backgroundOf(draft)
                    ?.increases.map(
                      (entry) =>
                        `+${entry.amount} ${ABILITY_NAMES[entry.ability as keyof typeof ABILITY_NAMES]}`,
                    )
                    .join(', ') ?? '',
              },
              { label: 'Skills', value: backgroundOf(draft)?.skills.join(', ') ?? '' },
              { label: 'Feature', value: backgroundOf(draft)?.feature ?? '' },
            ]
          : undefined,
      };

    case 'class':
      return {
        stepId,
        title: 'Class',
        intro:
          'A class decides how a character fights, what they can do outside combat, and which later steps appear.',
        fields: [
          {
            key: 'class',
            label: 'Class',
            kind: 'single-choice',
            required: true,
            columns: 3,
            options: toOptions(CLASSES()),
          },
          ...(current.class === 'fighter' ? [] : ([] as BuilderField[])),
        ],
        grants: classGrants(draft),
      };

    case 'style':
      return {
        stepId,
        title: 'Fighting style',
        intro: 'Fighters select one fighting style at level 1.',
        fields: [
          {
            key: 'fightingStyle',
            label: 'Fighting style',
            kind: 'single-choice',
            required: true,
            options: FIGHTING_STYLES(),
          },
        ],
      };

    case 'abilities':
      return {
        stepId,
        title: 'Ability scores',
        intro:
          'Six numbers everything else derives from. The standard array is recommended for a first character — it is balanced and takes one minute.',
        fields: [
          {
            key: 'abilityMethod',
            label: 'How do you want to set your scores?',
            kind: 'single-choice',
            required: true,
            options: [
              {
                value: 'standard',
                label: 'Standard array',
                description: '15, 14, 13, 12, 10, 8 — recommended for a first character',
                recommended: true,
              },
              { value: 'point-buy', label: 'Point buy', description: '27 points to spend' },
              {
                value: 'roll',
                label: 'Roll for them',
                description: '4d6, drop the lowest, six times',
              },
            ],
          },
          {
            key: 'abilities',
            label: 'Assigned',
            kind: 'score-assignment',
            required: true,
            help: 'Tap a score to reassign it. Your background’s increases are added on top.',
            pool: STANDARD_ARRAY,
            slots: ABILITY_KEYS.map((key) => ({ key, label: ABILITY_LABELS[key] })),
          },
        ],
        grants: backgroundOf(draft)
          ? [
              {
                label: `${backgroundOf(draft)?.label} increases`,
                value:
                  backgroundOf(draft)
                    ?.increases.map(
                      (entry) =>
                        `+${entry.amount} ${ABILITY_NAMES[entry.ability as keyof typeof ABILITY_NAMES]}`,
                    )
                    .join(', ') + ' — already included above',
              },
            ]
          : undefined,
      };

    case 'spells': {
      const kind = casterKind(current.class);
      const list = current.class ? SPELLS()[current.class] : undefined;
      if (!kind || !list) return null;

      const fields: BuilderField[] = [];
      if (list.cantrips.length > 0) {
        fields.push({
          key: 'cantrips',
          label: 'Cantrips',
          kind: 'multi-choice',
          required: true,
          choose: 2,
          help: 'Cantrips cost nothing to cast and never run out.',
          options: list.cantrips,
        });
      }
      fields.push({
        key: 'spells',
        label: kind === 'pact' ? 'Pact spells' : 'Level 1 spells',
        kind: 'multi-choice',
        required: true,
        choose: 2,
        help:
          kind === 'pact'
            ? 'Pact magic recovers on a short rest rather than a long one.'
            : 'You can change these after a long rest.',
        options: list.first,
      });

      return {
        stepId,
        title: 'Spells',
        intro:
          'Pick what you can cast. Nothing here is permanent — casters re-prepare as they level.',
        fields,
      };
    }

    case 'proficiencies':
      return {
        stepId,
        title: 'Proficiencies',
        intro: klass
          ? `${klass.label}s choose ${klass.skillCount} skills. Your background already gave you ${backgroundOf(draft)?.skills.join(' and ') ?? 'two more'}.`
          : 'Choose your class first.',
        fields: klass
          ? [
              {
                key: 'skills',
                label: 'Skills',
                kind: 'multi-choice',
                required: true,
                choose: klass.skillCount,
                columns: 2,
                options: klass.skillChoices.map((skill) => ({
                  value: skill,
                  label: skill,
                  // A background skill is already yours; taking it again would waste a pick.
                  disabled: backgroundOf(draft)?.skills.includes(skill),
                  disabledReason: 'Already granted by your background',
                })),
              },
            ]
          : [],
        grants: klass
          ? [
              { label: 'Saving throws', value: klass.savingThrows.join(', ') },
              { label: 'Armour and weapons', value: `${klass.armour}, ${klass.weapons}` },
            ]
          : undefined,
      };

    case 'equipment':
      return {
        stepId,
        title: 'Equipment',
        intro: klass
          ? `A ${klass.label} starts with ${klass.armour.toLowerCase()} and their weapons. Choose the pack you carry.`
          : 'Choose the pack you carry.',
        fields: [
          {
            key: 'equipment',
            label: 'Starting pack',
            kind: 'single-choice',
            required: true,
            columns: 2,
            options: EQUIPMENT_PACKS(),
          },
        ],
        grants: klass
          ? [
              {
                label: 'Armour',
                value:
                  klass.startingArmour === 'none'
                    ? 'None'
                    : klass.startingArmour.replaceAll('-', ' '),
              },
              { label: 'Shield', value: klass.startingShield ? 'Yes' : 'No' },
              { label: 'Weapons', value: klass.weapons },
            ]
          : undefined,
      };

    case 'details':
      return {
        stepId,
        title: 'Details',
        intro: 'Optional. You can fill any of this in later from the character sheet.',
        fields: [
          {
            key: 'appearance',
            label: 'Appearance',
            kind: 'text',
            help: 'A line or two is plenty.',
          },
          { key: 'backstory', label: 'Backstory', kind: 'text', multiline: true },
        ],
      };

    case 'review':
      return { stepId, title: 'Review', review: true, fields: [] };

    default:
      return null;
  }
}

/* ── Validation ─────────────────────────────────────────────────────────────── */

export function validateStep(draft: CharacterDraft, stepId: string): BuilderIssue[] {
  const form = draftStepForm(draft, stepId);
  if (!form) return [];

  const current = answers(draft) as Record<string, unknown>;
  const issues: BuilderIssue[] = [];

  for (const field of form.fields) {
    if (!field.required) continue;
    const value = current[field.key];

    if (field.kind === 'single-choice' && typeof value !== 'string') {
      issues.push({
        fieldKey: field.key,
        message: `Choose a ${field.label.toLowerCase()} to continue`,
      });
    }

    if (field.kind === 'multi-choice') {
      const picked = Array.isArray(value) ? value.length : 0;
      const want = field.choose ?? 1;
      if (picked !== want) {
        const remaining = want - picked;
        issues.push({
          fieldKey: field.key,
          message:
            remaining > 0
              ? `Choose ${remaining} more ${field.label.toLowerCase()}`
              : `Choose ${want} ${field.label.toLowerCase()} — remove ${-remaining}`,
        });
      }
    }

    if (field.kind === 'score-assignment') {
      const assigned = (value ?? {}) as Record<string, number>;
      const missing = (field.slots ?? []).filter((slot) => typeof assigned[slot.key] !== 'number');
      if (missing.length > 0) {
        issues.push({
          fieldKey: field.key,
          message: `Assign a score to ${missing.map((slot) => slot.label).join(', ')}`,
        });
      }
    }
  }

  // The name is asked for on the review step but belongs to the whole character.
  if (stepId === 'review' && draft.name.trim().length === 0) {
    issues.push({ fieldKey: 'name', message: 'Give your character a name' });
  }

  return issues;
}

/* ── Applying a choice ──────────────────────────────────────────────────────── */

/**
 * Records an answer and lets the rules react.
 *
 * Changing class is the interesting case: a fighting style chosen for a Fighter is
 * meaningless on a Wizard, and skills picked from the Rogue list are not on the Cleric's.
 * Silently keeping them would produce a character the rules do not allow, so they are
 * cleared — and the step list regenerates around the new class.
 */
export function applyChoice(
  draft: CharacterDraft,
  fieldKey: string,
  value: unknown,
): CharacterDraft {
  const next: Record<string, unknown> = { ...draft.choices, [fieldKey]: value };

  if (fieldKey === 'class' && value !== answers(draft).class) {
    delete next.fightingStyle;
    delete next.skills;
    delete next.cantrips;
    delete next.spells;
  }

  if (fieldKey === 'background') {
    // Background skills are granted, so a duplicate class pick would be wasted.
    const granted = BACKGROUNDS().find((entry) => entry.key === value)?.skills ?? [];
    const skills = Array.isArray(next.skills) ? (next.skills as string[]) : [];
    next.skills = skills.filter((skill) => !granted.includes(skill));
  }

  if (fieldKey === 'abilityMethod' && value !== answers(draft).abilityMethod) {
    delete next.abilities;
  }

  return { ...draft, choices: next, updatedAt: new Date().toISOString() };
}

/* ── Review ─────────────────────────────────────────────────────────────────── */

export function reviewGroups(draft: CharacterDraft): ReviewGroup[] {
  const current = answers(draft);
  const klass = classOf(draft);
  const background = backgroundOf(draft);
  const scores = finalAbilities(draft);
  const hp = startingHitPoints(draft);

  const groups: ReviewGroup[] = [
    {
      stepId: 'species',
      title: 'Identity',
      items: [
        { label: 'Name', value: draft.name || '—' },
        { label: 'Species', value: speciesOf(draft)?.label ?? '—' },
        { label: 'Background', value: background?.label ?? '—' },
        {
          label: 'Class',
          value: klass
            ? `${klass.label} 1${current.fightingStyle ? ` · ${FIGHTING_STYLES().find((style) => style.value === current.fightingStyle)?.label}` : ''}`
            : '—',
        },
      ],
    },
    {
      stepId: 'abilities',
      title: 'Ability scores',
      items: [
        {
          label: 'Method',
          value:
            current.abilityMethod === 'point-buy'
              ? 'Point buy'
              : current.abilityMethod === 'roll'
                ? 'Rolled'
                : 'Standard array',
        },
        {
          label: 'Scores',
          value: ABILITY_KEYS.map((key) => `${ABILITY_LABELS[key]} ${scores[key]}`).join(' · '),
        },
        {
          label: 'Background bonus',
          value: background
            ? `${background.increases.map((entry) => `+${entry.amount} ${ABILITY_NAMES[entry.ability as keyof typeof ABILITY_NAMES]}`).join(', ')} — applied`
            : '—',
        },
      ],
    },
    {
      stepId: 'class',
      title: 'Combat values',
      calculated: true,
      items: [
        { label: 'Hit points', value: String(current.overrides?.hp ?? hp) },
        { label: 'Armour class', value: String(armourClassFor(draft)) },
        { label: 'Initiative', value: signed(abilityModifier(scores.dex ?? 10)) },
        { label: 'Proficiency bonus', value: signed(proficiencyBonus(1)) },
      ],
    },
    {
      stepId: 'proficiencies',
      title: 'Proficiencies',
      items: [
        {
          label: 'Skills',
          value: [...(background?.skills ?? []), ...(current.skills ?? [])].join(', ') || '—',
        },
        { label: 'Saving throws', value: klass?.savingThrows.join(', ') ?? '—' },
        { label: 'Armour and weapons', value: klass ? `${klass.armour}, ${klass.weapons}` : '—' },
      ],
    },
    {
      stepId: 'equipment',
      title: 'Equipment',
      items: [
        { label: 'Weapons', value: klass?.weapons ?? '—' },
        {
          label: 'Armour',
          value: klass
            ? `${klass.startingArmour === 'none' ? 'None' : klass.startingArmour.replaceAll('-', ' ')}${klass.startingShield ? ', shield' : ''}`
            : '—',
        },
        {
          label: 'Pack',
          value: EQUIPMENT_PACKS().find((pack) => pack.value === current.equipment)?.label ?? '—',
        },
      ],
    },
  ];

  const spellStep = draftSteps(draft).some((step) => step.id === 'spells');
  if (spellStep) {
    const list = current.class ? SPELLS()[current.class] : undefined;
    const label = (value: string) =>
      [...(list?.cantrips ?? []), ...(list?.first ?? [])].find((entry) => entry.value === value)
        ?.label ?? value;

    groups.splice(4, 0, {
      stepId: 'spells',
      title: 'Spells',
      items: [
        { label: 'Cantrips', value: (current.cantrips ?? []).map(label).join(', ') || '—' },
        { label: 'Level 1', value: (current.spells ?? []).map(label).join(', ') || '—' },
      ],
    });
  }

  groups.push({
    stepId: 'details',
    title: 'Privacy',
    items: [
      { label: 'Default', value: 'Visible to party' },
      { label: 'Private sections', value: 'None yet — set these any time from the sheet' },
    ],
  });

  return groups;
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

/** Armour class from the class's starting kit, honouring a review-step override. */
export function armourClassFor(draft: CharacterDraft): number {
  const override = answers(draft).overrides?.ac;
  if (typeof override === 'number') return override;

  const klass = classOf(draft);
  const dex = abilityModifier(finalAbilities(draft).dex ?? 10);

  if (!klass) return 10 + dex;

  const table: Record<string, { base: number; cap: number | null }> = {
    none: { base: 10, cap: null },
    leather: { base: 11, cap: null },
    'studded-leather': { base: 12, cap: null },
    'scale-mail': { base: 14, cap: 2 },
    'chain-mail': { base: 16, cap: 0 },
  };
  const armour = table[klass.startingArmour] ?? table.none;
  const base = armour?.base ?? 10;
  const cap = armour?.cap ?? null;
  const applied = cap === null ? dex : Math.min(dex, cap);

  return base + applied + (klass.startingShield ? 2 : 0);
}

/** Only combat values may be pinned by hand; identity and choices may not. */
export function canOverride(key: string): boolean {
  return key === 'hp' || key === 'ac';
}
