/**
 * Core domain model. Game-system agnostic by construction.
 *
 * The rule that governs this file: nothing here may name a D&D concept. No ability
 * scores, no armour class, no spell levels, no proficiency bonus. Those exist, but they
 * live behind the ruleset adapter and reach the UI as generic shapes — an `Attribute`,
 * a `DerivedValue`, a `ResourcePool`.
 *
 * What IS core is what every tabletop system in scope shares and what the approved design
 * treats as core UI: identity, ownership, a health track, initiative order, conditions,
 * dice rolls, and who is allowed to see what.
 */

/** Nominal id types, so a MonsterId cannot be passed where a CharacterId is expected. */
declare const brand: unique symbol;
export type Id<TBrand extends string> = string & { readonly [brand]: TBrand };

export type UserId = Id<'User'>;
export type GameSystemId = Id<'GameSystem'>;
export type CampaignId = Id<'Campaign'>;
export type CharacterId = Id<'Character'>;
export type MonsterId = Id<'Monster'>;
export type EncounterTemplateId = Id<'EncounterTemplate'>;
export type CombatInstanceId = Id<'CombatInstance'>;
export type ParticipantId = Id<'CombatParticipant'>;
export type RollId = Id<'Roll'>;
export type ConditionId = Id<'Condition'>;

/** Casts a raw string to a branded id. The only sanctioned way in. */
export function id<TBrand extends string>(value: string): Id<TBrand> {
  return value as Id<TBrand>;
}

/** ISO-8601 timestamp. Kept as a string so domain objects stay trivially serialisable. */
export type Timestamp = string;

/* ── People and systems ─────────────────────────────────────────────────────── */

export interface User {
  id: UserId;
  displayName: string;
}

/**
 * A supported rules system. `status` is what lets the design show Pathfinder 2e with a
 * stated reason rather than hiding it — the only place unavailable content appears in
 * Phase 1.
 */
export interface GameSystem {
  id: GameSystemId;
  name: string;
  /** Short line describing content coverage, shown on the system picker. */
  summary: string;
  status: 'ready' | 'unavailable';
  /** Required when status is 'unavailable'. Shown verbatim; never invent a vague one. */
  unavailableReason?: string;
}

/* ── Visibility and membership ──────────────────────────────────────────────── */

/**
 * Who may see a thing. Ordered from most to least visible. The design gives privacy its
 * own hue (violet) and never conveys it by colour alone.
 */
export type Visibility = 'public' | 'party' | 'private' | 'dm-only' | 'secret';

export type CampaignRole = 'dm' | 'player';

export interface CampaignMember {
  userId: UserId;
  role: CampaignRole;
  /** The character this member plays. Absent for the DM. */
  characterId?: CharacterId;
}

export interface Campaign {
  id: CampaignId;
  name: string;
  systemId: GameSystemId;
  /** Phase 1 has exactly one DM per campaign; co-DM is later. */
  dmUserId: UserId;
  inviteCode: string;
  members: CampaignMember[];
  createdAt: Timestamp;
}

/* ── Generic character and creature shapes ──────────────────────────────────── */

/**
 * A named numeric attribute. In D&D these are the six ability scores; the core neither
 * knows nor cares which six, or that there are six.
 */
export interface Attribute {
  key: string;
  label: string;
  value: number;
  /** Ruleset-computed modifier, when the system has one. */
  modifier?: number;
}

/**
 * A value the ruleset derives rather than the user entering. Carries its own explanation
 * so the UI can show what the system worked out and why, which the design requires:
 * "a new player should never have to work out which numbers the system moved".
 */
export interface DerivedValue {
  key: string;
  label: string;
  value: number | string;
  /** Plain-language derivation, e.g. "10 + Dexterity modifier + chain mail". */
  explanation?: string;
  /** True when the DM or player has overridden the calculated value. */
  overridden?: boolean;
}

/**
 * A spendable, recoverable pool: spell slots, superiority dice, ki, rage uses. Generic on
 * purpose — the UI renders pips and a count without knowing what it is counting.
 */
export interface ResourcePool {
  key: string;
  label: string;
  max: number;
  used: number;
  /** Grouping label, e.g. spell level. Rendered as-is. */
  tier?: string;
}

/** Hit points. Universal enough across the systems in scope to sit in the core. */
export interface HealthTrack {
  current: number;
  max: number;
  temporary: number;
}

/** An applied condition instance. Its definition comes from the ruleset. */
export interface Condition {
  id: ConditionId;
  /** Matches a ConditionDefinition key from the active ruleset. */
  key: string;
  label: string;
  tone: 'neutral' | 'buff' | 'debuff' | 'concentration' | 'danger';
  /** Free text: "2 rounds", "1 min", "until save". Systems disagree; the core does not parse it. */
  duration?: string;
  source?: string;
}

/** Death-save progress. Only meaningful when the ruleset reports the capability. */
export interface DeathSaves {
  successes: number;
  failures: number;
}

export type EntityType = 'player' | 'monster' | 'npc' | 'ally';

/**
 * Which parts of a character sheet the player has hidden from the rest of the party.
 * The DM always retains full access; see `permissions.ts`.
 */
export type CharacterSectionKey =
  'overview' | 'abilities' | 'actions' | 'inventory' | 'features' | 'background';

export interface Character {
  id: CharacterId;
  systemId: GameSystemId;
  /** Absent while the character is not yet in a campaign. Characters outlive campaigns. */
  campaignId?: CampaignId;
  ownerUserId: UserId;
  name: string;
  /** Ruleset-shaped summary line, e.g. "Human Fighter 6". Built by the adapter. */
  subtitle: string;
  level: number;
  attributes: Attribute[];
  resources: ResourcePool[];
  health: HealthTrack;
  conditions: Condition[];
  /** Per-section visibility. Missing keys default to 'party'. */
  sectionVisibility: Partial<Record<CharacterSectionKey, Visibility>>;
  /** Set while the character is an incomplete builder draft. */
  draft?: { step: number; totalSteps: number };
  /** Unspent level-up waiting for the player. */
  pendingLevelUp?: boolean;
  /**
   * Ruleset-owned data the core does not interpret. The 5e adapter reads its class,
   * species, background and equipment out of here.
   */
  systemData: Readonly<Record<string, unknown>>;
}

export interface MonsterAction {
  name: string;
  /** Rendered as-is; the ruleset composes it. */
  description: string;
  attackBonus?: string;
  damage?: string;
}

export interface Monster {
  id: MonsterId;
  systemId: GameSystemId;
  name: string;
  subtitle: string;
  /**
   * Where this record came from. Library content is ingested reference data and is never
   * mixed with user campaign data; homebrew is owned by a user and editable.
   */
  origin: 'library' | 'homebrew';
  ownerUserId?: UserId;
  /** Ruleset-formatted difficulty label, e.g. "CR 3". Never parsed by the core. */
  challengeLabel: string;
  /** Sort key for difficulty, so generic list code can order without understanding CR. */
  challengeRank: number;
  attributes: Attribute[];
  health: HealthTrack;
  derived: DerivedValue[];
  traits: MonsterAction[];
  actions: MonsterAction[];
  systemData: Readonly<Record<string, unknown>>;
}

/* ── Encounters and combat ──────────────────────────────────────────────────── */

export interface EncounterEntry {
  id: string;
  monsterId: MonsterId;
  count: number;
  /** Hidden from players until it acts. Renders with the DM-only treatment. */
  hidden?: boolean;
}

/**
 * A reusable template. Starting it creates a separate CombatInstance, so the same
 * encounter can be run more than once without losing what happened the first time.
 */
export interface EncounterTemplate {
  id: EncounterTemplateId;
  campaignId: CampaignId;
  name: string;
  entries: EncounterEntry[];
  /** Ruleset-computed difficulty, e.g. "deadly · 9,600 adj. XP". */
  difficultyLabel?: string;
  notes?: string;
  lastRunAt?: Timestamp;
}

export type ParticipantState = 'active' | 'waiting' | 'unconscious' | 'defeated';

export interface CombatParticipant {
  id: ParticipantId;
  name: string;
  subtitle: string;
  entityType: EntityType;
  /** Null until initiative has been rolled or entered. */
  initiative: number | null;
  health: HealthTrack;
  conditions: Condition[];
  state: ParticipantState;
  deathSaves?: DeathSaves;
  /** Hidden from player devices entirely until revealed. */
  visibility: Visibility;
  /** Identical monsters share one grouped initiative entry, expandable per member. */
  groupKey?: string;
  /** What this participant was created from. */
  source:
    { kind: 'character'; characterId: CharacterId } | { kind: 'monster'; monsterId: MonsterId };
}

export type CombatStatus = 'preparing' | 'live' | 'ended';

export interface CombatInstance {
  id: CombatInstanceId;
  campaignId: CampaignId;
  encounterTemplateId?: EncounterTemplateId;
  name: string;
  /** Where the fight is happening. Shown in the top bar. */
  location?: string;
  status: CombatStatus;
  round: number;
  /** Null while preparing. */
  activeParticipantId: ParticipantId | null;
  participants: CombatParticipant[];
  startedAt?: Timestamp;
  endedAt?: Timestamp;
}

/* ── Dice ───────────────────────────────────────────────────────────────────── */

export type RollOutcome = 'normal' | 'critical' | 'fumble';
export type RollMode = 'normal' | 'advantage' | 'disadvantage';

export interface RolledDie {
  sides: number;
  value: number;
  /** Discarded by advantage or disadvantage. Still shown — it is auditable math. */
  dropped?: boolean;
}

export interface Roll {
  id: RollId;
  combatId?: CombatInstanceId;
  /** Who rolled, as displayed. */
  actor: string;
  title: string;
  /** The expression as entered, e.g. "1d20 + 5". */
  expression: string;
  mode: RollMode;
  dice: RolledDie[];
  modifier: number;
  total: number;
  outcome: RollOutcome;
  /** A secret roll is visible to the DM only; the design gives the DM that choice. */
  visibility: Visibility;
  at: Timestamp;
}
