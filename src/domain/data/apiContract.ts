/**
 * The HTTP contract.
 *
 * One file states every path the client will call and what it sends, so the boundary is
 * something a backend can be written against rather than something to be reverse-engineered
 * from fetch calls scattered through a repository implementation.
 *
 * Two rules the whole contract rests on:
 *
 * 1. Reads return domain shapes verbatim. The types in `types.ts` are the wire format —
 *    there is no DTO layer, because a second shape is a second place for the two to drift.
 * 2. Writes are idempotent. Every autosave in this product calls `save` repeatedly with the
 *    same record, so `PUT` with the full object is the verb, and replaying one is a no-op
 *    rather than a duplicate.
 *
 * Nothing here names a vendor, and no endpoint has a default. `VITE_API_BASE_URL` is
 * supplied by whoever deploys this; with it unset the application runs on fixtures.
 */

/** Every route, by the repository method that calls it. */
export const API_ROUTES = {
  /* ── Session ────────────────────────────────────────────────────────────── */
  'users.current': { method: 'GET', path: () => '/me' },
  'users.byId': { method: 'GET', path: (userId: string) => `/users/${userId}` },
  'users.byIds': { method: 'GET', path: (ids: string) => `/users?ids=${ids}` },

  /* ── Reference data ─────────────────────────────────────────────────────── */
  'gameSystems.list': { method: 'GET', path: () => '/game-systems' },

  /* ── Campaigns ──────────────────────────────────────────────────────────── */
  'campaigns.listForUser': {
    method: 'GET',
    path: (userId: string) => `/users/${userId}/campaigns`,
  },
  'campaigns.byId': { method: 'GET', path: (id: string) => `/campaigns/${id}` },
  'campaigns.create': { method: 'POST', path: () => '/campaigns' },

  /* ── Characters ─────────────────────────────────────────────────────────── */
  'characters.listForCampaign': {
    method: 'GET',
    path: (campaignId: string) => `/campaigns/${campaignId}/characters`,
  },
  'characters.listForOwner': {
    method: 'GET',
    path: (userId: string) => `/users/${userId}/characters`,
  },
  'characters.listUnattached': {
    method: 'GET',
    path: (userId: string) => `/users/${userId}/characters?attached=false`,
  },
  'characters.byId': { method: 'GET', path: (id: string) => `/characters/${id}` },
  'characters.attachToCampaign': {
    method: 'PUT',
    path: (id: string) => `/characters/${id}/campaign`,
  },

  /* ── Monsters ───────────────────────────────────────────────────────────── */
  'monsters.list': { method: 'GET', path: (query: string) => `/monsters${query}` },
  'monsters.count': { method: 'GET', path: (query: string) => `/monsters/count${query}` },
  'monsters.byId': { method: 'GET', path: (id: string) => `/monsters/${id}` },
  'monsters.create': { method: 'POST', path: () => '/monsters' },
  'monsters.save': { method: 'PUT', path: (id: string) => `/monsters/${id}` },
  'monsters.remove': { method: 'DELETE', path: (id: string) => `/monsters/${id}` },
  'monsters.cloneFrom': { method: 'POST', path: (id: string) => `/monsters/${id}/clone` },

  /* ── Encounters ─────────────────────────────────────────────────────────── */
  'encounters.listForCampaign': {
    method: 'GET',
    path: (campaignId: string) => `/campaigns/${campaignId}/encounters`,
  },
  'encounters.byId': { method: 'GET', path: (id: string) => `/encounters/${id}` },
  'encounters.create': { method: 'POST', path: () => '/encounters' },
  'encounters.save': { method: 'PUT', path: (id: string) => `/encounters/${id}` },
  'encounters.remove': { method: 'DELETE', path: (id: string) => `/encounters/${id}` },
  'encounters.duplicate': { method: 'POST', path: (id: string) => `/encounters/${id}/duplicate` },

  /* ── Combat ─────────────────────────────────────────────────────────────── */
  'combats.liveForCampaign': {
    method: 'GET',
    path: (campaignId: string) => `/campaigns/${campaignId}/combats/live`,
  },
  'combats.liveForUser': {
    method: 'GET',
    path: (userId: string) => `/users/${userId}/combats/live`,
  },
  'combats.listForCampaign': {
    method: 'GET',
    path: (campaignId: string) => `/campaigns/${campaignId}/combats`,
  },
  'combats.byId': { method: 'GET', path: (id: string) => `/combats/${id}` },
  'combats.startFromTemplate': {
    method: 'POST',
    path: (encounterId: string) => `/encounters/${encounterId}/start`,
  },
  'combats.save': { method: 'PUT', path: (id: string) => `/combats/${id}` },

  /* ── Rolls ──────────────────────────────────────────────────────────────── */
  'rolls.listForCombat': {
    method: 'GET',
    path: (combatId: string) => `/combats/${combatId}/rolls`,
  },
  'rolls.record': { method: 'POST', path: (combatId: string) => `/combats/${combatId}/rolls` },

  /* ── Drafts ─────────────────────────────────────────────────────────────── */
  'drafts.listForOwner': { method: 'GET', path: (userId: string) => `/users/${userId}/drafts` },
  'drafts.byId': { method: 'GET', path: (id: string) => `/drafts/${id}` },
  'drafts.create': { method: 'POST', path: () => '/drafts' },
  'drafts.save': { method: 'PUT', path: (id: string) => `/drafts/${id}` },
  'drafts.discard': { method: 'DELETE', path: (id: string) => `/drafts/${id}` },
  'drafts.finalise': { method: 'POST', path: (id: string) => `/drafts/${id}/finalise` },

  /* ── Home ───────────────────────────────────────────────────────────────── */
  'recents.listForUser': { method: 'GET', path: (userId: string) => `/users/${userId}/recents` },
  'activity.listForUser': { method: 'GET', path: (userId: string) => `/users/${userId}/activity` },
} as const;

export type ApiRoute = keyof typeof API_ROUTES;

/** What the client needs to reach a deployment. Never a credential; see `.env.example`. */
export interface ApiConfig {
  baseUrl: string;
  /** Injected so tests do not need a network and so a host can supply its own. */
  fetch?: typeof globalThis.fetch;
  /**
   * Sent as `Authorization` when a host has already established a session. This client
   * never obtains, stores or reads one — it forwards what it is handed.
   */
  authorization?: string;
}

/**
 * A failed call, carrying enough for a screen to answer the design's three questions:
 * what happened, what is still safe, what to do next.
 */
export class ApiError extends Error {
  // Declared and assigned rather than written as constructor parameter properties: the
  // test runner strips types without transforming, and that syntax has no plain-JS form.
  readonly status: number;
  readonly route: ApiRoute;

  constructor(status: number, route: ApiRoute, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.route = route;
  }

  /** True when trying again might work, which is what a retry button should key off. */
  get retryable(): boolean {
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500;
  }
}
