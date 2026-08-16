/**
 * Accounts, sessions, cookies and CSRF.
 *
 * Everything here is `node:crypto` and nothing else. Password hashing is scrypt, which the
 * standard library ships with a memory-hard KDF and a constant-time comparison; a bcrypt or
 * argon2 dependency would buy a different set of parameters, not a different guarantee.
 *
 * Four rules this file exists to keep:
 *
 * 1. **A password is never stored, logged or returned.** Only a scrypt digest with its own
 *    salt and parameters, so a stolen database is not a stolen password list.
 * 2. **A session token is never stored.** The database holds its SHA-256. The token exists in
 *    the `Set-Cookie` that mints it and in the browser afterwards, and nowhere else — a read
 *    of `sessions` cannot impersonate anybody.
 * 3. **The cookie is `HttpOnly`, `SameSite=Strict` and `Secure` in production.** Script cannot
 *    read it, and the browser will not attach it to any cross-site request at all, which is
 *    what makes CSRF a defence-in-depth question here rather than the primary one.
 * 4. **A wrong email and a wrong password are the same answer.** Sign-in failure says one
 *    sentence and takes the same work either way, so it is not an account-enumeration oracle.
 */
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { id, type UserId } from '../src/domain/types.ts';
import type { Db } from './db.ts';

/* ── Passwords ──────────────────────────────────────────────────────────────── */

// OWASP's floor for scrypt at the time of writing. Stored per hash, so raising them later
// does not invalidate an existing password — the digest carries the cost it was made with.
interface ScryptCost {
  N: number;
  r: number;
  p: number;
  keylen: number;
}

const SCRYPT: ScryptCost = { N: 16_384, r: 8, p: 1, keylen: 64 };

/** The shortest password this accepts. Length is the only rule; composition rules do not help. */
export const MIN_PASSWORD_LENGTH = 10;

function scryptAsync(password: string, salt: Buffer, keylen: number, cost: ScryptCost) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      keylen,
      { N: cost.N, r: cost.r, p: cost.p, maxmem: 256 * 1024 * 1024 },
      (error, derived) => (error ? reject(error) : resolve(derived)),
    );
  });
}

/** `scrypt$N$r$p$salt$hash`, all base64url. Self-describing, so parameters can move on. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, SCRYPT.keylen, SCRYPT);
  return [
    'scrypt',
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const parts = stored?.split('$') ?? [];
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, rawN, rawR, rawP, rawSalt, rawHash] = parts;
  const cost = { N: Number(rawN), r: Number(rawR), p: Number(rawP), keylen: 0 };
  if (!Number.isInteger(cost.N) || !Number.isInteger(cost.r) || !Number.isInteger(cost.p)) {
    return false;
  }

  const expected = Buffer.from(rawHash ?? '', 'base64url');
  const salt = Buffer.from(rawSalt ?? '', 'base64url');
  if (expected.length === 0 || salt.length === 0) return false;

  const derived = await scryptAsync(password, salt, expected.length, {
    ...SCRYPT,
    N: cost.N,
    r: cost.r,
    p: cost.p,
  });
  // Lengths are equal by construction above, but timingSafeEqual throws if they are not.
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/**
 * Burns roughly the work a real verification costs, for an email that does not exist.
 *
 * Without it, "no such account" returns in microseconds and "wrong password" in ~100ms, and
 * the difference is a list of who has an account here.
 */
const DUMMY_HASH_PROMISE = hashPassword(randomBytes(24).toString('base64url'));
export async function burnVerificationTime(password: string): Promise<void> {
  await verifyPassword(password, await DUMMY_HASH_PROMISE);
}

/* ── Sessions ───────────────────────────────────────────────────────────────── */

export const SESSION_COOKIE = 'tc_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Sliding expiry, but not a write per request: the row is touched at most once a day. */
const SESSION_TOUCH_AFTER_MS = 24 * 60 * 60 * 1000;

const digest = (token: string): string => createHash('sha256').update(token).digest('hex');

export interface SessionRecord {
  userId: UserId;
  expiresAt: Date;
}

export async function createSession(
  db: Db,
  userId: string,
  userAgent?: string,
): Promise<{ token: string; expiresAt: Date }> {
  // 32 bytes from the CSPRNG. The token is returned once, to be put in a cookie.
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.query(
    'insert into sessions (token_hash, user_id, expires_at, user_agent) values ($1,$2,$3,$4)',
    [digest(token), userId, expiresAt.toISOString(), userAgent?.slice(0, 200) ?? null],
  );

  return { token, expiresAt };
}

/**
 * Resolves a token to a session, or null.
 *
 * Expiry is checked in SQL rather than in JavaScript, so a clock-skewed process cannot
 * accept a session the database considers dead.
 */
export async function readSession(db: Db, token: string | null): Promise<SessionRecord | null> {
  if (!token) return null;

  const hash = digest(token);
  const [row] = await db.query<{ user_id: string; expires_at: Date; last_seen_at: Date }>(
    'select user_id, expires_at, last_seen_at from sessions where token_hash = $1 and expires_at > now()',
    [hash],
  );
  if (!row) return null;

  if (Date.now() - new Date(row.last_seen_at).getTime() > SESSION_TOUCH_AFTER_MS) {
    await db.query(
      'update sessions set last_seen_at = now(), expires_at = now() + $2::interval where token_hash = $1',
      [hash, `${Math.floor(SESSION_TTL_MS / 1000)} seconds`],
    );
  }

  return { userId: id<'User'>(row.user_id), expiresAt: new Date(row.expires_at) };
}

export async function revokeSession(db: Db, token: string | null): Promise<void> {
  if (!token) return;
  await db.query('delete from sessions where token_hash = $1', [digest(token)]);
}

/** Every session for one account — what a password change or "sign out everywhere" needs. */
export async function revokeAllSessions(db: Db, userId: string): Promise<void> {
  await db.query('delete from sessions where user_id = $1', [userId]);
}

/* ── Accounts ───────────────────────────────────────────────────────────────── */

export interface AccountRow {
  id: string;
  display_name: string;
  password_hash: string | null;
}

const normaliseEmail = (email: string): string => email.trim().toLowerCase();

export async function findAccountByEmail(db: Db, email: string): Promise<AccountRow | null> {
  const [row] = await db.query<AccountRow>(
    'select id, display_name, password_hash from users where lower(email) = $1',
    [normaliseEmail(email)],
  );
  return row ?? null;
}

export async function createAccount(
  db: Db,
  input: { userId: string; email: string; password: string; displayName: string },
): Promise<void> {
  await db.query(
    `insert into users (id, display_name, email, password_hash, password_updated_at)
     values ($1,$2,$3,$4, now())`,
    [
      input.userId,
      input.displayName,
      normaliseEmail(input.email),
      await hashPassword(input.password),
    ],
  );
}

/** Gives an existing account a password. Used only by the development seed. */
export async function setPassword(db: Db, userId: string, email: string, password: string) {
  await db.query(
    `update users set email = coalesce(email, $2), password_hash = $3, password_updated_at = now()
     where id = $1 and password_hash is null`,
    [userId, normaliseEmail(email), await hashPassword(password)],
  );
}

/* ── Cookies ────────────────────────────────────────────────────────────────── */

export function readCookie(request: IncomingMessage, name: string): string | null {
  const header = request.headers.cookie;
  if (!header) return null;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return null;
}

export interface CookiePolicy {
  /**
   * Strict for the same-origin deployment, which is the default and the one to keep: nothing
   * in this product is reached by following a link from another site, so no flow needs the
   * cookie on a cross-site navigation, and Strict means the browser never attaches it to a
   * cross-site request of any kind. None only when a deployment has explicitly opted into a
   * cross-origin topology, and then `secure` must be true — browsers reject the pair
   * otherwise, which `config.ts` enforces at startup rather than discovering here.
   */
  sameSite: 'Strict' | 'None';
  secure: boolean;
}

export function sessionCookie(token: string, expiresAt: Date, policy: CookiePolicy): string {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `SameSite=${policy.sameSite}`,
    `Expires=${expiresAt.toUTCString()}`,
    ...(policy.secure ? ['Secure'] : []),
  ].join('; ');
}

export function clearedSessionCookie(policy: CookiePolicy): string {
  return [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    `SameSite=${policy.sameSite}`,
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    ...(policy.secure ? ['Secure'] : []),
  ].join('; ');
}

/* ── CSRF ───────────────────────────────────────────────────────────────────── */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Whether an unsafe request may carry the session cookie's authority.
 *
 * The deployment topology is same-origin — the browser talks to one origin, and in
 * development Vite proxies `/api` to the backend rather than the page making a cross-origin
 * call. So there is no legitimate cross-site write, and none is allowed.
 *
 * `SameSite=Strict` already means a cross-site request arrives with no cookie and therefore
 * no authority. This is the second lock: a browser states the request's provenance in
 * `Sec-Fetch-Site`, and `Origin` is checked against an explicit allowlist for the older
 * browsers and proxy topologies that do not send it.
 *
 * A request with neither header is not a browser request, and a non-browser client has no
 * ambient cookie to be tricked into sending — but it is still refused, because a caller that
 * cannot state its provenance should be using a token, and TC-P03 is where one would go.
 */
export function isSameSiteWrite(
  method: string,
  headers: { origin?: string; secFetchSite?: string },
  allowedOrigins: readonly string[],
): boolean {
  if (SAFE_METHODS.has(method)) return true;

  const site = headers.secFetchSite;
  if (site) return site === 'same-origin' || site === 'none';

  const origin = headers.origin;
  if (origin) return allowedOrigins.includes(origin);

  return false;
}
