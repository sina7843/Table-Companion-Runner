/**
 * Which data layer this build talks to.
 *
 * One decision, made once, from configuration rather than from a code change. Nothing is
 * read here that is not already public in a browser bundle: a base URL and a socket URL.
 * There is no key, no token and no provider name, and there is no default endpoint — with
 * nothing configured the application runs on fixtures, which is what makes `npm run dev`
 * work on a fresh clone with no `.env` at all.
 *
 * See `.env.example` for the variables. Never put a credential in one: everything a Vite
 * `VITE_`-prefixed variable holds is shipped to the browser.
 */
import { createFixtureRepositories, type FixtureScenario } from './fixtureRepositories.ts';
import { createHttpRepositories } from './httpRepositories.ts';
import { createLocalChannel, createSocketChannel, type RealtimeChannel } from './realtime.ts';
import { withRealtime } from './withRealtime.ts';
import type { Repositories } from './repositories.ts';

export type DataSourceKind = 'fixtures' | 'api';

export interface DataSource {
  kind: DataSourceKind;
  repositories: Repositories;
  channel: RealtimeChannel;
  /** Stated so a screen, or a reader, can tell which layer is answering. */
  description: string;
}

interface Env {
  VITE_API_BASE_URL?: string;
  VITE_REALTIME_URL?: string;
}

function readEnv(): Env {
  // `import.meta.env` is Vite's static replacement; it exposes only VITE_-prefixed values,
  // which is exactly why no credential may ever be named with that prefix.
  const env = import.meta.env as unknown as Record<string, string | undefined>;
  return {
    VITE_API_BASE_URL: env.VITE_API_BASE_URL?.trim() || undefined,
    VITE_REALTIME_URL: env.VITE_REALTIME_URL?.trim() || undefined,
  };
}

export interface DataSourceOptions {
  /** Only meaningful for fixtures: the demo world to build. */
  scenario?: FixtureScenario;
  /** Overrides the environment, for tests and for a host that configures at runtime. */
  env?: Env;
}

export function createDataSource(options: DataSourceOptions = {}): DataSource {
  const env = options.env ?? readEnv();

  // A socket only exists when someone configured one. Otherwise the local channel is a
  // real channel that happens to reach only this machine — which is enough for a DM tab
  // and a player tab to stay in step, and is not a pretend one.
  const channel = env.VITE_REALTIME_URL
    ? createSocketChannel(env.VITE_REALTIME_URL)
    : createLocalChannel();

  if (env.VITE_API_BASE_URL) {
    return {
      kind: 'api',
      channel,
      repositories: withRealtime(
        createHttpRepositories({ baseUrl: env.VITE_API_BASE_URL }),
        channel,
      ),
      description: `API at ${env.VITE_API_BASE_URL}`,
    };
  }

  return {
    kind: 'fixtures',
    channel,
    repositories: withRealtime(
      createFixtureRepositories({ scenario: options.scenario ?? 'populated' }),
      channel,
    ),
    description: 'Local fixtures — no server configured',
  };
}
