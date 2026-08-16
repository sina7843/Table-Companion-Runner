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
  //
  // Added at TC-P02, when authentication became real. The three `auth` routes are the only
  // ones a signed-out caller may reach; everything else answers 401 without a session.
  //
  // No token appears in any of them. The server answers with a `Set-Cookie` carrying an
  // HttpOnly, SameSite=Strict session cookie, so the browser holds the credential and this
  // client never sees, stores or forwards one. Session *validation* is `users.current`, and
  // renewal is a sliding expiry the server applies on its own — there is no refresh call to
  // forget to make.
  'auth.signIn': { method: 'POST', path: () => '/auth/sign-in' },
  'auth.signUp': { method: 'POST', path: () => '/auth/sign-up' },
  'auth.signOut': { method: 'POST', path: () => '/auth/sign-out' },
  'users.current': { method: 'GET', path: () => '/me' },
  // The only account field a person can change. Self-scoped by the path rather than by a
  // body field, so there is no id for a caller to swap for somebody else's.
  'users.updateSelf': { method: 'PUT', path: () => '/me' },
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
  /** Redeeming an invite is how a player joins. The server decides what the code means. */
  'campaigns.acceptInvite': {
    method: 'POST',
    path: (code: string) => `/invites/${encodeURIComponent(code)}/accept`,
  },

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
  /**
   * The only way a fight changes, since TC-P04.
   *
   * `PUT /combats/:id` — the whole record, from whichever device sent it last — is gone. A
   * command says what the caller is trying to do, the version it was working from and an id
   * for the attempt; the server decides what that means and answers with the authoritative
   * fight. A stale version is a `conflict`; a repeated id changes nothing.
   */
  'combats.command': {
    method: 'POST',
    path: (combatId: string) => `/combats/${combatId}/commands`,
  },

  /* ── Realtime ───────────────────────────────────────────────────────────── */
  //
  // `GET /events` is a server-sent event stream rather than a JSON route, so it is not in this
  // table: it is opened by `EventSource` with the session cookie, not by the request helper,
  // and it answers with `text/event-stream` until the client goes away. It is documented here
  // because it is part of the same contract.
  //
  //   GET /events[?campaignId=…]   → 200 text/event-stream · 401 · 403
  //   headers: Last-Event-ID       → replay of what was missed, or an `event: resync`
  //
  // Every frame is a `DomainEvent` — a notification, never a payload. Nothing is announced
  // before the transaction that caused it committed, and nothing is announced to an account
  // that may not see it. `VITE_REALTIME_URL` says where it is.

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
 * Every failure this API can report, as a stable machine-readable code.
 *
 * Codes are the contract; messages are for people and may be reworded. A screen that branches
 * on a failure branches on the code, never on the sentence — which is what lets the sentence
 * be improved without breaking anything.
 *
 * The set is deliberately small. A code exists when a caller could reasonably do something
 * different because of it; anything else is `internal`, and a caller can only try again.
 */
export const API_ERROR_CODES = [
  /** No session, or one that has expired. Sign in. */
  'unauthenticated',
  /** Signed in, and not allowed to do this. Signing in again will not help. */
  'forbidden',
  /** No such record, or none this caller may know about. The two are indistinguishable. */
  'not_found',
  /** The request was understood and conflicts with the current state. */
  'conflict',
  /** The body or query failed validation. `details` names the fields. */
  'validation_failed',
  /** Too many requests. `Retry-After` says when. */
  'rate_limited',
  /** The body exceeded the size limit. */
  'payload_too_large',
  /** No route matched. */
  'not_supported',
  /** Something went wrong on the server. Nothing further is disclosed. */
  'internal',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/**
 * The one body every failure has.
 *
 * `requestId` is echoed from `X-Request-Id` and appears in the server's log line for the same
 * request, so a report of "it said something went wrong" is traceable without asking the user
 * for anything else. `details` is present only for `validation_failed` and names fields, never
 * values — a validation message must not quote back the password it rejected.
 */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId?: string;
    details?: string;
  };
}

const RETRYABLE_CODES = new Set<string>(['rate_limited', 'internal']);

/**
 * A failed call, carrying enough for a screen to answer the design's three questions:
 * what happened, what is still safe, what to do next.
 */
export class ApiError extends Error {
  // Declared and assigned rather than written as constructor parameter properties: the
  // test runner strips types without transforming, and that syntax has no plain-JS form.
  readonly status: number;
  readonly route: ApiRoute;
  /** The stable code. Branch on this, not on `message`. */
  readonly code: ApiErrorCode;
  /** Correlates with the server's log line. Absent when the request never arrived. */
  readonly requestId?: string;

  constructor(
    status: number,
    route: ApiRoute,
    message: string,
    options: { code?: ApiErrorCode; requestId?: string } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.route = route;
    this.code = options.code ?? codeForStatus(status);
    if (options.requestId) this.requestId = options.requestId;
  }

  /** True when trying again might work, which is what a retry button should key off. */
  get retryable(): boolean {
    if (RETRYABLE_CODES.has(this.code)) return true;
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

/** The code a bare status implies, for a response that carried no body of its own. */
export function codeForStatus(status: number): ApiErrorCode {
  switch (status) {
    case 401:
      return 'unauthenticated';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 409:
      return 'conflict';
    case 400:
    case 422:
      return 'validation_failed';
    case 413:
      return 'payload_too_large';
    case 429:
      return 'rate_limited';
    default:
      return 'internal';
  }
}

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && (API_ERROR_CODES as readonly string[]).includes(value);
}
