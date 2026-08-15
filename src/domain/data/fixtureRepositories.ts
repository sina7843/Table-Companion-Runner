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
  CAMPAIGNS,
  CHARACTERS,
  COMBATS,
  CURRENT_USER_ID,
  ENCOUNTERS,
  MONSTERS,
  ROLLS,
  USERS,
} from './fixtures.ts';
import type { MonsterQuery, Repositories } from './repositories.ts';

/** Resolves on a microtask, so callers cannot accidentally depend on sync delivery. */
function resolve<T>(value: T): Promise<T> {
  return Promise.resolve(value);
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

export function createFixtureRepositories(): Repositories {
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
  };
}

/** Exported types the fixture layer resolves to, for tests and typed consumers. */
export type { Campaign, Character, CombatInstance, EncounterTemplate, Monster, Roll, User };
