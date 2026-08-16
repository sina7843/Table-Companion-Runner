import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createDataSource, type DataSource } from './dataSource';
import type { FixtureScenario } from './fixtureRepositories';
import type { DomainEvent, DomainEventKind, RealtimeChannel } from './realtime';
import { createNullChannel } from './realtime';
import type { Repositories } from './repositories';

const RepositoryCtx = createContext<DataSource | null>(null);

const SCENARIOS = new Set<FixtureScenario>([
  'populated',
  'first-time',
  'empty',
  'loading',
  'error',
]);

/**
 * Reads `?scenario=` from the URL so the states the screens must handle — a first-time
 * user, an empty account, a slow read, a failed read — can each be looked at. Anything
 * unrecognised falls back to the populated world.
 */
function scenarioFromUrl(): FixtureScenario {
  if (typeof window === 'undefined') return 'populated';
  const value = new URLSearchParams(window.location.search).get('scenario');
  return value && SCENARIOS.has(value as FixtureScenario)
    ? (value as FixtureScenario)
    : 'populated';
}

/**
 * Injects the data layer. Screens call `useRepositories()` and never construct a
 * repository themselves, which is what lets `createDataSource` decide — from configuration
 * alone — whether they are talking to local fixtures or to a deployed API.
 */
export function RepositoryProvider({
  repositories,
  channel,
  children,
}: {
  /** Overridable so tests and Storybook-style surfaces can supply their own. */
  repositories?: Repositories;
  channel?: RealtimeChannel;
  children: ReactNode;
}) {
  // One decision, taken once: configuration picks the data layer and the channel, and
  // nothing downstream learns which it got.
  const configured = useMemo(() => createDataSource({ scenario: scenarioFromUrl() }), []);

  const value = useMemo<DataSource>(
    () =>
      repositories
        ? {
            kind: 'fixtures',
            repositories,
            channel: channel ?? createNullChannel(),
            description: 'Supplied by the host',
          }
        : configured,
    [repositories, channel, configured],
  );

  // A channel holds a BroadcastChannel or a socket; both are closed when the app unmounts.
  useEffect(() => () => value.channel.close(), [value]);

  return <RepositoryCtx.Provider value={value}>{children}</RepositoryCtx.Provider>;
}

function useDataSource(): DataSource {
  const source = useContext(RepositoryCtx);
  if (!source) throw new Error('useRepositories must be used inside a RepositoryProvider');
  return source;
}

export function useRepositories(): Repositories {
  return useDataSource().repositories;
}

/** Which layer is answering, for a screen or a reader that wants to say so. */
export function useDataSourceInfo(): Pick<DataSource, 'kind' | 'description'> {
  const { kind, description } = useDataSource();
  return { kind, description };
}

/**
 * Runs `onChange` when another device changes something this screen is showing.
 *
 * The event is a notification, so the handler re-reads rather than trusting a payload —
 * every caller passes a `reload`. Nothing here debounces: events are rare compared with
 * renders, and a fight that lags behind the table is worse than one extra read.
 */
export function useRealtime(
  kinds: readonly DomainEventKind[],
  onChange: (event: DomainEvent) => void,
) {
  const { channel } = useDataSource();
  const handler = useRef(onChange);
  handler.current = onChange;

  // Joined only to give the effect a stable dependency; the match itself is by whole
  // value. A substring test over the joined string would fire on any kind that happened
  // to be a prefix of a wanted one.
  const wanted = kinds.join(',');
  useEffect(() => {
    const allowed = new Set(wanted.split(','));
    return channel.subscribe((event) => {
      if (allowed.has(event.kind)) handler.current(event);
    });
  }, [channel, wanted]);
}

/** The channel's own view of the connection, for the shell's status indicator. */
export function useChannelStatus(): RealtimeChannel['status'] {
  const { channel } = useDataSource();
  const [status, setStatus] = useState(channel.status);

  useEffect(() => {
    setStatus(channel.status);
    return channel.onStatus(setStatus);
  }, [channel]);

  return status;
}

/** What the read itself produced. Internal — screens see `AsyncState`. */
type ReadState<T> =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: T; error: null }
  | { status: 'error'; data: null; error: Error };

/**
 * The read, plus a way to run it again. `reload` is intersected onto the union rather
 * than returned beside it, so `state.status === 'ready'` still narrows `state.data`.
 */
export type AsyncState<T> = ReadState<T> & {
  /** Re-runs the read. Call after a write so the screen shows what just changed. */
  reload: () => void;
};

/**
 * Minimal async read for fixture-backed screens.
 *
 * ponytail: no cache, no revalidation, no request dedupe. The three-state shape is the
 * point — it forces every screen to have a loading and an error branch from the start,
 * which is what the design requires. Staleness is handled by `useRealtime` telling a
 * screen to `reload`, which is cheaper to reason about than a cache with its own rules.
 * Add one when a profiler says the reads cost something.
 */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<ReadState<T>>({ status: 'loading', data: null, error: null });

  // `load` is deliberately not a dependency — callers pass an inline closure, which is a
  // new function every render. `deps` is what identifies the request, exactly as the
  // caller declares it. The cancelled flag stops a slow response from overwriting a newer
  // one, which is the bug this shape exists to prevent.
  const key = JSON.stringify(deps);
  const reload = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading', data: null, error: null });

    load().then(
      (data) => {
        if (!cancelled) setState({ status: 'ready', data, error: null });
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            data: null,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      },
    );

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);

  // `reload` is attached to the state object rather than returned alongside it, so the
  // three-state discriminated union still narrows cleanly at the call site.
  return useMemo(() => ({ ...state, reload }), [state, reload]);
}
