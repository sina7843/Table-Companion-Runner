/**
 * The `Repositories` surface over HTTP.
 *
 * One `request` helper and one method per repository call, each naming the route it uses from
 * `apiContract.ts` and the schema its answer must satisfy. There is no caching, no retry loop
 * and no optimistic layer here on purpose: retries belong to the screen that knows whether the
 * user is still looking at the thing, and optimism belongs where the state lives. A
 * repository's job is to be the wire.
 *
 * Two things it does do, as of TC-P03:
 *
 * 1. **It checks what it is given.** Every response is validated against a schema rather than
 *    cast. `as T` is a claim; a deployment that has drifted, a proxy that mangled a body or a
 *    hostile response gets an `ApiError` at the boundary instead of an undefined three screens
 *    later. Response schemas are lenient — an unknown field is dropped, not fatal — because a
 *    server ahead of this build must not break a user.
 * 2. **It reads the server's own words.** A failure carries a stable `code` and the sentence
 *    the server wrote, so a screen renders "That email and password do not match an account."
 *    rather than "POST /auth/sign-in failed (401)."
 *
 * Constructed only when `VITE_API_BASE_URL` is set. With it unset the application runs on
 * fixtures and never reaches this file.
 */
import {
  API_ROUTES,
  ApiError,
  codeForStatus,
  isApiErrorCode,
  type ApiConfig,
  type ApiRoute,
} from './apiContract.ts';
import { maybe, RESPONSE } from './contractSchemas.ts';
import { validate, type Schema } from './schema.ts';
import type {
  CampaignId,
  Character,
  CharacterDraft,
  CharacterDraftId,
  CharacterId,
  CombatInstanceId,
  EncounterTemplate,
  EncounterTemplateId,
  Monster,
  MonsterId,
  Roll,
  UserId,
} from '../types.ts';
import type {
  CombatCommandInput,
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
  if (query.offset !== undefined) params.set('offset', String(query.offset));
  if (query.challengeMin !== undefined) params.set('challengeMin', String(query.challengeMin));
  if (query.challengeMax !== undefined) params.set('challengeMax', String(query.challengeMax));
  for (const [facet, values] of Object.entries(query.facets ?? {})) {
    if (values.length > 0) params.set(`facet.${facet}`, values.join(','));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

/** Pulls `{ error: { code, message, requestId } }` out of a failed response, defensively. */
function readFailure(
  status: number,
  payload: unknown,
): { code: ReturnType<typeof codeForStatus>; message: string; requestId?: string } {
  const body = (payload as { error?: unknown } | null)?.error;
  const shape = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};

  return {
    code: isApiErrorCode(shape.code) ? shape.code : codeForStatus(status),
    // A server that answered with something unexpected still has to produce a sentence a
    // screen can render, and it must not be the raw body.
    message:
      typeof shape.message === 'string' && shape.message.trim() !== ''
        ? shape.message
        : 'Something went wrong. Nothing has been lost — try again.',
    ...(typeof shape.requestId === 'string' ? { requestId: shape.requestId } : {}),
  };
}

export function createHttpRepositories(config: ApiConfig): Repositories {
  const call = config.fetch ?? globalThis.fetch.bind(globalThis);
  const base = config.baseUrl.replace(/\/+$/, '');

  async function request<T>(
    route: ApiRoute,
    path: string,
    schema: Schema<T>,
    body?: unknown,
  ): Promise<T> {
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
      throw new ApiError(0, route, 'Could not reach the server.', { code: 'internal' });
    }

    const requestId = response.headers.get('X-Request-Id') ?? undefined;
    const text = await response.text();
    let payload: unknown;
    if (text) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        throw new ApiError(response.status, route, 'The server sent a reply we could not read.', {
          code: 'internal',
          ...(requestId ? { requestId } : {}),
        });
      }
    }

    if (!response.ok) {
      const failure = readFailure(response.status, payload);
      throw new ApiError(response.status, route, failure.message, {
        code: failure.code,
        ...((failure.requestId ?? requestId) ? { requestId: failure.requestId ?? requestId } : {}),
      });
    }

    // 204 carries nothing, which is what the contract's `void` routes answer with.
    if (response.status === 204 || text === '') return undefined as T;

    const checked = validate(schema, payload);
    if (!checked.ok) {
      // Deliberately not the payload: a response that failed validation is exactly the thing
      // not to paste into a log or an error message.
      throw new ApiError(response.status, route, 'The server sent something unexpected.', {
        code: 'internal',
        ...(requestId ? { requestId } : {}),
      });
    }
    return checked.value;
  }

  /** For the three routes the contract types as `void`. */
  const nothing: Schema<void> = { check: () => ({ ok: true, value: undefined }) };

  return {
    // No token is read, stored or returned here. The server answers these with a
    // `Set-Cookie`, the browser holds it, and `credentials: 'same-origin'` above is what
    // attaches it to every later request. There is nothing for this client to leak.
    auth: {
      signIn: (input: { email: string; password: string }) =>
        request('auth.signIn', API_ROUTES['auth.signIn'].path(), RESPONSE.user, input),
      signUp: (input: { email: string; password: string; displayName: string }) =>
        request('auth.signUp', API_ROUTES['auth.signUp'].path(), RESPONSE.user, input),
      signOut: () =>
        request('auth.signOut', API_ROUTES['auth.signOut'].path(), nothing, {}).then(
          () => undefined,
        ),
    },

    users: {
      current: () => request('users.current', API_ROUTES['users.current'].path(), RESPONSE.user),
      byId: (userId: UserId) =>
        request('users.byId', API_ROUTES['users.byId'].path(userId), maybe(RESPONSE.user)),
      byIds: (userIds: UserId[]) =>
        request('users.byIds', API_ROUTES['users.byIds'].path(userIds.join(',')), RESPONSE.users),
    },

    gameSystems: {
      list: () =>
        request('gameSystems.list', API_ROUTES['gameSystems.list'].path(), RESPONSE.gameSystems),
    },

    campaigns: {
      listForUser: (userId: UserId) =>
        request(
          'campaigns.listForUser',
          API_ROUTES['campaigns.listForUser'].path(userId),
          RESPONSE.campaigns,
        ),
      byId: (campaignId: CampaignId) =>
        request(
          'campaigns.byId',
          API_ROUTES['campaigns.byId'].path(campaignId),
          maybe(RESPONSE.campaign),
        ),
      create: (input: CreateCampaignInput) =>
        request(
          'campaigns.create',
          API_ROUTES['campaigns.create'].path(),
          RESPONSE.campaign,
          input,
        ),
      acceptInvite: (code: string) =>
        request(
          'campaigns.acceptInvite',
          API_ROUTES['campaigns.acceptInvite'].path(code),
          RESPONSE.campaign,
          {},
        ),
    },

    characters: {
      listForCampaign: (campaignId: CampaignId) =>
        request(
          'characters.listForCampaign',
          API_ROUTES['characters.listForCampaign'].path(campaignId),
          RESPONSE.characters,
        ),
      listForOwner: (userId: UserId) =>
        request(
          'characters.listForOwner',
          API_ROUTES['characters.listForOwner'].path(userId),
          RESPONSE.characters,
        ),
      listUnattached: (userId: UserId) =>
        request(
          'characters.listUnattached',
          API_ROUTES['characters.listUnattached'].path(userId),
          RESPONSE.characters,
        ),
      byId: (characterId: CharacterId) =>
        request(
          'characters.byId',
          API_ROUTES['characters.byId'].path(characterId),
          maybe(RESPONSE.character),
        ),
      attachToCampaign: (characterId: CharacterId, campaignId: CampaignId) =>
        request(
          'characters.attachToCampaign',
          API_ROUTES['characters.attachToCampaign'].path(characterId),
          RESPONSE.character,
          { campaignId },
        ),
    },

    monsters: {
      list: (query?: MonsterQuery) =>
        request(
          'monsters.list',
          API_ROUTES['monsters.list'].path(queryFor(query)),
          RESPONSE.monsters,
        ),
      count: (query?: MonsterQuery) =>
        request(
          'monsters.count',
          API_ROUTES['monsters.count'].path(queryFor(query)),
          RESPONSE.count,
        ),
      byId: (monsterId: MonsterId) =>
        request(
          'monsters.byId',
          API_ROUTES['monsters.byId'].path(monsterId),
          maybe(RESPONSE.monster),
        ),
      create: (monster: Monster) =>
        request('monsters.create', API_ROUTES['monsters.create'].path(), RESPONSE.monster, monster),
      // PUT with the whole record: autosave calls this repeatedly with the same object, so
      // replaying one has to be a no-op rather than a second creature.
      save: (monster: Monster) =>
        request(
          'monsters.save',
          API_ROUTES['monsters.save'].path(monster.id),
          RESPONSE.monster,
          monster,
        ),
      remove: (monsterId: MonsterId) =>
        request('monsters.remove', API_ROUTES['monsters.remove'].path(monsterId), nothing),
      cloneFrom: (sourceId: MonsterId, ownerUserId: UserId, ownerName: string) =>
        request(
          'monsters.cloneFrom',
          API_ROUTES['monsters.cloneFrom'].path(sourceId),
          RESPONSE.monster,
          { ownerUserId, ownerName },
        ),
    },

    encounters: {
      listForCampaign: (campaignId: CampaignId) =>
        request(
          'encounters.listForCampaign',
          API_ROUTES['encounters.listForCampaign'].path(campaignId),
          RESPONSE.encounters,
        ),
      byId: (encounterId: EncounterTemplateId) =>
        request(
          'encounters.byId',
          API_ROUTES['encounters.byId'].path(encounterId),
          maybe(RESPONSE.encounter),
        ),
      create: (input: { campaignId: CampaignId; name: string }) =>
        request(
          'encounters.create',
          API_ROUTES['encounters.create'].path(),
          RESPONSE.encounter,
          input,
        ),
      save: (encounter: EncounterTemplate) =>
        request(
          'encounters.save',
          API_ROUTES['encounters.save'].path(encounter.id),
          RESPONSE.encounter,
          encounter,
        ),
      remove: (encounterId: EncounterTemplateId) =>
        request('encounters.remove', API_ROUTES['encounters.remove'].path(encounterId), nothing),
      duplicate: (encounterId: EncounterTemplateId) =>
        request(
          'encounters.duplicate',
          API_ROUTES['encounters.duplicate'].path(encounterId),
          RESPONSE.encounter,
          {},
        ),
    },

    combats: {
      liveForCampaign: (campaignId: CampaignId) =>
        request(
          'combats.liveForCampaign',
          API_ROUTES['combats.liveForCampaign'].path(campaignId),
          maybe(RESPONSE.combat),
        ),
      liveForUser: (userId: UserId) =>
        request(
          'combats.liveForUser',
          API_ROUTES['combats.liveForUser'].path(userId),
          maybe(RESPONSE.combat),
        ),
      listForCampaign: (campaignId: CampaignId) =>
        request(
          'combats.listForCampaign',
          API_ROUTES['combats.listForCampaign'].path(campaignId),
          RESPONSE.combats,
        ),
      byId: (combatId: CombatInstanceId) =>
        request('combats.byId', API_ROUTES['combats.byId'].path(combatId), maybe(RESPONSE.combat)),
      startFromTemplate: (encounterId: EncounterTemplateId) =>
        request(
          'combats.startFromTemplate',
          API_ROUTES['combats.startFromTemplate'].path(encounterId),
          RESPONSE.combat,
          {},
        ),
      // The command's own id and the version it was built from travel in the body; the fight
      // it belongs to is the path. Nothing about the resulting state is sent — that is the
      // whole point of the change.
      command: ({ combatId, ...intent }: CombatCommandInput) =>
        request(
          'combats.command',
          API_ROUTES['combats.command'].path(combatId),
          RESPONSE.combatOutcome,
          intent,
        ),
    },

    rolls: {
      listForCombat: (combatId: CombatInstanceId) =>
        request(
          'rolls.listForCombat',
          API_ROUTES['rolls.listForCombat'].path(combatId),
          RESPONSE.rolls,
        ),
      // Append-only, and the client supplies the id, so a resend after a dropped response is
      // the same roll rather than a second one — see the idempotency note in `repositories.ts`.
      record: (roll: Roll) =>
        request(
          'rolls.record',
          API_ROUTES['rolls.record'].path(roll.combatId ?? ''),
          RESPONSE.roll,
          roll,
        ),
    },

    drafts: {
      listForOwner: (userId: UserId) =>
        request(
          'drafts.listForOwner',
          API_ROUTES['drafts.listForOwner'].path(userId),
          RESPONSE.drafts,
        ),
      byId: (draftId: CharacterDraftId) =>
        request('drafts.byId', API_ROUTES['drafts.byId'].path(draftId), maybe(RESPONSE.draft)),
      create: (input: CreateDraftInput) =>
        request('drafts.create', API_ROUTES['drafts.create'].path(), RESPONSE.draft, input),
      save: (draft: CharacterDraft) =>
        request('drafts.save', API_ROUTES['drafts.save'].path(draft.id), RESPONSE.draft, draft),
      discard: (draftId: CharacterDraftId) =>
        request('drafts.discard', API_ROUTES['drafts.discard'].path(draftId), nothing),
      finalise: (draftId: CharacterDraftId, character: Character) =>
        request(
          'drafts.finalise',
          API_ROUTES['drafts.finalise'].path(draftId),
          RESPONSE.character,
          character,
        ),
    },

    recents: {
      listForUser: (userId: UserId, limit?: number) =>
        request(
          'recents.listForUser',
          `${API_ROUTES['recents.listForUser'].path(userId)}${limit ? `?limit=${limit}` : ''}`,
          RESPONSE.recents,
        ),
    },

    activity: {
      listForUser: (userId: UserId, limit?: number) =>
        request(
          'activity.listForUser',
          `${API_ROUTES['activity.listForUser'].path(userId)}${limit ? `?limit=${limit}` : ''}`,
          RESPONSE.activity,
        ),
    },
  };
}
