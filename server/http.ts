/**
 * The API boundary: correlate, limit, authenticate, authorize, validate, run, answer.
 *
 * Built on `node:http` rather than a framework, for the same reason this repository has no
 * state library and no test framework: the whole surface is enumerated routes with no
 * middleware stack, and a router for that is a matcher and a JSON writer.
 *
 * The order below *is* the security story, and it is deliberately boring. Each step is cheap
 * and refuses on its own, so nothing expensive happens for a request that was never going to
 * be allowed — the scrypt verification behind sign-in sits behind the rate limiter, and the
 * rate limiter sits behind the same-site check.
 *
 *  1. Every request gets an id, echoed in `X-Request-Id` and in the log line.
 *  2. CORS, only if this deployment has explicitly opted into a cross-origin topology. It has
 *     not, by default, and then no CORS header exists to get wrong.
 *  3. `/health` answers without touching anything else.
 *  4. An unsafe method must be same-site. `SameSite=Strict` already means a cross-site request
 *     arrives with no cookie and therefore no authority; this is the second lock.
 *  5. The session cookie is resolved to an account, or to nobody.
 *  6. The caller's budget for this route class is spent, or refused with `Retry-After`.
 *  7. A route that is not explicitly `anonymous` requires an account. The default is closed.
 *  8. The body is validated against the route's schema — strictly, so an unrecognised key is
 *     an over-post and a refusal rather than something quietly ignored.
 *  9. The handler runs against repositories already scoped to that account.
 *
 * Every failure answers `{ error: { code, message, requestId } }` and nothing else. A stack
 * trace, a SQL statement, a driver message and a validation *value* are never sent to a
 * client; `details` names fields, never contents, so a rejected password cannot be quoted
 * back. The log line carries the message and the route pattern — never a body, a cookie, a
 * token, a query string or a resolved path.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { id, type User } from '../src/domain/types.ts';
import type { Repositories } from '../src/domain/data/repositories.ts';
import { codeForStatus, type ApiErrorCode } from '../src/domain/data/apiContract.ts';
import { describe, validate } from '../src/domain/data/schema.ts';
import { ROUTES, type AuthContext, type RequestContext, type Route } from './routes.ts';
import { StoreError } from './store.ts';
import type { Actor } from './authorize.ts';
import type { Db } from './db.ts';
import { createLogger, silentLogger, type Logger } from './log.ts';
import {
  clientAddress,
  createRateLimiter,
  rateKey,
  RATE_RULES,
  type RateClass,
  type RateLimiter,
} from './rateLimit.ts';
import {
  burnVerificationTime,
  clearedSessionCookie,
  createAccount,
  createSession,
  findAccountByEmail,
  isSameSiteWrite,
  MIN_PASSWORD_LENGTH,
  readCookie,
  readSession,
  revokeSession,
  SESSION_COOKIE,
  sessionCookie,
  verifyPassword,
  type CookiePolicy,
} from './auth.ts';

/** Generous for a fight, small enough that a body is never a denial of service on its own. */
const MAX_BODY_BYTES = 1024 * 1024;

/** An inbound correlation id is echoed only if it is short and boring. */
const SAFE_REQUEST_ID = /^[\w.:-]{1,128}$/;

/**
 * Sent on every API response.
 *
 * `no-store` because every one of these is private to one account and none of them is worth
 * caching; `nosniff` because a JSON body must never be executed as anything else; and
 * `no-referrer` so an id in a path is not handed to whatever a page navigates to next.
 */
const STANDING_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

export interface RouteMatch {
  route: Route;
  params: Record<string, string>;
}

/**
 * Finds the route for a method and path.
 *
 * When more than one pattern matches — `/monsters/count` and `/monsters/:monsterId` both
 * match `/monsters/count` — the one with fewer parameters wins. That makes the literal path
 * always beat the placeholder, so the order of the route table carries no meaning and cannot
 * be broken by an edit that reorders it.
 */
export function matchRoute(
  routes: readonly Route[],
  method: string,
  pathname: string,
): RouteMatch | null {
  const parts = pathname.split('/').filter(Boolean);
  let best: RouteMatch | null = null;
  let bestParams = Number.POSITIVE_INFINITY;

  for (const route of routes) {
    if (route.method !== method) continue;

    const pattern = route.pattern.split('/').filter(Boolean);
    if (pattern.length !== parts.length) continue;

    const params: Record<string, string> = {};
    let matched = true;
    for (const [index, segment] of pattern.entries()) {
      const actual = parts[index];
      if (actual === undefined) {
        matched = false;
        break;
      }
      if (segment.startsWith(':')) params[segment.slice(1)] = decodeURIComponent(actual);
      else if (segment !== actual) {
        matched = false;
        break;
      }
    }

    const count = Object.keys(params).length;
    if (matched && count < bestParams) {
      best = { route, params };
      bestParams = count;
    }
  }

  return best;
}

/** Which budget a route spends, when it has not said. */
const rateClassFor = (route: Route): RateClass =>
  route.rate ?? (route.method === 'GET' ? 'read' : 'write');

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new StoreError(413, 'That request is too large.', 'payload_too_large');
    }
    chunks.push(buffer);
  }

  if (size === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new StoreError(400, 'That request body is not valid JSON.', 'validation_failed');
  }
}

/* ── Credentials, checked once, here ────────────────────────────────────────── */

// Deliberately permissive: an address either routes or it does not, and a stricter pattern
// rejects real addresses far more often than it catches a bad one. TC-P07 owns verification.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SIGN_IN_FAILED = 'That email and password do not match an account.';

export interface HandlerOptions {
  db: Db;
  /** Builds the repository surface for one caller. Null means nobody is signed in. */
  repositoriesFor: (actor: Actor | null) => Repositories;
  /** How the session cookie is written. Follows the deployment topology, never the request. */
  cookie: CookiePolicy;
  /** Origins accepted on an unsafe request that carries no `Sec-Fetch-Site`. */
  allowedOrigins: readonly string[];
  /** Emit CORS headers for the allowed origins. Off unless a deployment opted in. */
  crossOrigin?: boolean;
  /** Believe `X-Forwarded-For`. Only where a trusted proxy rewrites it. */
  trustProxy?: boolean;
  routes?: readonly Route[];
  /** Answers `GET /health`. Returns false when the database cannot be reached. */
  checkHealth?: () => Promise<boolean>;
  logger?: Logger;
  /** Injectable so a test can drive the clock and so one limiter is shared per server. */
  rateLimiter?: RateLimiter;
}

export function createRequestListener(
  options: HandlerOptions,
): (request: IncomingMessage, response: ServerResponse) => void {
  const routes = options.routes ?? ROUTES;
  const { db } = options;
  const logger = options.logger ?? createLogger();
  const limiter = options.rateLimiter ?? createRateLimiter();

  return (request, response) => {
    void (async () => {
      const startedAt = performance.now();

      // Accepted from the caller so a trace can span a proxy and this process, but only when
      // it is short and boring — it ends up in a log line and in a response header.
      const inbound = request.headers['x-request-id'];
      const requestId =
        typeof inbound === 'string' && SAFE_REQUEST_ID.test(inbound) ? inbound : randomUUID();

      let route = '-';
      let actorId: string | undefined;
      let pendingCookie: string | undefined;

      const origin = request.headers.origin;
      const originAllowed = typeof origin === 'string' && options.allowedOrigins.includes(origin);
      const corsHeaders: Record<string, string> =
        options.crossOrigin && originAllowed && origin
          ? {
              'Access-Control-Allow-Origin': origin,
              'Access-Control-Allow-Credentials': 'true',
              Vary: 'Origin',
            }
          : options.crossOrigin
            ? { Vary: 'Origin' }
            : {};

      const send = (status: number, payload?: unknown): void => {
        const headers: Record<string, string> = {
          ...STANDING_HEADERS,
          ...corsHeaders,
          'X-Request-Id': requestId,
          ...(pendingCookie ? { 'Set-Cookie': pendingCookie } : {}),
        };
        if (payload === undefined) {
          response.writeHead(status, headers);
          response.end();
          return;
        }
        const encoded = JSON.stringify(payload);
        response.writeHead(status, {
          ...headers,
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': Buffer.byteLength(encoded),
        });
        response.end(encoded);
      };

      const fail = (
        status: number,
        code: ApiErrorCode,
        message: string,
        extra: { details?: string; retryAfter?: number } = {},
      ): void => {
        if (extra.retryAfter !== undefined) {
          response.setHeader('Retry-After', String(extra.retryAfter));
        }
        // A body we stopped reading leaves bytes in the socket that belong to a request
        // nobody will answer, and the next request on a kept-alive connection would be
        // parsed out of them. Closing is the only correct end to a refused upload.
        if (!request.readableEnded) response.setHeader('Connection', 'close');
        send(status, {
          error: {
            code,
            message,
            requestId,
            ...(extra.details ? { details: extra.details } : {}),
          },
        });
        logger.request(status >= 500 ? 'error' : 'warn', {
          requestId,
          method: request.method ?? 'GET',
          route,
          status,
          durationMs: Math.round(performance.now() - startedAt),
          ...(actorId ? { actorId } : {}),
          code,
          message,
        });
      };

      try {
        const url = new URL(request.url ?? '/', 'http://localhost');
        const method = request.method ?? 'GET';

        // A preflight is answered only where cross-origin is switched on. Otherwise it falls
        // through to "no such endpoint", which is the truth: there is no cross-origin API.
        if (method === 'OPTIONS' && options.crossOrigin) {
          route = 'preflight';
          response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
          response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Request-Id');
          response.setHeader('Access-Control-Max-Age', '600');
          send(originAllowed ? 204 : 403);
          return;
        }

        if (method === 'GET' && url.pathname === '/health') {
          route = '/health';
          const healthy = options.checkHealth ? await options.checkHealth() : true;
          send(healthy ? 200 : 503, { status: healthy ? 'ok' : 'unavailable' });
          return;
        }

        const match = matchRoute(routes, method, url.pathname);
        if (!match) {
          fail(404, 'not_supported', 'No such endpoint.');
          return;
        }
        route = match.route.pattern;

        if (
          !isSameSiteWrite(
            method,
            {
              origin,
              secFetchSite: request.headers['sec-fetch-site'] as string | undefined,
            },
            options.allowedOrigins,
          )
        ) {
          fail(403, 'forbidden', 'That request did not come from this application.');
          return;
        }

        const token = readCookie(request, SESSION_COOKIE);
        const session = await readSession(db, token);
        const actor: Actor | null = session ? { userId: session.userId } : null;
        if (actor) actorId = actor.userId;

        // Counted by account where there is one, and by address where there is not — which is
        // exactly the case sign-in has to hold. Spent before any expensive work happens.
        const rateClass = rateClassFor(match.route);
        const address = clientAddress(
          request.socket.remoteAddress,
          request.headers['x-forwarded-for'] as string | undefined,
          options.trustProxy ?? false,
        );
        const verdict = limiter.check(
          rateKey(rateClass, actorId ?? null, address),
          RATE_RULES[rateClass],
        );
        if (!verdict.allowed) {
          fail(429, 'rate_limited', 'Too many requests. Wait a moment and try again.', {
            retryAfter: verdict.retryAfterSeconds,
          });
          return;
        }

        if (!actor && !match.route.anonymous) {
          fail(401, 'unauthenticated', 'You are not signed in.');
          return;
        }

        // The body, validated against the route's own schema before a handler sees it.
        let parsed: unknown;
        if (method !== 'GET' && method !== 'DELETE') {
          const raw = await readBody(request);
          if (!match.route.body) {
            if (raw !== undefined) {
              fail(400, 'validation_failed', 'This request does not take a body.');
              return;
            }
          } else {
            const checked = validate(match.route.body, raw ?? {});
            if (!checked.ok) {
              // `details` names fields and never values: a rejected password must not be
              // quoted back at whoever sent it, or written into a log by way of an answer.
              fail(400, 'validation_failed', 'That request was not in the expected shape.', {
                details: describe(checked.issues),
              });
              return;
            }
            parsed = checked.value;
          }
        }

        const auth: AuthContext = {
          signIn: async (input) => {
            const { email, password } = input;
            const account = await findAccountByEmail(db, email);
            if (!account) {
              // Same answer and roughly the same work as a wrong password, so this is not a
              // list of who has an account here.
              await burnVerificationTime(password);
              throw new StoreError(401, SIGN_IN_FAILED, 'unauthenticated');
            }
            if (!(await verifyPassword(password, account.password_hash))) {
              throw new StoreError(401, SIGN_IN_FAILED, 'unauthenticated');
            }

            // A fresh token every time, so a session id captured before sign-in is worthless.
            const created = await createSession(db, account.id, request.headers['user-agent']);
            pendingCookie = sessionCookie(created.token, created.expiresAt, options.cookie);
            actorId = account.id;
            return { id: id<'User'>(account.id), displayName: account.display_name } satisfies User;
          },

          signUp: async (input) => {
            const { email, password, displayName } = input;

            if (!EMAIL.test(email)) {
              throw new StoreError(
                400,
                'That does not look like an email address.',
                'validation_failed',
              );
            }
            if (password.length < MIN_PASSWORD_LENGTH) {
              throw new StoreError(
                400,
                `A password needs at least ${MIN_PASSWORD_LENGTH} characters.`,
                'validation_failed',
              );
            }

            if (await findAccountByEmail(db, email)) {
              throw new StoreError(409, 'An account already uses that email address.', 'conflict');
            }

            const userId = `u-${randomUUID()}`;
            try {
              await createAccount(db, { userId, email, password, displayName });
            } catch {
              // The unique index is the real check; the read above is only for the message.
              throw new StoreError(409, 'An account already uses that email address.', 'conflict');
            }

            const created = await createSession(db, userId, request.headers['user-agent']);
            pendingCookie = sessionCookie(created.token, created.expiresAt, options.cookie);
            actorId = userId;
            return { id: id<'User'>(userId), displayName } satisfies User;
          },

          signOut: async () => {
            await revokeSession(db, token);
            // Cleared unconditionally: signing out of an expired session must still leave the
            // browser without a stale cookie.
            pendingCookie = clearedSessionCookie(options.cookie);
          },
        };

        const context: RequestContext = {
          params: match.params,
          query: url.searchParams,
          body: parsed,
          repos: options.repositoriesFor(actor),
          auth,
        };

        const result = await match.route.handler(context);
        // undefined is 204 (the contract's `void` routes); null is a 200 carrying `null`,
        // because every `byId` is typed `T | null` and a missing record is not a failure.
        const status = result === undefined ? 204 : 200;
        send(status, result === undefined ? undefined : result);
        logger.request('info', {
          requestId,
          method,
          route,
          status,
          durationMs: Math.round(performance.now() - startedAt),
          ...(actorId ? { actorId } : {}),
        });
      } catch (error) {
        if (error instanceof StoreError) {
          fail(error.status, error.code, error.message);
          return;
        }
        // The message only, and only to the log. The client is told nothing about it beyond
        // the request id, which is what makes a report traceable without disclosing anything.
        logger.request('error', {
          requestId,
          method: request.method ?? 'GET',
          route,
          status: 500,
          durationMs: Math.round(performance.now() - startedAt),
          ...(actorId ? { actorId } : {}),
          code: 'internal',
          message: error instanceof Error ? error.message : 'unknown error',
        });
        send(500, {
          error: {
            code: codeForStatus(500),
            message: 'Something went wrong on the server.',
            requestId,
          },
        });
      }
    })();
  };
}

export function createHttpServer(options: HandlerOptions): Server {
  const server = createServer(createRequestListener(options));

  // Expired windows are dropped on a timer rather than on every request, so a quiet server
  // does not hold a map of everyone who visited it an hour ago. Unref'd: it must not be the
  // reason the process stays alive.
  const limiter = options.rateLimiter;
  if (!limiter) return server;
  const sweep = setInterval(() => limiter.sweep(), 60_000);
  sweep.unref();
  return server;
}

export { silentLogger };
