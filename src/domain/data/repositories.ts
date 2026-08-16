/**
 * Data access interfaces — the persistence contract.
 *
 * Every method is async, which is what let the in-memory fixture set be swapped for
 * `createHttpRepositories` without a single calling screen changing shape. Two
 * implementations satisfy this file; `createDataSource` picks one from configuration.
 *
 * Library content (ingested monsters, spells, items) and user campaign data are separate
 * repositories on purpose. Requirement: ingestion must stay isolated from user data.
 *
 * ── The write policy, stated once ───────────────────────────────────────────
 *
 * **Every document write is idempotent.** `save` takes the whole record and replaces it, so
 * an autosave that fires three times with the same object is one outcome, not three. That is
 * what makes both a debounce and a retry safe to write anywhere above this line.
 *
 * **Combat is not a document.** It has more than one writer, so it is commands rather than
 * saves: a caller states an intent and a version, and the authority computes the result. A
 * command carries its own id, so a retry is recognised; a stale version is refused rather
 * than merged. See `CombatRepository.command`.
 *
 * **Autosave is the screen's, not this layer's.** A repository has no timer. The encounter
 * builder debounces and flushes on every exit path; combat does not debounce at all,
 * because a fight that started before its roster saved would be the worst bug this product
 * could have. Both call the same `save`.
 *
 * **Optimism is allowed where the local state is already authoritative and the write is
 * idempotent** — which is encounter editing: the screen holds the new state, shows it
 * immediately, and on failure keeps it and offers to send it again. It is not allowed where
 * the server assigns something the client cannot know: `create`, `duplicate`, `cloneFrom`
 * and `startFromTemplate` all mint an id, so their callers wait. Since TC-P04 combat is in
 * that second group: the fight the server returns is the fight, and the screen shows it.
 *
 * **Nothing here caches or retries.** Retrying belongs to the screen that knows whether the
 * user is still looking at the thing, and staleness is handled by the realtime channel
 * telling a screen to re-read.
 */
import type { CombatCommand } from '../combat/commands.ts';
import type {
  Campaign,
  CampaignActivity,
  CampaignId,
  Character,
  CharacterDraft,
  CharacterDraftId,
  CharacterId,
  CombatInstance,
  CombatInstanceId,
  EncounterTemplate,
  EncounterTemplateId,
  GameSystem,
  GameSystemId,
  Monster,
  MonsterId,
  ParticipantId,
  RecentItem,
  Roll,
  User,
  UserId,
} from '../types.ts';

export interface CreateCampaignInput {
  name: string;
  systemId: GameSystemId;
  dmUserId: UserId;
}

export interface CampaignRepository {
  listForUser(userId: UserId): Promise<Campaign[]>;
  byId(campaignId: CampaignId): Promise<Campaign | null>;
  /** Phase 1 has exactly one DM per campaign; the creator is it. */
  create(input: CreateCampaignInput): Promise<Campaign>;
  /**
   * Joins the campaign an invite code belongs to, as a player.
   *
   * The code is resolved by the server, which is the only party that knows whether it is
   * real, current and unspent. A caller who is already a member gets the campaign back
   * unchanged, so a double tap is not an error.
   */
  acceptInvite(code: string): Promise<Campaign>;
}

/**
 * Sign in, sign up, sign out.
 *
 * Deliberately three methods and no fourth. There is no token here to hold and no refresh to
 * schedule: the server sets an HttpOnly session cookie the browser attaches on its own and
 * renews on its own, so nothing in the client can leak a credential it never receives.
 * "Am I still signed in" is `users.current()`, which every screen already asks.
 */
export interface AuthRepository {
  signIn(input: { email: string; password: string }): Promise<User>;
  signUp(input: { email: string; password: string; displayName: string }): Promise<User>;
  signOut(): Promise<void>;
}

export interface CharacterRepository {
  listForCampaign(campaignId: CampaignId): Promise<Character[]>;
  listForOwner(userId: UserId): Promise<Character[]>;
  /** Characters exist independently of campaigns; these are the unattached ones. */
  listUnattached(userId: UserId): Promise<Character[]>;
  byId(characterId: CharacterId): Promise<Character | null>;
  /**
   * Attaches an existing independent character to a campaign.
   *
   * A character outlives any campaign, so this is a link rather than a move — the
   * requirement is that a player brings a character they already have.
   */
  attachToCampaign(characterId: CharacterId, campaignId: CampaignId): Promise<Character>;
}

export interface MonsterQuery {
  search?: string;
  /** Homebrew is user-owned; library content is ingested reference data. */
  origin?: Monster['origin'];
  /**
   * Facet key to the values that satisfy it. Values within a facet are OR-ed, facets are
   * AND-ed — picking Dragon and Undead widens, adding a size narrows.
   */
  facets?: Record<string, string[]>;
  /** Inclusive difficulty range, using `Monster.challengeRank`. */
  challengeMin?: number;
  challengeMax?: number;
  sort?: 'challenge-desc' | 'challenge-asc' | 'name';
  /**
   * Page size. The server applies its own ceiling, so a caller cannot ask for everything —
   * this library is fifty creatures today and an ingest pipeline away from thousands.
   */
  limit?: number;
  /** Page offset, in rows. Zero or absent is the first page. */
  offset?: number;
}

export interface MonsterRepository {
  list(query?: MonsterQuery): Promise<Monster[]>;
  byId(monsterId: MonsterId): Promise<Monster | null>;
  count(query?: MonsterQuery): Promise<number>;

  /**
   * Homebrew writes. Library content is ingested reference data and is never edited
   * through here — `create` and `save` always produce a homebrew record, so a DM cannot
   * accidentally change what the book says.
   */
  create(monster: Monster): Promise<Monster>;
  save(monster: Monster): Promise<Monster>;
  remove(monsterId: MonsterId): Promise<void>;
  /** Copies a library entry into the user's own collection. The original is untouched. */
  cloneFrom(sourceId: MonsterId, ownerUserId: UserId, ownerName: string): Promise<Monster>;
}

export interface EncounterRepository {
  listForCampaign(campaignId: CampaignId): Promise<EncounterTemplate[]>;
  byId(encounterId: EncounterTemplateId): Promise<EncounterTemplate | null>;

  create(input: { campaignId: CampaignId; name: string }): Promise<EncounterTemplate>;
  /** Autosave. The builder calls this on every change. */
  save(encounter: EncounterTemplate): Promise<EncounterTemplate>;
  remove(encounterId: EncounterTemplateId): Promise<void>;
  /**
   * A separate template with the same roster. How a DM safely reuses a fight they have
   * already run, so it is offered next to the destructive actions rather than behind them.
   */
  duplicate(encounterId: EncounterTemplateId): Promise<EncounterTemplate>;
}

export interface CombatRepository {
  /** The fight currently running in this campaign, if any. */
  liveForCampaign(campaignId: CampaignId): Promise<CombatInstance | null>;
  /**
   * The fight this user can resume, across every campaign they are in.
   *
   * A single call rather than one per campaign: "Continue active combat" is the first
   * thing both homes ask for, and a DM with six campaigns should not pay six round trips
   * to find out there is nothing running.
   */
  liveForUser(userId: UserId): Promise<CombatInstance | null>;
  listForCampaign(campaignId: CampaignId): Promise<CombatInstance[]>;
  byId(combatId: CombatInstanceId): Promise<CombatInstance | null>;

  /**
   * Creates a new fight from a template.
   *
   * The instance is a copy: hit points, conditions and initiative change on it and the
   * template is never written to. Running the same prepared encounter twice therefore
   * produces two independent instances, which is the whole reason templates exist.
   */
  startFromTemplate(encounterId: EncounterTemplateId): Promise<CombatInstance>;

  /**
   * Changes a fight by saying what you are trying to do.
   *
   * Replaced the whole-record write at TC-P04. A caller no longer computes the new state and
   * sends it: it states an intent, and the authority works out what that means from the state
   * it holds. Hit points, turn order, death saves and initiative are never taken from a
   * request — which is what stops two devices at one table overwriting each other.
   *
   * Only ever touches the instance. There is deliberately no path from here back to the
   * `EncounterTemplate`: a fight cannot edit the fight it was prepared as.
   */
  command(input: CombatCommandInput): Promise<CombatCommandOutcome>;
}

export interface CombatCommandInput {
  combatId: CombatInstanceId;
  /**
   * The caller's id for this command.
   *
   * A retry after a dropped response carries the same one, and is answered with where the
   * fight actually is rather than applied a second time. Generate one per user action, not
   * per attempt.
   */
  commandId: string;
  /**
   * The `version` of the fight this command was built from.
   *
   * A command built on a version that has since moved is refused rather than merged. The
   * caller re-reads and decides again — which is the only behaviour that cannot silently lose
   * somebody's change.
   */
  expectedVersion: number;
  command: CombatCommand;
}

export interface CombatCommandOutcome {
  /** The authoritative fight after the command, carrying its new `version`. */
  combat: CombatInstance;
  /** The audit row this produced. */
  seq: number;
  /** One line naming what happened, for the log. */
  summary?: string;
  /** True when this was a retry of a command already applied, and nothing changed. */
  replayed?: boolean;
  /** Damage landed on someone concentrating. Advisory — the screen may prompt. */
  concentration?: { participantId: ParticipantId; damage: number };
  /** How a death save came out, so the log can say so. */
  deathSave?: { outcome: 'stable' | 'dead' | 'pending'; revived: boolean; total: number };
}

export interface RollRepository {
  /** Most recent first. The log is a history a DM may read back after a session. */
  listForCombat(combatId: CombatInstanceId): Promise<Roll[]>;
  /**
   * Appends a roll. There is no update and no delete: the design is explicit that
   * corrections are additive, so an undo writes a correction line rather than rewriting
   * what happened.
   */
  record(roll: Roll): Promise<Roll>;
}

export interface UserRepository {
  current(): Promise<User>;
  byId(userId: UserId): Promise<User | null>;
  /** Resolves several at once — a party table needs every member's name in one go. */
  byIds(userIds: UserId[]): Promise<User[]>;
  /**
   * Changes something about the signed-in account. Self-scoped: there is no id to pass,
   * because there is no other account this may reach.
   */
  updateSelf(input: { displayName: string }): Promise<User>;
}

export interface GameSystemRepository {
  list(): Promise<readonly GameSystem[]>;
}

export interface CreateDraftInput {
  systemId: GameSystemId;
  ownerUserId: UserId;
  campaignId?: CampaignId;
  name?: string;
}

/**
 * Character drafts. Separate from `CharacterRepository` because a draft is not a
 * character yet — it has no rules-valid shape and must never appear in a party.
 */
export interface DraftRepository {
  listForOwner(userId: UserId): Promise<CharacterDraft[]>;
  byId(draftId: CharacterDraftId): Promise<CharacterDraft | null>;
  create(input: CreateDraftInput): Promise<CharacterDraft>;
  /** Autosave. Called on every answer, so it must be cheap and idempotent. */
  save(draft: CharacterDraft): Promise<CharacterDraft>;
  discard(draftId: CharacterDraftId): Promise<void>;
  /** Turns a finished draft into a real character and removes the draft. */
  finalise(draftId: CharacterDraftId, character: Character): Promise<Character>;
}

export interface RecentsRepository {
  /** Most recent first. The DM home shows one row of these. */
  listForUser(userId: UserId, limit?: number): Promise<RecentItem[]>;
}

export interface ActivityRepository {
  /** What the party changed since the DM last looked, most recent first. */
  listForUser(userId: UserId, limit?: number): Promise<CampaignActivity[]>;
}

/** The full data surface, injected as one object so screens take what they need. */
export interface Repositories {
  auth: AuthRepository;
  users: UserRepository;
  gameSystems: GameSystemRepository;
  campaigns: CampaignRepository;
  characters: CharacterRepository;
  monsters: MonsterRepository;
  encounters: EncounterRepository;
  combats: CombatRepository;
  rolls: RollRepository;
  recents: RecentsRepository;
  activity: ActivityRepository;
  drafts: DraftRepository;
}
