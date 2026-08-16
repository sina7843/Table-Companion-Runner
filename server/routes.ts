/**
 * The route table — one entry for every path in `src/domain/data/apiContract.ts`.
 *
 * The contract file is the shared statement of what the client calls; this file is the
 * server half of it. `contract.test.ts` walks every entry in `API_ROUTES`, generates its
 * path and asserts a route here matches with the same verb, so the two cannot drift without
 * a test failing.
 *
 * Handlers do exactly two things: turn a path and a body into repository arguments, and
 * hand the result back. No business logic lives here — that is the store's, and the rules
 * are the ruleset's.
 *
 * Each entry also declares two things the boundary needs and a handler must not decide for
 * itself: the schema its body has to satisfy, and which rate-limit class it belongs to. Both
 * are read by `http.ts` *before* the handler runs, so a handler only ever sees a body that has
 * already been validated and a caller who is within their budget.
 *
 * A route with no `body` schema takes no body, and one that arrives is refused. A route with
 * no `rate` is counted as a read or a write by its verb. The defaults are the safe ones.
 */
import type {
  CombatCommandInput,
  CreateCampaignInput,
  CreateDraftInput,
  MonsterQuery,
  Repositories,
} from '../src/domain/data/repositories.ts';
import {
  attachCharacterSchema,
  characterDraftSchema,
  characterSchema,
  cloneMonsterSchema,
  combatCommandSchema,
  createCampaignSchema,
  createDraftSchema,
  createEncounterSchema,
  emptyBodySchema,
  encounterSchema,
  monsterSchema,
  rollSchema,
  signInSchema,
  signUpSchema,
} from '../src/domain/data/contractSchemas.ts';
import type { Schema } from '../src/domain/data/schema.ts';
import type { RateClass } from './rateLimit.ts';
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
  User,
  UserId,
} from '../src/domain/types.ts';
import { StoreError } from './store.ts';

/**
 * The session effects a handler can ask for.
 *
 * Signing in and out are effects on the HTTP response — a `Set-Cookie` — rather than reads
 * or writes of domain data, so they are supplied by `http.ts` rather than by the store. No
 * handler ever sees the token; it goes straight into the cookie header.
 */
export interface AuthContext {
  signIn(input: { email: string; password: string }): Promise<User>;
  signUp(input: { email: string; password: string; displayName: string }): Promise<User>;
  signOut(): Promise<void>;
}

export interface RequestContext {
  params: Readonly<Record<string, string>>;
  query: URLSearchParams;
  /** Parsed JSON body, or undefined when the request carried none. */
  body: unknown;
  /** Already scoped to the caller: every method enforces what they may see and do. */
  repos: Repositories;
  auth: AuthContext;
}

/**
 * What a handler resolves to.
 *
 * `undefined` becomes 204 — the three delete routes the contract types as `void`.
 * `null` becomes 200 with a JSON `null`, because every `byId` in the contract is typed
 * `T | null` and the client reads a missing record as null rather than as a failure.
 */
export type Handler = (ctx: RequestContext) => Promise<unknown>;

export interface Route {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** `/campaigns/:campaignId/characters` — `:name` captures one segment. */
  pattern: string;
  handler: Handler;
  /**
   * What the JSON body must be. Checked before the handler runs, strictly — an unrecognised
   * key is an over-post and is refused rather than ignored. A route without one takes no body.
   */
  body?: Schema<unknown>;
  /** Which budget this route spends. Defaults to `read` for GET and `write` for the rest. */
  rate?: RateClass;
  /**
   * Reachable without a session. Three routes are, and they are the three that exist to get
   * one. Everything else answers 401 — the default is closed, and a new route is protected
   * by having said nothing.
   */
  anonymous?: boolean;
}

/** Reads a required path parameter. A missing one is a routing bug, not a user error. */
function param(ctx: RequestContext, name: string): string {
  const value = ctx.params[name];
  if (value === undefined) throw new StoreError(400, `Missing ${name}.`);
  return value;
}

/**
 * The validated body.
 *
 * The cast is safe because `http.ts` has already run the route's `body` schema and replaced
 * `ctx.body` with what came out of it — an object built key by key from the schema, so a field
 * the schema does not name cannot be in there even if the request carried one.
 */
function body<T>(ctx: RequestContext): T {
  if (ctx.body === null || typeof ctx.body !== 'object') {
    throw new StoreError(400, 'This request needs a JSON body.');
  }
  return ctx.body as T;
}

function positiveInt(raw: string | null): number | undefined {
  if (raw === null) return undefined;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function finite(raw: string | null): number | undefined {
  if (raw === null) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

const SORTS = new Set<string>(['challenge-desc', 'challenge-asc', 'name']);

/**
 * The page ceiling for list endpoints that can grow materially.
 *
 * The creature library is fifty rows today and an ingest pipeline (TC-P06) away from
 * thousands, so `monsters.list` pages. A caller that asks for more gets this; a caller that
 * asks for nothing gets this. `monsters.count` is unbounded and is what the library screen's
 * "N of M" line reads, so a truncated page is visible rather than silent.
 */
export const MAX_PAGE_SIZE = 200;

/** Recall and the activity feed are short by design; this is a backstop, not a page size. */
const MAX_FEED_SIZE = 100;

const bounded = (value: number | undefined, max: number): number | undefined =>
  value === undefined ? undefined : Math.min(value, max);

/**
 * The inverse of `queryFor` in `httpRepositories.ts`.
 *
 * Anything unrecognised is dropped rather than guessed at: an unknown sort falls back to
 * the default, and a non-numeric bound is simply not applied. A query string is untrusted
 * input, so nothing here reaches the store without being coerced first.
 */
export function parseMonsterQuery(search: URLSearchParams): MonsterQuery {
  const query: MonsterQuery = {};

  const term = search.get('search')?.trim();
  if (term) query.search = term;

  const origin = search.get('origin');
  if (origin === 'library' || origin === 'homebrew') query.origin = origin;

  const sort = search.get('sort');
  if (sort !== null && SORTS.has(sort)) query.sort = sort as MonsterQuery['sort'];

  // Always bounded, and bounded even when unasked: an unpaged list endpoint is an endpoint
  // whose cost is decided by whoever calls it.
  query.limit = bounded(positiveInt(search.get('limit')) ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE);

  const offset = search.get('offset');
  if (offset !== null) {
    const value = Number(offset);
    if (Number.isInteger(value) && value >= 0) query.offset = value;
  }

  const min = finite(search.get('challengeMin'));
  if (min !== undefined) query.challengeMin = min;
  const max = finite(search.get('challengeMax'));
  if (max !== undefined) query.challengeMax = max;

  const facets: Record<string, string[]> = {};
  for (const [key, value] of search.entries()) {
    if (!key.startsWith('facet.')) continue;
    const values = value.split(',').filter(Boolean);
    if (values.length > 0) facets[key.slice('facet.'.length)] = values;
  }
  if (Object.keys(facets).length > 0) query.facets = facets;

  return query;
}

export const ROUTES: readonly Route[] = [
  /* ── Session ──────────────────────────────────────────────────────────────── */
  {
    method: 'POST',
    pattern: '/auth/sign-in',
    anonymous: true,
    rate: 'auth',
    body: signInSchema,
    handler: (ctx) => ctx.auth.signIn(body<{ email: string; password: string }>(ctx)),
  },
  {
    method: 'POST',
    pattern: '/auth/sign-up',
    anonymous: true,
    rate: 'auth',
    body: signUpSchema,
    handler: (ctx) =>
      ctx.auth.signUp(body<{ email: string; password: string; displayName: string }>(ctx)),
  },
  {
    // Anonymous because signing out of a session that has already expired must succeed
    // rather than answer 401 and leave a stale cookie in the browser.
    method: 'POST',
    pattern: '/auth/sign-out',
    anonymous: true,
    body: emptyBodySchema,
    handler: async (ctx) => {
      await ctx.auth.signOut();
      return undefined;
    },
  },
  { method: 'GET', pattern: '/me', handler: (ctx) => ctx.repos.users.current() },
  {
    method: 'GET',
    pattern: '/users',
    handler: (ctx) => {
      const ids = (ctx.query.get('ids') ?? '').split(',').filter(Boolean) as UserId[];
      return ctx.repos.users.byIds(ids);
    },
  },
  {
    method: 'GET',
    pattern: '/users/:userId',
    handler: (ctx) => ctx.repos.users.byId(param(ctx, 'userId') as UserId),
  },

  /* ── Reference data ───────────────────────────────────────────────────────── */
  { method: 'GET', pattern: '/game-systems', handler: (ctx) => ctx.repos.gameSystems.list() },

  /* ── Campaigns ────────────────────────────────────────────────────────────── */
  {
    method: 'GET',
    pattern: '/users/:userId/campaigns',
    handler: (ctx) => ctx.repos.campaigns.listForUser(param(ctx, 'userId') as UserId),
  },
  {
    method: 'GET',
    pattern: '/campaigns/:campaignId',
    handler: (ctx) => ctx.repos.campaigns.byId(param(ctx, 'campaignId') as CampaignId),
  },
  {
    method: 'POST',
    pattern: '/campaigns',
    body: createCampaignSchema,
    handler: (ctx) => ctx.repos.campaigns.create(body<CreateCampaignInput>(ctx)),
  },
  {
    method: 'POST',
    pattern: '/invites/:code/accept',
    rate: 'invite',
    body: emptyBodySchema,
    handler: (ctx) => ctx.repos.campaigns.acceptInvite(param(ctx, 'code')),
  },

  /* ── Characters ───────────────────────────────────────────────────────────── */
  {
    method: 'GET',
    pattern: '/campaigns/:campaignId/characters',
    handler: (ctx) => ctx.repos.characters.listForCampaign(param(ctx, 'campaignId') as CampaignId),
  },
  {
    // One path serves two contract entries: `characters.listUnattached` is the same route
    // with `?attached=false`, exactly as the contract declares it.
    method: 'GET',
    pattern: '/users/:userId/characters',
    handler: (ctx) => {
      const userId = param(ctx, 'userId') as UserId;
      return ctx.query.get('attached') === 'false'
        ? ctx.repos.characters.listUnattached(userId)
        : ctx.repos.characters.listForOwner(userId);
    },
  },
  {
    method: 'GET',
    pattern: '/characters/:characterId',
    handler: (ctx) => ctx.repos.characters.byId(param(ctx, 'characterId') as CharacterId),
  },
  {
    method: 'PUT',
    pattern: '/characters/:characterId/campaign',
    body: attachCharacterSchema,
    handler: (ctx) =>
      ctx.repos.characters.attachToCampaign(
        param(ctx, 'characterId') as CharacterId,
        body<{ campaignId: CampaignId }>(ctx).campaignId,
      ),
  },

  /* ── Monsters ─────────────────────────────────────────────────────────────── */
  // `/monsters/count` is a literal path and `/monsters/:monsterId` is a pattern. The
  // matcher prefers the one with fewer parameters, so the order here carries no meaning.
  {
    method: 'GET',
    pattern: '/monsters/count',
    handler: (ctx) => ctx.repos.monsters.count(parseMonsterQuery(ctx.query)),
  },
  {
    method: 'GET',
    pattern: '/monsters',
    handler: (ctx) => ctx.repos.monsters.list(parseMonsterQuery(ctx.query)),
  },
  {
    method: 'GET',
    pattern: '/monsters/:monsterId',
    handler: (ctx) => ctx.repos.monsters.byId(param(ctx, 'monsterId') as MonsterId),
  },
  {
    method: 'POST',
    pattern: '/monsters',
    body: monsterSchema(true),
    handler: (ctx) => ctx.repos.monsters.create(body<Monster>(ctx)),
  },
  {
    method: 'PUT',
    pattern: '/monsters/:monsterId',
    body: monsterSchema(true),
    handler: (ctx) =>
      ctx.repos.monsters.save({ ...body<Monster>(ctx), id: param(ctx, 'monsterId') as MonsterId }),
  },
  {
    method: 'DELETE',
    pattern: '/monsters/:monsterId',
    handler: async (ctx) => {
      await ctx.repos.monsters.remove(param(ctx, 'monsterId') as MonsterId);
      return undefined;
    },
  },
  {
    method: 'POST',
    pattern: '/monsters/:monsterId/clone',
    body: cloneMonsterSchema,
    handler: (ctx) => {
      const input = body<{ ownerUserId: UserId; ownerName: string }>(ctx);
      return ctx.repos.monsters.cloneFrom(
        param(ctx, 'monsterId') as MonsterId,
        input.ownerUserId,
        input.ownerName,
      );
    },
  },

  /* ── Encounters ───────────────────────────────────────────────────────────── */
  {
    method: 'GET',
    pattern: '/campaigns/:campaignId/encounters',
    handler: (ctx) => ctx.repos.encounters.listForCampaign(param(ctx, 'campaignId') as CampaignId),
  },
  {
    method: 'GET',
    pattern: '/encounters/:encounterId',
    handler: (ctx) => ctx.repos.encounters.byId(param(ctx, 'encounterId') as EncounterTemplateId),
  },
  {
    method: 'POST',
    pattern: '/encounters',
    body: createEncounterSchema,
    handler: (ctx) =>
      ctx.repos.encounters.create(body<{ campaignId: CampaignId; name: string }>(ctx)),
  },
  {
    method: 'PUT',
    pattern: '/encounters/:encounterId',
    body: encounterSchema(true),
    handler: (ctx) =>
      ctx.repos.encounters.save({
        ...body<EncounterTemplate>(ctx),
        id: param(ctx, 'encounterId') as EncounterTemplateId,
      }),
  },
  {
    method: 'DELETE',
    pattern: '/encounters/:encounterId',
    handler: async (ctx) => {
      await ctx.repos.encounters.remove(param(ctx, 'encounterId') as EncounterTemplateId);
      return undefined;
    },
  },
  {
    method: 'POST',
    pattern: '/encounters/:encounterId/duplicate',
    body: emptyBodySchema,
    handler: (ctx) =>
      ctx.repos.encounters.duplicate(param(ctx, 'encounterId') as EncounterTemplateId),
  },

  /* ── Combat ───────────────────────────────────────────────────────────────── */
  {
    method: 'GET',
    pattern: '/campaigns/:campaignId/combats/live',
    handler: (ctx) => ctx.repos.combats.liveForCampaign(param(ctx, 'campaignId') as CampaignId),
  },
  {
    method: 'GET',
    pattern: '/users/:userId/combats/live',
    handler: (ctx) => ctx.repos.combats.liveForUser(param(ctx, 'userId') as UserId),
  },
  {
    method: 'GET',
    pattern: '/campaigns/:campaignId/combats',
    handler: (ctx) => ctx.repos.combats.listForCampaign(param(ctx, 'campaignId') as CampaignId),
  },
  {
    method: 'GET',
    pattern: '/combats/:combatId',
    handler: (ctx) => ctx.repos.combats.byId(param(ctx, 'combatId') as CombatInstanceId),
  },
  {
    method: 'POST',
    pattern: '/encounters/:encounterId/start',
    body: emptyBodySchema,
    handler: (ctx) =>
      ctx.repos.combats.startFromTemplate(param(ctx, 'encounterId') as EncounterTemplateId),
  },
  {
    // The whole-record `PUT /combats/:id` is gone. A fight changes by saying what you are
    // trying to do, with the version you were working from and an id for the attempt.
    method: 'POST',
    pattern: '/combats/:combatId/commands',
    body: combatCommandSchema,
    handler: (ctx) =>
      ctx.repos.combats.command({
        ...body<Omit<CombatCommandInput, 'combatId'>>(ctx),
        combatId: param(ctx, 'combatId') as CombatInstanceId,
      }),
  },

  /* ── Rolls ────────────────────────────────────────────────────────────────── */
  {
    method: 'GET',
    pattern: '/combats/:combatId/rolls',
    handler: (ctx) => ctx.repos.rolls.listForCombat(param(ctx, 'combatId') as CombatInstanceId),
  },
  {
    method: 'POST',
    pattern: '/combats/:combatId/rolls',
    rate: 'roll',
    body: rollSchema(true),
    handler: (ctx) =>
      ctx.repos.rolls.record({
        ...body<Roll>(ctx),
        combatId: param(ctx, 'combatId') as CombatInstanceId,
      }),
  },

  /* ── Drafts ───────────────────────────────────────────────────────────────── */
  {
    method: 'GET',
    pattern: '/users/:userId/drafts',
    handler: (ctx) => ctx.repos.drafts.listForOwner(param(ctx, 'userId') as UserId),
  },
  {
    method: 'GET',
    pattern: '/drafts/:draftId',
    handler: (ctx) => ctx.repos.drafts.byId(param(ctx, 'draftId') as CharacterDraftId),
  },
  {
    method: 'POST',
    pattern: '/drafts',
    body: createDraftSchema,
    handler: (ctx) => ctx.repos.drafts.create(body<CreateDraftInput>(ctx)),
  },
  {
    method: 'PUT',
    pattern: '/drafts/:draftId',
    body: characterDraftSchema(true),
    handler: (ctx) =>
      ctx.repos.drafts.save({
        ...body<CharacterDraft>(ctx),
        id: param(ctx, 'draftId') as CharacterDraftId,
      }),
  },
  {
    method: 'DELETE',
    pattern: '/drafts/:draftId',
    handler: async (ctx) => {
      await ctx.repos.drafts.discard(param(ctx, 'draftId') as CharacterDraftId);
      return undefined;
    },
  },
  {
    method: 'POST',
    pattern: '/drafts/:draftId/finalise',
    body: characterSchema(true),
    handler: (ctx) =>
      ctx.repos.drafts.finalise(param(ctx, 'draftId') as CharacterDraftId, body<Character>(ctx)),
  },

  /* ── Home ─────────────────────────────────────────────────────────────────── */
  {
    method: 'GET',
    pattern: '/users/:userId/recents',
    handler: (ctx) =>
      ctx.repos.recents.listForUser(
        param(ctx, 'userId') as UserId,
        bounded(positiveInt(ctx.query.get('limit')), MAX_FEED_SIZE),
      ),
  },
  {
    method: 'GET',
    pattern: '/users/:userId/activity',
    handler: (ctx) =>
      ctx.repos.activity.listForUser(
        param(ctx, 'userId') as UserId,
        bounded(positiveInt(ctx.query.get('limit')), MAX_FEED_SIZE),
      ),
  },
];
