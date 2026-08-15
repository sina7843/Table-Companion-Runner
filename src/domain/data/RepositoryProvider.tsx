import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createFixtureRepositories } from './fixtureRepositories';
import type { Repositories } from './repositories';

const RepositoryCtx = createContext<Repositories | null>(null);

/**
 * Injects the data layer. Screens call `useRepositories()` and never construct a
 * repository themselves, so swapping fixtures for a real API in TC-13 is one change here.
 */
export function RepositoryProvider({
  repositories,
  children,
}: {
  /** Overridable so tests and Storybook-style surfaces can supply their own. */
  repositories?: Repositories;
  children: ReactNode;
}) {
  const fallback = useMemo(() => createFixtureRepositories(), []);
  return (
    <RepositoryCtx.Provider value={repositories ?? fallback}>{children}</RepositoryCtx.Provider>
  );
}

export function useRepositories(): Repositories {
  const repositories = useContext(RepositoryCtx);
  if (!repositories) throw new Error('useRepositories must be used inside a RepositoryProvider');
  return repositories;
}

export type AsyncState<T> =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: T; error: null }
  | { status: 'error'; data: null; error: Error };

/**
 * Minimal async read for fixture-backed screens.
 *
 * ponytail: no cache, no revalidation, no request dedupe. Fixtures resolve on a
 * microtask, so none of that earns its keep yet — TC-13 brings a real client and this
 * hook is where it lands. The three-state shape is deliberate: it forces every screen to
 * have a loading and an error branch from the start, which is what the design requires.
 */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading', data: null, error: null });

  // `load` is deliberately not a dependency — callers pass an inline closure, which is a
  // new function every render. `deps` is what identifies the request, exactly as the
  // caller declares it. The cancelled flag stops a slow response from overwriting a newer
  // one, which is the bug this shape exists to prevent.
  const key = JSON.stringify(deps);

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
  }, [key]);

  return state;
}
