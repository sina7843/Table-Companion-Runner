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
  /**
   * The system's word for what kind of character this is — class in D&D, calling or
   * archetype elsewhere. Generic on purpose: rosters need one short label per character
   * and every system in scope has one, but the core never interprets its value.
   */
  archetype?: string;
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
  /**
   * Ready-to-roll expressions with modifiers already applied, built by the ruleset.
   * Every action a creature has is rollable from wherever it is shown.
   */
  rolls?: { label: string; expression: string }[];
  /**
   * Resource and timing state: "Recharge 5–6", "3 per round", "2 left". A DM tracking
   * Legendary Resistance on paper is exactly what this product exists to remove, so the
   * remaining count travels with the action rather than living in someone's memory.
   */
  tags?: string[];
  /** Grouping marker within a group — a spell's level, an action's cost. */
  tier?: string;
}

/**
 * A named set of things a creature can do: actions, bonus actions, reactions, legendary
 * actions, spells. Grouped rather than flat because the groups are how a DM reads a
 * creature mid-turn, and because a majority of published creatures above the mid ranks
 * have at least one group beyond plain actions.
 */
export interface MonsterActionGroup {
  key: string;
  label: string;
  /** Qualifier shown beside the heading, e.g. "3 per round". */
  note?: string;
  entries: MonsterAction[];
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
  /**
   * The library entry this was copied from. Kept so the editor can say what changed and
   * the DM can tell at a glance that this is a variant rather than something invented.
   * The original is never modified.
   */
  clonedFrom?: MonsterId;
  /** Ruleset-formatted difficulty label, e.g. "CR 3". Never parsed by the core. */
  challengeLabel: string;
  /** Sort key for difficulty, so generic list code can order without understanding CR. */
  challengeRank: number;
  /** Where the record came from, e.g. "Monster Manual" or the owner's name. A column. */
  source: string;
  /**
   * Named, multi-valued tags the active ruleset defines — creature type, size,
   * environment. The core never interprets a key or a value; it filters and groups by
   * them, which is what lets one library screen serve any system's taxonomy.
   */
  facets: Readonly<Record<string, string[]>>;
  attributes: Attribute[];
  health: HealthTrack;
  derived: DerivedValue[];
  traits: MonsterAction[];
  /** Actions, reactions, legendary actions and spells, in the order a DM reads them. */
  actionGroups: MonsterActionGroup[];
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
  /** Where the fight happens. Carried into the combat instance's top bar. */
  location?: string;
  entries: EncounterEntry[];
  /**
   * Characters sitting this one out, for a split party.
   *
   * An exclusion list rather than a roster: the party is whoever is in the campaign, so a
   * character who joins next week is in every prepared fight without the DM reopening
   * twelve templates to add them.
   */
  absentCharacterIds?: CharacterId[];
  /** DM-only setup notes. Never sent to a player device. */
  notes?: string;
  updatedAt?: Timestamp;
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

/* ── Character drafts ───────────────────────────────────────────────────────── */

export type CharacterDraftId = Id<'CharacterDraft'>;

/**
 * A character part-way through the builder.
 *
 * The core owns identity, ownership and where the user got to. It does NOT own what any
 * of the choices mean: `choices` is a bag the active ruleset writes and reads, keyed by
 * the field keys that ruleset declared. That is what lets the same wizard shell drive a
 * different system without a line of it changing.
 *
 * An incomplete character is a legitimate thing to have — the design is explicit that
 * "Save and finish later" stays enabled even when the step is invalid.
 */
export interface CharacterDraft {
  id: CharacterDraftId;
  systemId: GameSystemId;
  ownerUserId: UserId;
  campaignId?: CampaignId;
  name: string;
  /** Ruleset-interpreted answers, keyed by `BuilderField.key`. */
  choices: Readonly<Record<string, unknown>>;
  /** Which step the user is on. */
  stepId: string;
  updatedAt: Timestamp;
}

/* ── Recall and activity ────────────────────────────────────────────────────── */

/** What an entry in the recall list or the activity feed points at. */
export type EntityKind = 'campaign' | 'character' | 'monster' | 'encounter' | 'combat' | 'spell';

/**
 * One entry in "Recently opened".
 *
 * The design's reasoning: a DM preparing a session returns to the same six things
 * repeatedly, and recall is cheaper than making them search each time. It is a flat,
 * mixed list — monsters, encounters and characters together, most recent first.
 */
export interface RecentItem {
  id: string;
  kind: EntityKind;
  label: string;
  /** Where opening it goes. Built when the entry is recorded, not derived by the UI. */
  href: string;
  at: Timestamp;
}

/**
 * Something a player did that the DM needs to know before play — a levelled character,
 * an unspent level-up, a section hidden from the party.
 *
 * Not analytics. The design is explicit that the DM's home carries no session counts, no
 * XP graphs and no "campaign health"; this is a work queue, and every entry is actionable.
 */
export type CampaignActivityKind =
  'levelled' | 'level-up-pending' | 'privacy-changed' | 'character-edited' | 'character-created';

export interface CampaignActivity {
  id: string;
  campaignId: CampaignId;
  kind: CampaignActivityKind;
  /** Headline, e.g. "Quill Featherwind reached level 7". */
  summary: string;
  /** Supporting line, e.g. "Devin · 2 hours ago · Assassinate added". */
  detail: string;
  characterId?: CharacterId;
  at: Timestamp;
}
