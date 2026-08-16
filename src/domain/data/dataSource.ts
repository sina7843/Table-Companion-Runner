/**
 * Which data layer this build talks to.
 *
 * Development may deliberately run on fixtures with no server. A production bundle may not:
 * silently serving invented data because a build forgot `VITE_API_BASE_URL` is worse than
 * failing loudly, so production refuses that configuration before constructing a channel.
 *
 * See `.env.example` for the public browser variables. Never put a credential in one:
 * everything with a `VITE_` prefix is shipped to the browser.
 */
import { createFixtureRepositories, type FixtureScenario } from './fixtureRepositories.ts';
import { createHttpRepositories } from './httpRepositories.ts';
import { createEventStreamChannel, createLocalChannel, type RealtimeChannel } from './realtime.ts';
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
  /** Vite's compile-time production flag; exposed here only so the boundary is testable. */
  PROD?: boolean;
}

function readEnv(): Env {
  // `import.meta.env` is Vite's static replacement. Only VITE_-prefixed values are public
  // configuration; PROD is Vite's own boolean and carries no deployment secret.
  const env = import.meta.env as unknown as Record<string, string | boolean | undefined>;
  return {
    VITE_API_BASE_URL:
      typeof env.VITE_API_BASE_URL === 'string' ? env.VITE_API_BASE_URL.trim() || undefined : undefined,
    VITE_REALTIME_URL:
      typeof env.VITE_REALTIME_URL === 'string' ? env.VITE_REALTIME_URL.trim() || undefined : undefined,
    PROD: env.PROD === true,
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

  if (env.PROD && !env.VITE_API_BASE_URL) {
    throw new Error(
      'Production requires VITE_API_BASE_URL. Refusing to fall back to fixture data.',
    );
  }

  // A stream only exists when someone configured one. Otherwise the local channel is the
  // explicit development adapter: a real channel that happens to reach only this machine.
  const channel = env.VITE_REALTIME_URL
    ? createEventStreamChannel(env.VITE_REALTIME_URL)
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
    description: 'Local fixtures — development only; no server configured',
  };
}
