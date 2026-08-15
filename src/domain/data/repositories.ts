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
  CampaignId,
  Character,
  CharacterId,
  CombatInstance,
  CombatInstanceId,
  EncounterTemplate,
  EncounterTemplateId,
  GameSystem,
  Monster,
  MonsterId,
  Roll,
  User,
  UserId,
} from '../types.ts';

export interface CampaignRepository {
  listForUser(userId: UserId): Promise<Campaign[]>;
  byId(campaignId: CampaignId): Promise<Campaign | null>;
}

export interface CharacterRepository {
  listForCampaign(campaignId: CampaignId): Promise<Character[]>;
  listForOwner(userId: UserId): Promise<Character[]>;
  byId(characterId: CharacterId): Promise<Character | null>;
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
  listForCampaign(campaignId: CampaignId): Promise<CombatInstance[]>;
  byId(combatId: CombatInstanceId): Promise<CombatInstance | null>;
}

export interface RollRepository {
  listForCombat(combatId: CombatInstanceId): Promise<Roll[]>;
}

export interface UserRepository {
  current(): Promise<User>;
  byId(userId: UserId): Promise<User | null>;
}

export interface GameSystemRepository {
  list(): Promise<readonly GameSystem[]>;
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
}
