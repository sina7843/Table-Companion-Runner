/**
 * The `Repositories` surface over HTTP.
 *
 * One `request` helper and one method per repository call, each naming the route it uses
 * from `apiContract.ts`. There is no caching, no retry loop and no optimistic layer here on
 * purpose: retries belong to the screen that knows whether the user is still looking at the
 * thing, and optimism belongs where the state lives. A repository's job is to be the wire.
 *
 * Constructed only when `VITE_API_BASE_URL` is set. With it unset the application runs on
 * fixtures and never reaches this file.
 */
import { API_ROUTES, ApiError, type ApiConfig, type ApiRoute } from './apiContract.ts';
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
  Monster,
  MonsterId,
  RecentItem,
  Roll,
  User,
  UserId,
} from '../types.ts';
import type {
  CreateCampaignInput,
  CreateDraftInput,
  MonsterQuery,
  Repositories,
} from './repositories.ts';

function queryFor(query?: MonsterQuery): string {
  if (!query) return '';
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.origin) params.set('origin', query.origin);
  if (query.sort) params.set('sort', query.sort);
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.challengeMin !== undefined) params.set('challengeMin', String(query.challengeMin));
  if (query.challengeMax !== undefined) params.set('challengeMax', String(query.challengeMax));
  for (const [facet, values] of Object.entries(query.facets ?? {})) {
    if (values.length > 0) params.set(`facet.${facet}`, values.join(','));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

export function createHttpRepositories(config: ApiConfig): Repositories {
  const call = config.fetch ?? globalThis.fetch.bind(globalThis);
  const base = config.baseUrl.replace(/\/+$/, '');

  async function request<T>(route: ApiRoute, path: string, body?: unknown): Promise<T> {
    const { method } = API_ROUTES[route];

    let response: Response;
    try {
      response = await call(`${base}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          // Forwarded, never obtained here. This client has no credential of its own.
          ...(config.authorization ? { Authorization: config.authorization } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        credentials: 'same-origin',
      });
    } catch {
      // A network failure is status 0 — retryable, and distinguishable from a rejection.
      throw new ApiError(0, route, 'Could not reach the server.');
    }

    if (!response.ok) {
      throw new ApiError(response.status, route, `${method} ${path} failed (${response.status}).`);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  return {
    users: {
      current: () => request<User>('users.current', API_ROUTES['users.current'].path()),
      byId: (userId: UserId) =>
        request<User | null>('users.byId', API_ROUTES['users.byId'].path(userId)),
      byIds: (userIds: UserId[]) =>
        request<User[]>('users.byIds', API_ROUTES['users.byIds'].path(userIds.join(','))),
    },

    gameSystems: {
      list: () =>
        request<readonly GameSystem[]>('gameSystems.list', API_ROUTES['gameSystems.list'].path()),
    },

    campaigns: {
      listForUser: (userId: UserId) =>
        request<Campaign[]>(
          'campaigns.listForUser',
          API_ROUTES['campaigns.listForUser'].path(userId),
        ),
      byId: (campaignId: CampaignId) =>
        request<Campaign | null>('campaigns.byId', API_ROUTES['campaigns.byId'].path(campaignId)),
      create: (input: CreateCampaignInput) =>
        request<Campaign>('campaigns.create', API_ROUTES['campaigns.create'].path(), input),
    },

    characters: {
      listForCampaign: (campaignId: CampaignId) =>
        request<Character[]>(
          'characters.listForCampaign',
          API_ROUTES['characters.listForCampaign'].path(campaignId),
        ),
      listForOwner: (userId: UserId) =>
        request<Character[]>(
          'characters.listForOwner',
          API_ROUTES['characters.listForOwner'].path(userId),
        ),
      listUnattached: (userId: UserId) =>
        request<Character[]>(
          'characters.listUnattached',
          API_ROUTES['characters.listUnattached'].path(userId),
        ),
      byId: (characterId: CharacterId) =>
        request<Character | null>(
          'characters.byId',
          API_ROUTES['characters.byId'].path(characterId),
        ),
      attachToCampaign: (characterId: CharacterId, campaignId: CampaignId) =>
        request<Character>(
          'characters.attachToCampaign',
          API_ROUTES['characters.attachToCampaign'].path(characterId),
          { campaignId },
        ),
    },

    monsters: {
      list: (query?: MonsterQuery) =>
        request<Monster[]>('monsters.list', API_ROUTES['monsters.list'].path(queryFor(query))),
      count: (query?: MonsterQuery) =>
        request<number>('monsters.count', API_ROUTES['monsters.count'].path(queryFor(query))),
      byId: (monsterId: MonsterId) =>
        request<Monster | null>('monsters.byId', API_ROUTES['monsters.byId'].path(monsterId)),
      create: (monster: Monster) =>
        request<Monster>('monsters.create', API_ROUTES['monsters.create'].path(), monster),
      // PUT with the whole record: autosave calls this repeatedly with the same object, so
      // replaying one has to be a no-op rather than a second creature.
      save: (monster: Monster) =>
        request<Monster>('monsters.save', API_ROUTES['monsters.save'].path(monster.id), monster),
      remove: (monsterId: MonsterId) =>
        request<void>('monsters.remove', API_ROUTES['monsters.remove'].path(monsterId)),
      cloneFrom: (sourceId: MonsterId, ownerUserId: UserId, ownerName: string) =>
        request<Monster>('monsters.cloneFrom', API_ROUTES['monsters.cloneFrom'].path(sourceId), {
          ownerUserId,
          ownerName,
        }),
    },

    encounters: {
      listForCampaign: (campaignId: CampaignId) =>
        request<EncounterTemplate[]>(
          'encounters.listForCampaign',
          API_ROUTES['encounters.listForCampaign'].path(campaignId),
        ),
      byId: (encounterId: EncounterTemplateId) =>
        request<EncounterTemplate | null>(
          'encounters.byId',
          API_ROUTES['encounters.byId'].path(encounterId),
        ),
      create: (input: { campaignId: CampaignId; name: string }) =>
        request<EncounterTemplate>(
          'encounters.create',
          API_ROUTES['encounters.create'].path(),
          input,
        ),
      save: (encounter: EncounterTemplate) =>
        request<EncounterTemplate>(
          'encounters.save',
          API_ROUTES['encounters.save'].path(encounter.id),
          encounter,
        ),
      remove: (encounterId: EncounterTemplateId) =>
        request<void>('encounters.remove', API_ROUTES['encounters.remove'].path(encounterId)),
      duplicate: (encounterId: EncounterTemplateId) =>
        request<EncounterTemplate>(
          'encounters.duplicate',
          API_ROUTES['encounters.duplicate'].path(encounterId),
        ),
    },

    combats: {
      liveForCampaign: (campaignId: CampaignId) =>
        request<CombatInstance | null>(
          'combats.liveForCampaign',
          API_ROUTES['combats.liveForCampaign'].path(campaignId),
        ),
      liveForUser: (userId: UserId) =>
        request<CombatInstance | null>(
          'combats.liveForUser',
          API_ROUTES['combats.liveForUser'].path(userId),
        ),
      listForCampaign: (campaignId: CampaignId) =>
        request<CombatInstance[]>(
          'combats.listForCampaign',
          API_ROUTES['combats.listForCampaign'].path(campaignId),
        ),
      byId: (combatId: CombatInstanceId) =>
        request<CombatInstance | null>('combats.byId', API_ROUTES['combats.byId'].path(combatId)),
      startFromTemplate: (encounterId: EncounterTemplateId) =>
        request<CombatInstance>(
          'combats.startFromTemplate',
          API_ROUTES['combats.startFromTemplate'].path(encounterId),
        ),
      save: (combat: CombatInstance) =>
        request<CombatInstance>('combats.save', API_ROUTES['combats.save'].path(combat.id), combat),
    },

    rolls: {
      listForCombat: (combatId: CombatInstanceId) =>
        request<Roll[]>('rolls.listForCombat', API_ROUTES['rolls.listForCombat'].path(combatId)),
      // Append-only, and the client supplies the id, so a resend after a dropped response
      // is the same roll rather than a second one.
      record: (roll: Roll) =>
        request<Roll>('rolls.record', API_ROUTES['rolls.record'].path(roll.combatId ?? ''), roll),
    },

    drafts: {
      listForOwner: (userId: UserId) =>
        request<CharacterDraft[]>(
          'drafts.listForOwner',
          API_ROUTES['drafts.listForOwner'].path(userId),
        ),
      byId: (draftId: CharacterDraftId) =>
        request<CharacterDraft | null>('drafts.byId', API_ROUTES['drafts.byId'].path(draftId)),
      create: (input: CreateDraftInput) =>
        request<CharacterDraft>('drafts.create', API_ROUTES['drafts.create'].path(), input),
      save: (draft: CharacterDraft) =>
        request<CharacterDraft>('drafts.save', API_ROUTES['drafts.save'].path(draft.id), draft),
      discard: (draftId: CharacterDraftId) =>
        request<void>('drafts.discard', API_ROUTES['drafts.discard'].path(draftId)),
      finalise: (draftId: CharacterDraftId, character: Character) =>
        request<Character>(
          'drafts.finalise',
          API_ROUTES['drafts.finalise'].path(draftId),
          character,
        ),
    },

    recents: {
      listForUser: (userId: UserId, limit?: number) =>
        request<RecentItem[]>(
          'recents.listForUser',
          `${API_ROUTES['recents.listForUser'].path(userId)}${limit ? `?limit=${limit}` : ''}`,
        ),
    },

    activity: {
      listForUser: (userId: UserId, limit?: number) =>
        request<CampaignActivity[]>(
          'activity.listForUser',
          `${API_ROUTES['activity.listForUser'].path(userId)}${limit ? `?limit=${limit}` : ''}`,
        ),
    },
  };
}
