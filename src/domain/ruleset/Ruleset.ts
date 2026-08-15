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

  /** Steps for advancing a character. The list is generated, not fixed. */
  levelUpSteps(character: Character, toLevel: number): BuilderStep[];

  /** Applies damage or healing, honouring the system's rules about temporary hit points. */
  applyHealthDelta(health: HealthTrack, delta: number): HealthTrack;

  /** Rolls a dice request. */
  evaluateRoll(request: DiceRequest, modifier: number, random: RandomSource): RollEvaluation;
}
