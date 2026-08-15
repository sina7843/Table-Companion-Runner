/**
 * Data access interfaces.
 *
 * Every method is async even though today's implementation is an in-memory fixture set.
 * That is the point: when TC-13 replaces fixtures with a real API and a realtime channel,
 * no calling code changes shape. A synchronous fixture layer would force every consumer
 * to be rewritten the day the network arrives.
 *
 * Library content (ingested monsters, spells, items) and user campaign data are separate
 * repositories on purpose. Requirement: ingestion must stay isolated from user data.
 */
import type {
  Campaign,
  CampaignActivity,
  CampaignId,
  Character,
  CharacterId,
  CombatInstance,
  CombatInstanceId,
  EncounterTemplate,
  EncounterTemplateId,
  GameSystem,
  GameSystemId,
  Monster,
  MonsterId,
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
  limit?: number;
}

export interface MonsterRepository {
  list(query?: MonsterQuery): Promise<Monster[]>;
  byId(monsterId: MonsterId): Promise<Monster | null>;
  count(query?: MonsterQuery): Promise<number>;
}

export interface EncounterRepository {
  listForCampaign(campaignId: CampaignId): Promise<EncounterTemplate[]>;
  byId(encounterId: EncounterTemplateId): Promise<EncounterTemplate | null>;
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
}

export interface RollRepository {
  listForCombat(combatId: CombatInstanceId): Promise<Roll[]>;
}

export interface UserRepository {
  current(): Promise<User>;
  byId(userId: UserId): Promise<User | null>;
  /** Resolves several at once — a party table needs every member's name in one go. */
  byIds(userIds: UserId[]): Promise<User[]>;
}

export interface GameSystemRepository {
  list(): Promise<readonly GameSystem[]>;
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
}
