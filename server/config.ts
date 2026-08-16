/**
 * Server configuration, read once at startup.
 *
 * Nothing here is prefixed `VITE_`, and that is the point: Vite inlines every `VITE_*`
 * variable into the browser bundle, so a connection string or a credential may never carry
 * that prefix. These are read by the server process and never leave it.
 *
 * Validated at startup rather than at first use, so a misconfigured deployment fails when
 * it boots instead of when a user clicks something.
 */

/**
 * Which of the four environments this process is.
 *
 * Separate from `NODE_ENV`, which the toolchain owns and which only really has two values.
 * These four differ in what they are *allowed* to do rather than in how fast they run:
 * `production` refuses a weak secret and requires HTTPS-shaped cookies, `staging` behaves like
 * production but is expected to be reset, `test` is what the end-to-end suite and CI run, and
 * `development` is a laptop.
 *
 * Defaulting to `development` is the safe direction: nothing gains a permission by being
 * unlabelled, and a deployment that forgets to set this gets the strictest cookie policy it
 * can have over http rather than the loosest.
 */
export type Environment = 'development' | 'test' | 'staging' | 'production';

const ENVIRONMENTS = new Set<Environment>(['development', 'test', 'staging', 'production']);

export interface ServerConfig {
  /** PostgreSQL connection string. Supplied by the deployment; never committed. */
  databaseUrl: string;
  /** Which of the four environments this is. */
  environment: Environment;
  port: number;
  /** The interface to bind. `0.0.0.0` in a container, loopback by default. */
  host: string;
  /**
   * Origins accepted on an unsafe request that arrives without `Sec-Fetch-Site`.
   *
   * The deployment topology is same-origin, so this is normally empty: a browser states the
   * request's provenance and the session cookie is `SameSite=Strict` regardless. It exists
   * for a proxy or an older browser that strips the header, and it is an allowlist rather
   * than a wildcard because there is no such thing as a safe `*` beside a cookie.
   */
  allowedOrigins: string[];
  /**
   * Serve the API to a different origin than the page, with CORS.
   *
   * Off by default, and the default is the one to keep. The whole deployment story is
   * same-origin — Vite proxies `/api` in development and one origin serves both in
   * production — which is why no CORS header is emitted at all and why the session cookie can
   * be `SameSite=Strict`. Turning this on is a deliberate topology change: it requires an
   * explicit origin allowlist, and it forces the cookie to `SameSite=None`, which browsers
   * only accept with `Secure`. So it is refused outside production, where there is no HTTPS
   * to make that safe.
   */
  crossOrigin: boolean;
  /** Follows from `crossOrigin`. Never guessed at per-request. */
  cookieSameSite: 'Strict' | 'None';
  /**
   * Whether `X-Forwarded-For` may be believed.
   *
   * It is attacker-controlled unless a proxy we trust rewrote it, and it decides who a rate
   * limit counts against — so a deployment says explicitly whether there is such a proxy.
   */
  trustProxy: boolean;
  /**
   * Whether the session cookie is marked `Secure`.
   *
   * Follows the environment: staging and production are served over HTTPS, so their cookies
   * say so. It is a separate field from `isProduction` because they answer different
   * questions — TC-P10 found `DEPLOYMENT.md` promising a staging deployment production-shaped
   * cookies while `main.ts` was still keying the flag off production alone, so staging had
   * been quietly laxer than the document said.
   *
   * `TC_COOKIE_SECURE=false` is the one documented exception: a deployment genuinely not
   * served over TLS — a loopback validation, a private network behind something else. It is
   * logged loudly at startup, because a `Secure` cookie is the only thing stopping a session
   * from travelling over plain http.
   */
  secureCookies: boolean;
  /**
   * Multiplies every rate limit, for a deployment where one address is many people.
   *
   * 1 by default, which is the shipped protection. Raised where a NAT, a proxy or an
   * automated suite makes many callers look like one — see `rateLimit.ts`. Never below 1:
   * this exists to make the limits fit a topology, not to be turned off.
   */
  rateLimitScale: number;
  /**
   * Whether the process applies pending migrations as it boots.
   *
   * True on a laptop, where "start the server and have a working database" is the point.
   * A deployment usually wants the opposite: migrations are a separate, observable step that
   * runs once rather than a race between however many instances started at the same time.
   * See `DEPLOYMENT.md`.
   */
  migrateOnBoot: boolean;
  /**
   * Directory of built static files to serve, if this process is also the web server.
   *
   * The topology is same-origin, so one process serving both is the simplest thing that
   * satisfies it — no proxy to configure, no CORS to get wrong, one container to deploy. Unset,
   * the server is an API only and something in front of it serves the bundle.
   */
  staticDir: string | null;
  /** How long a shutdown waits for in-flight work before it stops waiting. */
  shutdownGraceMs: number;
  isProduction: boolean;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Environments whose cookies are `Secure`, because they are served over HTTPS. */
const secureByDefault = (environment: Environment): boolean =>
  environment === 'production' || environment === 'staging';

export function readConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new ConfigError(
      'DATABASE_URL is not set. See .env.example, and `docker compose up -d` for a local database.',
    );
  }

  const rawPort = env.PORT?.trim();
  const port = rawPort ? Number(rawPort) : 8787;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new ConfigError(`PORT must be a port number, not "${rawPort}".`);
  }

  const rawEnvironment = (env.TC_ENV ?? '').trim().toLowerCase();
  if (rawEnvironment && !ENVIRONMENTS.has(rawEnvironment as Environment)) {
    throw new ConfigError(
      `TC_ENV must be one of development, test, staging, production — not "${rawEnvironment}".`,
    );
  }
  // `NODE_ENV=production` still means production, so an existing deployment keeps working.
  const environment: Environment =
    (rawEnvironment as Environment) ||
    (env.NODE_ENV === 'production' ? 'production' : 'development');
  const isProduction = environment === 'production';

  const allowedOrigins = (env.TC_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (allowedOrigins.includes('*')) {
    throw new ConfigError('TC_ALLOWED_ORIGINS is an allowlist; "*" is not a value it can take.');
  }

  // TC_DEV_USER_ID was TC-P01's identity shim and TC-P02 replaced it with real sign-in.
  // Failing loudly beats a deployment quietly signing everybody in as one account.
  if (env.TC_DEV_USER_ID?.trim()) {
    throw new ConfigError(
      'TC_DEV_USER_ID is no longer read. Authentication is real as of TC-P02 — sign in instead, ' +
        'and see .env.example for the seeded development accounts.',
    );
  }

  const crossOrigin = (env.TC_CROSS_ORIGIN ?? '').trim().toLowerCase() === 'true';
  if (crossOrigin && allowedOrigins.length === 0) {
    throw new ConfigError('TC_CROSS_ORIGIN needs TC_ALLOWED_ORIGINS to say which origins.');
  }
  if (crossOrigin && !secureByDefault(environment)) {
    throw new ConfigError(
      'TC_CROSS_ORIGIN forces SameSite=None, which browsers only accept on a Secure cookie. ' +
        'In development use the Vite dev-server proxy (VITE_API_BASE_URL=/api) instead.',
    );
  }

  const trustProxy = (env.TC_TRUST_PROXY ?? '').trim().toLowerCase() === 'true';

  const rawScale = env.TC_RATE_LIMIT_SCALE?.trim();
  const rateLimitScale = rawScale ? Number(rawScale) : 1;
  if (!Number.isInteger(rateLimitScale) || rateLimitScale < 1 || rateLimitScale > 1000) {
    throw new ConfigError(
      `TC_RATE_LIMIT_SCALE must be a whole number between 1 and 1000, not "${rawScale}".`,
    );
  }

  // Staging is production with different data, so it gets production's cookie policy: a
  // staging deployment that only works because its cookies are laxer has proved nothing.
  const rawSecure = (env.TC_COOKIE_SECURE ?? '').trim().toLowerCase();
  if (rawSecure && rawSecure !== 'true' && rawSecure !== 'false') {
    throw new ConfigError(`TC_COOKIE_SECURE must be true or false, not "${rawSecure}".`);
  }
  const secureCookies = rawSecure ? rawSecure === 'true' : secureByDefault(environment);

  const host = env.HOST?.trim() || (secureCookies ? '0.0.0.0' : '127.0.0.1');

  // On for a laptop, off for a deployment — the default follows the environment rather than
  // being the same everywhere. TC-P10 found it defaulting to *on* under TC_ENV=production,
  // which is only safe because the image sets it explicitly; a deployment built any other way
  // would have had every instance racing for the schema as it booted.
  const rawMigrate = (env.TC_MIGRATE_ON_BOOT ?? '').trim().toLowerCase();
  if (rawMigrate && rawMigrate !== 'true' && rawMigrate !== 'false') {
    throw new ConfigError(`TC_MIGRATE_ON_BOOT must be true or false, not "${rawMigrate}".`);
  }
  const migrateOnBoot = rawMigrate ? rawMigrate === 'true' : !secureByDefault(environment);

  const staticDir = env.TC_STATIC_DIR?.trim() || null;

  const rawGrace = env.TC_SHUTDOWN_GRACE_MS?.trim();
  const shutdownGraceMs = rawGrace ? Number(rawGrace) : 15_000;
  if (!Number.isInteger(shutdownGraceMs) || shutdownGraceMs < 0 || shutdownGraceMs > 300_000) {
    throw new ConfigError(
      `TC_SHUTDOWN_GRACE_MS must be a whole number of milliseconds up to 300000, not "${rawGrace}".`,
    );
  }

  return {
    databaseUrl,
    environment,
    port,
    host,
    allowedOrigins,
    crossOrigin,
    cookieSameSite: crossOrigin ? 'None' : 'Strict',
    trustProxy,
    secureCookies,
    rateLimitScale,
    migrateOnBoot,
    staticDir,
    shutdownGraceMs,
    isProduction,
  };
}
