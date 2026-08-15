/**
 * In-memory repository implementations backed by the fixtures.
 *
 * Deliberately dumb: filter, sort, resolve. No caching, no optimistic updates, no
 * subscription machinery — those belong with the real transport in TC-13, and building
 * them now would mean guessing at an API that does not exist yet.
 *
 * Every method returns a Promise and hands back deep-frozen data, so a screen that
 * mutates what it reads fails here rather than in production.
 */
import { listGameSystems } from '../ruleset/registry.ts';
import type {
  Campaign,
  CampaignId,
  Character,
  CharacterId,
  CombatInstance,
  CombatInstanceId,
  EncounterTemplate,
  EncounterTemplateId,
  Monster,
  MonsterId,
  Roll,
  User,
  UserId,
} from '../types.ts';
import {
  ACTIVITY as ALL_ACTIVITY,
  CAMPAIGNS as ALL_CAMPAIGNS,
  CHARACTERS as ALL_CHARACTERS,
  COMBATS as ALL_COMBATS,
  CURRENT_USER_ID,
  ENCOUNTERS as ALL_ENCOUNTERS,
  MONSTERS as ALL_MONSTERS,
  RECENTS as ALL_RECENTS,
  ROLLS,
  USERS,
} from './fixtures.ts';
import type { MonsterQuery, Repositories } from './repositories.ts';

/**
 * Which world the fixtures describe.
 *
 * The screens have to handle a first-time user, an empty library, a slow network and a
 * failed read. Those are real branches in the UI, and a branch nobody can reach is a
 * branch nobody has checked — so the fixture layer can present each of them on demand.
 * `RepositoryProvider` reads `?scenario=` from the URL to pick one.
 */
export type FixtureScenario =
  /** The design's own world: a live fight, four characters, two campaigns. */
  | 'populated'
  /** A brand-new account: no campaigns, no characters, nothing running. */
  | 'first-time'
  /** Signed up, but nothing created yet in an existing campaign. */
  | 'empty'
  /** Never resolves, so the loading state stays on screen. */
  | 'loading'
  /** Every read rejects, so the recoverable error path renders. */
  | 'error';

export interface FixtureOptions {
  scenario?: FixtureScenario;
  /** Artificial latency in milliseconds, for eyeballing the loading state. */
  delayMs?: number;
}

class FixtureReadError extends Error {
  constructor() {
    // Phrased the way the design phrases errors: what happened, what is still safe, what
    // to do next — and never a word about the transport.
    super('The connection dropped while loading. Nothing has been lost.');
    this.name = 'FixtureReadError';
  }
}

function matchesMonsterQuery(monster: Monster, query?: MonsterQuery): boolean {
  if (!query) return true;
  if (query.origin && monster.origin !== query.origin) return false;
  if (query.search) {
    const needle = query.search.trim().toLowerCase();
    if (needle && !monster.name.toLowerCase().includes(needle)) return false;
  }
  return true;
}

export function createFixtureRepositories(options: FixtureOptions = {}): Repositories {
  const { scenario = 'populated', delayMs = 0 } = options;

  /** Resolves on a microtask, so callers cannot depend on synchronous delivery. */
  const resolve = <T>(value: T): Promise<T> => {
    if (scenario === 'error') return Promise.reject(new FixtureReadError());
    if (scenario === 'loading') return new Promise<T>(() => {});
    if (delayMs > 0) return new Promise((done) => setTimeout(() => done(value), delayMs));
    return Promise.resolve(value);
  };

  // 'first-time' and 'empty' differ in what survives: a first-time user has no campaigns
  // at all, while 'empty' keeps the campaign and strips what lives inside it.
  const bare = scenario === 'first-time' || scenario === 'empty';
  const CAMPAIGNS = scenario === 'first-time' ? [] : ALL_CAMPAIGNS;
  const CHARACTERS = bare ? [] : ALL_CHARACTERS;
  const COMBATS = bare ? [] : ALL_COMBATS;
  const ENCOUNTERS = bare ? [] : ALL_ENCOUNTERS;
  const MONSTERS = bare ? [] : ALL_MONSTERS;
  const RECENTS = bare ? [] : ALL_RECENTS;
  const ACTIVITY = bare ? [] : ALL_ACTIVITY;

  return {
    users: {
      current: () =>
        resolve(
          USERS.find((user) => user.id === CURRENT_USER_ID) ??
            ({ id: CURRENT_USER_ID, displayName: 'Unknown' } satisfies User),
        ),
      byId: (userId: UserId) => resolve(USERS.find((user) => user.id === userId) ?? null),
    },

    gameSystems: {
      list: () => resolve(listGameSystems()),
    },

    campaigns: {
      listForUser: (userId: UserId) =>
        resolve(
          CAMPAIGNS.filter((campaign) =>
            campaign.members.some((member) => member.userId === userId),
          ),
        ),
      byId: (campaignId: CampaignId) =>
        resolve(CAMPAIGNS.find((campaign) => campaign.id === campaignId) ?? null),
    },

    characters: {
      listForCampaign: (campaignId: CampaignId) =>
        resolve(CHARACTERS.filter((character) => character.campaignId === campaignId)),
      listForOwner: (userId: UserId) =>
        resolve(CHARACTERS.filter((character) => character.ownerUserId === userId)),
      byId: (characterId: CharacterId) =>
        resolve(CHARACTERS.find((character) => character.id === characterId) ?? null),
    },

    monsters: {
      list: (query?: MonsterQuery) => {
        const matched = MONSTERS.filter((monster) => matchesMonsterQuery(monster, query)).toSorted(
          (a, b) => a.name.localeCompare(b.name),
        );
        return resolve(query?.limit ? matched.slice(0, query.limit) : matched);
      },
      byId: (monsterId: MonsterId) =>
        resolve(MONSTERS.find((monster) => monster.id === monsterId) ?? null),
      count: (query?: MonsterQuery) =>
        resolve(MONSTERS.filter((monster) => matchesMonsterQuery(monster, query)).length),
    },

    encounters: {
      listForCampaign: (campaignId: CampaignId) =>
        resolve(ENCOUNTERS.filter((encounter) => encounter.campaignId === campaignId)),
      byId: (encounterId: EncounterTemplateId) =>
        resolve(ENCOUNTERS.find((encounter) => encounter.id === encounterId) ?? null),
    },

    combats: {
      liveForCampaign: (campaignId: CampaignId) =>
        resolve(
          COMBATS.find((combat) => combat.campaignId === campaignId && combat.status === 'live') ??
            null,
        ),
      liveForUser: (userId: UserId) => {
        const mine = new Set(
          CAMPAIGNS.filter((campaign) =>
            campaign.members.some((member) => member.userId === userId),
          ).map((campaign) => campaign.id),
        );
        return resolve(
          COMBATS.find((combat) => combat.status === 'live' && mine.has(combat.campaignId)) ?? null,
        );
      },
      listForCampaign: (campaignId: CampaignId) =>
        resolve(COMBATS.filter((combat) => combat.campaignId === campaignId)),
      byId: (combatId: CombatInstanceId) =>
        resolve(COMBATS.find((combat) => combat.id === combatId) ?? null),
    },

    rolls: {
      listForCombat: (combatId: CombatInstanceId) =>
        resolve(
          ROLLS.filter((roll) => roll.combatId === combatId).toSorted((a, b) =>
            b.at.localeCompare(a.at),
          ),
        ),
    },

    recents: {
      listForUser: (_userId: UserId, limit = 7) =>
        resolve(RECENTS.toSorted((a, b) => b.at.localeCompare(a.at)).slice(0, limit)),
    },

    activity: {
      listForUser: (userId: UserId, limit = 4) => {
        const mine = new Set(
          CAMPAIGNS.filter((campaign) =>
            campaign.members.some((member) => member.userId === userId),
          ).map((campaign) => campaign.id),
        );
        return resolve(
          ACTIVITY.filter((entry) => mine.has(entry.campaignId))
            .toSorted((a, b) => b.at.localeCompare(a.at))
            .slice(0, limit),
        );
      },
    },
  };
}

/** Exported types the fixture layer resolves to, for tests and typed consumers. */
export type { Campaign, Character, CombatInstance, EncounterTemplate, Monster, Roll, User };
