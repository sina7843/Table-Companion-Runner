/**
 * The D&D 5e (2024) ruleset adapter — the first implementation of `Ruleset`.
 *
 * Everything D&D-shaped is either here or in `./constants`. Nothing outside this
 * directory imports either file; the registry resolves this adapter and the rest of the
 * application talks to the `Ruleset` interface.
 */
import {
  id,
  type Attribute,
  type Character,
  type CharacterDraft,
  type CombatParticipant,
  type DeathSaves,
  type DerivedValue,
  type GameSystem,
  type HealthTrack,
  type Monster,
  type ResourcePool,
  type RollOutcome,
  type RolledDie,
} from '../../types.ts';
import type {
  BuilderStep,
  ConditionDefinition,
  DiceRequest,
  RandomSource,
  RollEvaluation,
  Ruleset,
  RulesetCapabilities,
} from '../Ruleset.ts';
import {
  answers,
  applyChoice as builderApplyChoice,
  backgroundOf,
  canOverride as builderCanOverride,
  classOf,
  draftStepForm as builderStepForm,
  draftSteps as builderSteps,
  finalAbilities,
  reviewGroups as builderReviewGroups,
  speciesOf,
  startingHitPoints,
  validateStep as builderValidateStep,
} from './builder.ts';
import {
  applyLevelUp as sheetApplyLevelUp,
  challengeScale as sheetChallengeScale,
  monsterActionGroups as sheetMonsterActionGroups,
  monsterFacets as sheetMonsterFacets,
  levelUpChanges as sheetLevelUpChanges,
  levelUpStepForm as sheetLevelUpStepForm,
  sheetContent as sheetContentFor,
  sheetSections as sheetSectionsFor,
  validateLevelUpStep as sheetValidateLevelUpStep,
} from './sheet.ts';
import {
  estimateChallenge as homebrewEstimateChallenge,
  hitPointsFromDice as homebrewHitPointsFromDice,
  normaliseMonster as homebrewNormaliseMonster,
  validateMonster as homebrewValidateMonster,
} from './homebrew.ts';
import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  ARMOUR,
  CONDITIONS,
  DEATH_SAVE_TARGET,
  FULL_CASTER_CLASSES,
  FULL_CASTER_SLOTS,
  HALF_CASTER_CLASSES,
  PACT_CASTER_CLASSES,
  PACT_SLOTS_BY_LEVEL,
  SHIELD_BONUS,
  UNARMOURED_BASE_AC,
  abilityModifier,
  proficiencyBonus,
} from './constants.ts';

/** The shape this adapter expects inside `Character.systemData`. */
interface Dnd5eCharacterData {
  classKey?: string;
  className?: string;
  subclass?: string;
  species?: string;
  background?: string;
  armour?: string;
  shield?: boolean;
  /** Set when the DM or player has pinned armour class to a fixed number. */
  armourClassOverride?: number;
}

function characterData(character: Character): Dnd5eCharacterData {
  return character.systemData as Dnd5eCharacterData;
}

function modifierFor(attributes: Attribute[], key: string): number {
  const attribute = attributes.find((entry) => entry.key === key);
  return attribute ? abilityModifier(attribute.value) : 0;
}

const SYSTEM: GameSystem = {
  id: id<'GameSystem'>('dnd5e-2024'),
  name: 'Dungeons & Dragons 5e (2024)',
  summary: 'Full character builder, monsters, spells and items',
  status: 'ready',
};

const CAPABILITIES: RulesetCapabilities = {
  deathSaves: true,
  spellcasting: true,
  levelling: true,
  temporaryHitPoints: true,
  advantage: true,
};

/** Armour class: armour base, a capped Dexterity contribution, then a shield. */
function armourClass(character: Character): DerivedValue {
  const data = characterData(character);

  if (typeof data.armourClassOverride === 'number') {
    return {
      key: 'ac',
      label: 'Armour class',
      value: data.armourClassOverride,
      explanation: 'Set by hand',
      overridden: true,
    };
  }

  const armour = ARMOUR[data.armour ?? 'none'] ?? ARMOUR.none;
  // `noUncheckedIndexedAccess` makes the lookup optional even with the fallback above.
  const base = armour?.baseAc ?? UNARMOURED_BASE_AC;
  const dexMod = modifierFor(character.attributes, 'dex');
  const cap = armour?.dexCap ?? null;
  const appliedDex = cap === null ? dexMod : Math.min(dexMod, cap);
  const shield = data.shield ? SHIELD_BONUS : 0;

  const parts = [`${base} ${armour?.label ?? 'no armour'}`];
  if (appliedDex !== 0) parts.push(`${appliedDex >= 0 ? '+' : ''}${appliedDex} Dexterity`);
  if (shield) parts.push(`+${shield} shield`);

  return {
    key: 'ac',
    label: 'Armour class',
    value: base + appliedDex + shield,
    explanation: parts.join(' '),
  };
}

function casterProgression(classKey: string | undefined): 'full' | 'half' | 'pact' | null {
  if (!classKey) return null;
  if (FULL_CASTER_CLASSES.has(classKey)) return 'full';
  if (HALF_CASTER_CLASSES.has(classKey)) return 'half';
  if (PACT_CASTER_CLASSES.has(classKey)) return 'pact';
  return null;
}

/** Parses "2d6+3" / "1d20 - 1" into dice groups and a flat modifier. */
function parseExpression(expression: string): {
  groups: { count: number; sides: number }[];
  modifier: number;
} {
  const groups: { count: number; sides: number }[] = [];
  let modifier = 0;

  // Normalise the minus signs the design uses in its sample data (− U+2212).
  const normalised = expression.replaceAll('−', '-').replaceAll(/\s+/g, '');
  const terms = normalised.match(/[+-]?[^+-]+/g) ?? [];

  for (const term of terms) {
    const sign = term.startsWith('-') ? -1 : 1;
    const body = term.replace(/^[+-]/, '');
    const dice = /^(\d*)d(\d+)$/i.exec(body);
    if (dice) {
      groups.push({ count: Number(dice[1] || '1'), sides: Number(dice[2]) });
    } else if (body.length > 0) {
      modifier += sign * Number(body);
    }
  }

  return { groups, modifier };
}

export const dnd5e2024: Ruleset = {
  system: SYSTEM,
  capabilities: CAPABILITIES,
  conditions: CONDITIONS as readonly ConditionDefinition[],

  deriveCharacter(character: Character): DerivedValue[] {
    const data = characterData(character);
    const proficiency = proficiencyBonus(character.level);
    const dexMod = modifierFor(character.attributes, 'dex');
    const wisMod = modifierFor(character.attributes, 'wis');

    return [
      armourClass(character),
      {
        key: 'initiative',
        label: 'Initiative',
        value: dexMod,
        explanation: 'Dexterity modifier',
      },
      {
        key: 'proficiency',
        label: 'Proficiency bonus',
        value: proficiency,
        explanation: `Level ${character.level}`,
      },
      {
        key: 'passive-perception',
        label: 'Passive Perception',
        value: 10 + wisMod,
        explanation: '10 + Wisdom modifier',
      },
      {
        key: 'class',
        label: 'Class',
        value: data.subclass ? `${data.className} (${data.subclass})` : (data.className ?? '—'),
      },
    ];
  },

  deriveMonster(monster: Monster): DerivedValue[] {
    // Monster records arrive from ingested library content with their values already
    // stated, so this normalises rather than recalculates — a stat block is authoritative.
    return monster.derived;
  },

  initiativeRequest(participant: CombatParticipant, attributes: Attribute[]): DiceRequest {
    const dexMod = modifierFor(attributes, 'dex');
    const sign = dexMod >= 0 ? '+' : '−';
    return {
      expression: `1d20 ${sign} ${Math.abs(dexMod)}`,
      mode: 'normal',
      title: `${participant.name} — Initiative`,
    };
  },

  spellSlots(character: Character): ResourcePool[] | null {
    const progression = casterProgression(characterData(character).classKey);
    if (!progression) return null;

    if (progression === 'pact') {
      const entry = PACT_SLOTS_BY_LEVEL[Math.min(character.level, PACT_SLOTS_BY_LEVEL.length) - 1];
      if (!entry) return null;
      return [
        {
          key: 'pact-slots',
          label: `Level ${entry.level} slots`,
          tier: `Level ${entry.level}`,
          max: entry.count,
          used: 0,
        },
      ];
    }

    // A half caster uses the full-caster table at half its level, rounded down.
    const effective = progression === 'half' ? Math.floor(character.level / 2) : character.level;
    const row = FULL_CASTER_SLOTS[Math.min(effective, FULL_CASTER_SLOTS.length) - 1];
    if (!row) return null;

    return row.map((count, index) => ({
      key: `slot-${index + 1}`,
      label: `Level ${index + 1}`,
      tier: `Level ${index + 1}`,
      max: count,
      used: 0,
    }));
  },

  deathSaveOutcome(saves: DeathSaves): 'stable' | 'dead' | 'pending' {
    if (saves.failures >= DEATH_SAVE_TARGET) return 'dead';
    if (saves.successes >= DEATH_SAVE_TARGET) return 'stable';
    return 'pending';
  },

  characterCreationSteps(character: Partial<Character>): BuilderStep[] {
    const data = (character.systemData ?? {}) as Dnd5eCharacterData;
    const classKey = data.classKey;

    const steps: BuilderStep[] = [
      { id: 'ruleset', label: 'Ruleset' },
      { id: 'species', label: 'Species' },
      { id: 'background', label: 'Background' },
      { id: 'class', label: 'Class' },
      { id: 'abilities', label: 'Ability scores' },
    ];

    // The step list is the rules engine's output, not a fixed sequence: choosing Fighter
    // removes Spells and adds Fighting Style, and the step count moves with it.
    if (classKey === 'fighter') {
      steps.push({ id: 'fighting-style', label: 'Fighting style' });
    } else if (casterProgression(classKey)) {
      steps.push({ id: 'spells', label: 'Spells' });
    }

    steps.push(
      { id: 'proficiencies', label: 'Proficiencies' },
      { id: 'equipment', label: 'Equipment' },
      { id: 'details', label: 'Details', optional: true },
      { id: 'review', label: 'Review' },
    );

    return steps;
  },

  levelUpSteps(character: Character, toLevel: number): BuilderStep[] {
    const data = characterData(character);
    const steps: BuilderStep[] = [{ id: 'hit-points', label: 'Hit points' }];

    // Subclass is chosen at 3rd level in the 2024 rules.
    if (toLevel === 3) steps.push({ id: 'subclass', label: 'Subclass' });

    // Ability score improvements land at these levels for most classes.
    if ([4, 8, 12, 16, 19].includes(toLevel)) {
      steps.push({ id: 'asi', label: 'Ability score improvement' });
    }

    if (data.classKey === 'fighter' && data.subclass === 'Battle Master') {
      steps.push({ id: 'manoeuvre', label: 'Manoeuvre' });
    }

    if (casterProgression(data.classKey)) {
      steps.push({ id: 'spells', label: 'Spells' });
    }

    steps.push({ id: 'review', label: 'Review changes' });
    return steps;
  },

  /* ── The guided builder ─────────────────────────────────────────────────── */

  draftSteps: builderSteps,
  draftStepForm: builderStepForm,
  validateStep: builderValidateStep,
  applyChoice: builderApplyChoice,
  reviewGroups: builderReviewGroups,
  canOverride: builderCanOverride,

  /* ── The character sheet and level up ───────────────────────────────────── */

  monsterFacets: sheetMonsterFacets,
  monsterActionGroups: sheetMonsterActionGroups,
  normaliseMonster: homebrewNormaliseMonster,
  validateMonster: homebrewValidateMonster,
  estimateChallenge: homebrewEstimateChallenge,
  hitPointsFromDice: homebrewHitPointsFromDice,
  challengeScale: sheetChallengeScale,
  sheetSections: sheetSectionsFor,
  sheetContent: sheetContentFor,
  levelUpStepForm: sheetLevelUpStepForm,
  validateLevelUpStep: sheetValidateLevelUpStep,
  levelUpChanges: sheetLevelUpChanges,
  applyLevelUp: sheetApplyLevelUp,

  /**
   * The character a draft currently describes.
   *
   * Tolerates every missing choice, because it drives the live summary from step one —
   * an unchosen class means no hit die yet, not an exception.
   */
  draftToCharacter(draft: CharacterDraft): Character {
    const scores = finalAbilities(draft);
    const klass = classOf(draft);
    const species = speciesOf(draft);
    const background = backgroundOf(draft);
    const answered = answers(draft);

    const hitPoints = answered.overrides?.hp ?? startingHitPoints(draft);
    const subtitle = [species?.label, klass?.label, klass ? '1' : null]
      .filter(Boolean)
      .join(' ')
      .trim();

    return {
      id: id<'Character'>(draft.id),
      systemId: draft.systemId,
      campaignId: draft.campaignId,
      ownerUserId: draft.ownerUserId,
      name: draft.name,
      subtitle: subtitle || 'New character',
      archetype: klass?.label,
      level: 1,
      attributes: ABILITY_KEYS.map((key) => ({
        key,
        label: ABILITY_LABELS[key],
        value: scores[key] ?? 10,
        modifier: abilityModifier(scores[key] ?? 10),
      })),
      resources: [],
      health: { current: hitPoints, max: hitPoints, temporary: 0 },
      conditions: [],
      sectionVisibility: {},
      systemData: {
        classKey: klass?.key,
        className: klass?.label,
        species: species?.label,
        background: background?.label,
        armour: klass?.startingArmour ?? 'none',
        shield: klass?.startingShield ?? false,
        fightingStyle: answered.fightingStyle,
        skills: answered.skills,
        cantrips: answered.cantrips,
        spells: answered.spells,
        equipment: answered.equipment,
        appearance: answered.appearance,
        backstory: answered.backstory,
        ...(answered.overrides?.ac === undefined
          ? {}
          : { armourClassOverride: answered.overrides.ac }),
      },
    };
  },

  applyHealthDelta(health: HealthTrack, delta: number): HealthTrack {
    if (delta >= 0) {
      // Healing never exceeds the maximum and does not touch temporary hit points.
      return { ...health, current: Math.min(health.max, health.current + delta) };
    }

    // Damage comes off temporary hit points first, then real ones. Current is floored at
    // zero: 5e tracks "how far below zero" through death saves, not negative hit points.
    const damage = Math.abs(delta);
    const absorbed = Math.min(health.temporary, damage);
    return {
      ...health,
      temporary: health.temporary - absorbed,
      current: Math.max(0, health.current - (damage - absorbed)),
    };
  },

  evaluateRoll(request: DiceRequest, modifier: number, random: RandomSource): RollEvaluation {
    const parsed = parseExpression(request.expression);
    const totalModifier = parsed.modifier + modifier;
    const dice: RolledDie[] = [];

    for (const group of parsed.groups) {
      for (let index = 0; index < group.count; index++) {
        dice.push({ sides: group.sides, value: 1 + Math.floor(random() * group.sides) });
      }
    }

    // Advantage and disadvantage roll a second d20 and drop one. The dropped die stays in
    // the list — it is part of the auditable math the table may want to check.
    const d20Index = dice.findIndex((die) => die.sides === 20);
    if (request.mode !== 'normal' && d20Index >= 0) {
      const first = dice[d20Index];
      if (first) {
        const second: RolledDie = { sides: 20, value: 1 + Math.floor(random() * 20) };
        const keepSecond =
          request.mode === 'advantage' ? second.value > first.value : second.value < first.value;
        first.dropped = keepSecond;
        second.dropped = !keepSecond;
        dice.splice(d20Index + 1, 0, second);
      }
    }

    const kept = dice.filter((die) => !die.dropped);
    const total = kept.reduce((sum, die) => sum + die.value, 0) + totalModifier;

    const keptD20 = kept.find((die) => die.sides === 20);
    let outcome: RollOutcome = 'normal';
    if (keptD20?.value === 20) outcome = 'critical';
    else if (keptD20?.value === 1) outcome = 'fumble';

    return { dice, modifier: totalModifier, total, outcome };
  },
};

export { ABILITY_LABELS };
