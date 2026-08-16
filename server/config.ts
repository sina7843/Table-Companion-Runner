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

export interface ServerConfig {
  /** PostgreSQL connection string. Supplied by the deployment; never committed. */
  databaseUrl: string;
  port: number;
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
  isProduction: boolean;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

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

  const isProduction = env.NODE_ENV === 'production';

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
  if (crossOrigin && !isProduction) {
    throw new ConfigError(
      'TC_CROSS_ORIGIN forces SameSite=None, which browsers only accept on a Secure cookie. ' +
        'In development use the Vite dev-server proxy (VITE_API_BASE_URL=/api) instead.',
    );
  }

  const trustProxy = (env.TC_TRUST_PROXY ?? '').trim().toLowerCase() === 'true';

  return {
    databaseUrl,
    port,
    allowedOrigins,
    crossOrigin,
    cookieSameSite: crossOrigin ? 'None' : 'Strict',
    trustProxy,
    isProduction,
  };
}
