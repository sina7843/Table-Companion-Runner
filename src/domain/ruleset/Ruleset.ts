/**
 * The ruleset seam.
 *
 * Everything a rules system decides lives behind this interface: how initiative is
 * rolled, how defence is calculated, whether death saves exist at all, what a level-up
 * asks for. Generic UI and state code depends on this interface and never on a concrete
 * adapter — `src/domain/ruleset/dnd5e` is imported by the registry and by its own tests,
 * and nowhere else. `domain.test.ts` enforces that.
 *
 * D&D 5e is the first adapter, not the shape of the interface. Where a method would only
 * make sense for D&D, it is expressed as a capability the ruleset may decline.
 */
import type {
  Attribute,
  Character,
  CharacterDraft,
  CharacterSectionKey,
  CombatParticipant,
  Condition,
  DeathSaves,
  DerivedValue,
  GameSystem,
  HealthTrack,
  Monster,
  ResourcePool,
  RollMode,
  RolledDie,
  RollOutcome,
} from '../types.ts';

/**
 * What this system supports. The UI asks before rendering, so a system without death
 * saves simply never shows them rather than showing them disabled.
 */
export interface RulesetCapabilities {
  /** Downed characters roll to stabilise. */
  deathSaves: boolean;
  /** Characters have recoverable magic resources. */
  spellcasting: boolean;
  /** Characters gain levels through a guided flow. */
  levelling: boolean;
  /** Temporary hit points stack on top of the health track. */
  temporaryHitPoints: boolean;
  /** Rolls can be made with advantage or disadvantage. */
  advantage: boolean;
}

export interface ConditionDefinition {
  key: string;
  label: string;
  tone: Condition['tone'];
  /** Phosphor icon name. Every state carries a glyph as well as a colour. */
  icon: string;
  description: string;
}

/** One step in a guided character-creation or level-up flow. */
export interface BuilderStep {
  id: string;
  label: string;
  /** Steps the rules engine adds or removes based on earlier choices. */
  optional?: boolean;
  /** Short line describing what this step decides. */
  summary?: string;
}

/* ── The builder's step schema ──────────────────────────────────────────────── */

/**
 * How a builder step asks its question.
 *
 * The wizard shell renders these and nothing else. It has no idea what a species or a
 * fighting style is — it knows how to present a single choice, a bounded multiple choice,
 * an assignment of numbers to named slots, and some text. Adding a system means writing
 * an adapter that emits these shapes, not touching the wizard.
 */
export type BuilderFieldKind = 'single-choice' | 'multi-choice' | 'score-assignment' | 'text';

export interface BuilderOption {
  value: string;
  label: string;
  /** Meta line under the label, e.g. "d10 · martial · no spells". */
  description?: string;
  /** Shown but not selectable, with the reason stated rather than left to guess. */
  disabled?: boolean;
  disabledReason?: string;
  /** Marks the option the system suggests for a first-time player. */
  recommended?: boolean;
}

export interface BuilderScoreSlot {
  key: string;
  label: string;
}

export interface BuilderField {
  key: string;
  label: string;
  kind: BuilderFieldKind;
  required?: boolean;
  /** Beginner-facing explanation of what this field decides. */
  help?: string;
  /** `single-choice` and `multi-choice`. */
  options?: BuilderOption[];
  /** `multi-choice`: exactly how many must be picked. */
  choose?: number;
  /** `score-assignment`: the numbers to place. */
  pool?: number[];
  /** `score-assignment`: the named slots to place them in. */
  slots?: BuilderScoreSlot[];
  /** `text`: render a textarea rather than a single line. */
  multiline?: boolean;
  /** Layout hint only — the shell may ignore it. */
  columns?: number;
}

/** Something the rules calculated as a consequence of this step's choices. */
export interface BuilderGrant {
  label: string;
  value: string;
}

/**
 * One step's question, ready to render.
 *
 * `grants` is the design's "What this class gives you" — the dependencies a choice pulls
 * in, stated in words and marked as calculated, so a player can see what the system
 * decided for them and an experienced one can check it.
 */
export interface BuilderStepForm {
  stepId: string;
  title: string;
  /** The framing sentence above the fields. */
  intro?: string;
  fields: BuilderField[];
  grants?: BuilderGrant[];
  /** True for the terminal review step, which the shell renders differently. */
  review?: boolean;
}

/* ── The character sheet ────────────────────────────────────────────────────── */

/**
 * One tab on the sheet.
 *
 * Ordered by how often a player touches it during play, not by importance on paper.
 * `privacyKey` links the tab to the section a player can hide from the party.
 */
export interface SheetSection {
  id: string;
  label: string;
  /** Shown beside the label when it helps — number of actions, number of items. */
  count?: number;
  privacyKey?: CharacterSectionKey;
}

/** A row that can be rolled: an attack, an action, a spell. */
export interface RollableEntry {
  key: string;
  name: string;
  /**
   * Ready-to-roll expressions with modifiers already applied, e.g. `1d20 + 7`. The
   * design requires the arithmetic to arrive done and still be checkable.
   */
  rolls?: { label: string; expression: string }[];
  /** Mono meta line: damage, range, casting time. */
  meta?: string[];
  tags?: string[];
  /** Grouping marker — spell level, action cost. */
  tier?: string;
  /**
   * False for something known but not currently available. Never hidden: the design is
   * explicit that hiding an unprepared spell makes a player think they lost it.
   */
  prepared?: boolean;
  description?: string;
}

/** A label/value pair: a skill, a saving throw. */
export interface ValueEntry {
  key: string;
  label: string;
  value: string;
  /** Trained in it. Rendered with a word, not colour alone. */
  proficient?: boolean;
  /** Set when the value can be rolled directly. */
  expression?: string;
}

/** What one sheet tab contains. A section uses whichever of these it needs. */
export interface SheetContent {
  /** Rollable rows: attacks, actions, spells. */
  rollables?: RollableEntry[];
  /** Two-up pairs: skills, saving throws. */
  values?: ValueEntry[];
  /** Long-form, secondary to everything above. */
  prose?: { name: string; text: string }[];
  /** Pips pinned above the list, e.g. spell slots. */
  resources?: ResourcePool[];
}

/* ── Library filtering ──────────────────────────────────────────────────────── */

/**
 * A filterable facet of the monster library.
 *
 * The library screen renders whatever the ruleset declares, so a system with different
 * creature taxonomy gets working filters without the screen changing. `primary` marks the
 * one or two that do most of the work and are shown before "More filters".
 */
export interface FacetDefinition {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  /** Shown in the filter bar by default rather than behind "More filters". */
  primary?: boolean;
}

/* ── Level up ───────────────────────────────────────────────────────────────── */

/**
 * One line of what a level-up did.
 *
 * The design splits these into what the player chose and what the rules applied, and
 * calls that split the single most useful thing the screen can do for someone who does
 * not know the rules.
 */
export interface LevelUpChange {
  key: string;
  summary: string;
  detail?: string;
  /** Short delta badge, e.g. `+9` or `No change`. */
  badge?: string;
  /** Marks a change that added something rather than moving a number. */
  isNew?: boolean;
}

export interface LevelUpOutcome {
  chosen: LevelUpChange[];
  automatic: LevelUpChange[];
}

/** A specific, bounded validation failure. */
export interface BuilderIssue {
  /** The field that is missing or wrong, so the shell can outline exactly that group. */
  fieldKey: string;
  message: string;
}

/** One block of the review screen. */
export interface ReviewGroup {
  /** The step this block came from, so a correction is one click rather than a hunt. */
  stepId: string;
  title: string;
  /** True when the rules produced these values rather than the player choosing them. */
  calculated?: boolean;
  items: BuilderGrant[];
}

/** A dice expression the ruleset produced, ready to roll. */
export interface DiceRequest {
  expression: string;
  mode: RollMode;
  /** What the roll is for, used as the roll's title. */
  title: string;
}

export interface RollEvaluation {
  dice: RolledDie[];
  modifier: number;
  total: number;
  outcome: RollOutcome;
}

/** Source of randomness, injected so rolls are testable and later server-authoritative. */
export type RandomSource = () => number;

export interface Ruleset {
  readonly system: GameSystem;
  readonly capabilities: RulesetCapabilities;
  readonly conditions: readonly ConditionDefinition[];

  /** Values the system calculates for a character: defence, initiative, and so on. */
  deriveCharacter(character: Character): DerivedValue[];

  /** The same for a creature. Keeps monster sheets consistent with character sheets. */
  deriveMonster(monster: Monster): DerivedValue[];

  /** The initiative roll for a participant, or null if the system does not roll for it. */
  initiativeRequest(participant: CombatParticipant, attributes: Attribute[]): DiceRequest | null;

  /** Recoverable pools, or null when the system has no spellcasting. */
  spellSlots(character: Character): ResourcePool[] | null;

  /**
   * What a death-save tally means right now, or null when the system has no death saves.
   * Returning 'pending' means the character is still rolling.
   */
  deathSaveOutcome(saves: DeathSaves): 'stable' | 'dead' | 'pending' | null;

  /** Steps for building a new character, given what has been chosen so far. */
  characterCreationSteps(character: Partial<Character>): BuilderStep[];

  /* ── The guided builder ───────────────────────────────────────────────────── */

  /**
   * The step list for a draft. Generated, not fixed: choosing a Fighter removes the
   * Spells step and adds Fighting Style, and the step count moves with it.
   */
  draftSteps(draft: CharacterDraft): BuilderStep[];

  /** The question this step asks, or null when the step id is not in the current list. */
  draftStepForm(draft: CharacterDraft, stepId: string): BuilderStepForm | null;

  /**
   * What is missing on this step. Empty means the step is complete.
   *
   * Bounded on purpose: the design requires the alert to name the missing choice and the
   * footer to state how many remain, which needs issues per field rather than a boolean.
   */
  validateStep(draft: CharacterDraft, stepId: string): BuilderIssue[];

  /**
   * Records an answer and lets the rules react — choosing a class may clear a fighting
   * style that no longer applies, or re-apply a background's ability bonuses.
   */
  applyChoice(draft: CharacterDraft, fieldKey: string, value: unknown): CharacterDraft;

  /**
   * The character a draft currently describes, however incomplete.
   *
   * Drives the live summary, so it must tolerate missing choices rather than throwing —
   * a builder that crashes on step 2 because step 7 is empty is useless.
   */
  draftToCharacter(draft: CharacterDraft): Character;

  /** The review screen's grouped read-back, split into chosen and calculated. */
  reviewGroups(draft: CharacterDraft): ReviewGroup[];

  /**
   * Whether a derived value may be overridden by hand on the review step. The design
   * allows it for combat values and not for everything.
   */
  canOverride(key: string): boolean;

  /* ── The character sheet ──────────────────────────────────────────────────── */

  /**
   * Facets worth filtering the creature library by, with their options. Ordered; the
   * `primary` ones surface before "More filters".
   */
  monsterFacets(): FacetDefinition[];

  /** Difficulty values this system uses, ascending, for a range filter. */
  challengeScale(): { value: number; label: string }[];

  /** The tabs this system's sheet has, in the order a player reaches for them. */
  sheetSections(character: Character): SheetSection[];

  /** What one tab contains. Unknown ids return an empty section rather than throwing. */
  sheetContent(character: Character, sectionId: string): SheetContent;

  /* ── Level up ─────────────────────────────────────────────────────────────── */

  /**
   * The question a level-up step asks. Reuses the builder's field schema, so the same
   * shell renders both flows.
   */
  levelUpStepForm(
    character: Character,
    toLevel: number,
    stepId: string,
    choices: Readonly<Record<string, unknown>>,
  ): BuilderStepForm | null;

  /** What is still missing on a level-up step. */
  validateLevelUpStep(
    character: Character,
    toLevel: number,
    stepId: string,
    choices: Readonly<Record<string, unknown>>,
  ): BuilderIssue[];

  /** What this level-up will do, split into the player's decisions and the rules'. */
  levelUpChanges(
    character: Character,
    toLevel: number,
    choices: Readonly<Record<string, unknown>>,
  ): LevelUpOutcome;

  /** Applies the level-up, producing the advanced character. */
  applyLevelUp(
    character: Character,
    toLevel: number,
    choices: Readonly<Record<string, unknown>>,
  ): Character;

  /** Steps for advancing a character. The list is generated, not fixed. */
  levelUpSteps(character: Character, toLevel: number): BuilderStep[];

  /** Applies damage or healing, honouring the system's rules about temporary hit points. */
  applyHealthDelta(health: HealthTrack, delta: number): HealthTrack;

  /** Rolls a dice request. */
  evaluateRoll(request: DiceRequest, modifier: number, random: RandomSource): RollEvaluation;
}
