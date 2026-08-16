/**
 * Who is signed in.
 *
 * Before this existed, eleven screens imported `CURRENT_USER_ID` straight from the fixture
 * file — which meant every one of them had a hard dependency on demo data, and the day a
 * real sign-in arrived every one of them would have had to change. Now they ask the
 * session, and the session asks `users.current()` through the repository. Fixtures answer
 * with the fixture user; a deployment answers with whoever holds the cookie.
 *
 * This layer deliberately does not sign anybody in. It has no credential, reads no secret,
 * and knows no provider — it reads the identity the data layer already resolved.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRepositories } from './RepositoryProvider';
import type { User } from '../types.ts';

export interface SessionState {
  status: 'loading' | 'ready' | 'signed-out';
  user: User | null;
  /** Re-reads the identity, for after a sign-in or a reconnect. */
  refresh: () => void;
}

const SessionCtx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { users } = useRepositories();
  const [state, setState] = useState<Omit<SessionState, 'refresh'>>({
    status: 'loading',
    user: null,
  });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading', user: null });

    void users.current().then(
      (user) => {
        if (!cancelled) setState({ status: 'ready', user });
      },
      () => {
        // A failed identity read is signed-out, not an error page: the rest of the shell
        // still renders, and the screens that need a user say so themselves.
        if (!cancelled) setState({ status: 'signed-out', user: null });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [users, version]);

  return (
    <SessionCtx.Provider value={{ ...state, refresh: () => setVersion((n) => n + 1) }}>
      {children}
    </SessionCtx.Provider>
  );
}

/**
 * Holds the tree back until the identity has resolved.
 *
 * One gate rather than a null check in every screen: with a real API this is the single
 * request an auth boundary makes before the app renders, and with fixtures it is a
 * microtask. `signed-out` still renders — that is a state, not a wait.
 */
export function SessionGate({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  return useSession().status === 'loading' ? <>{fallback}</> : <>{children}</>;
}

export function useSession(): SessionState {
  const session = useContext(SessionCtx);
  if (!session) throw new Error('useSession must be used inside a SessionProvider');
  return session;
}

/**
 * The signed-in user's id, for the many screens that only need that.
 *
 * Returns null while the identity is still resolving, which is why every caller passes it
 * through `useAsync`'s dependency list — the read re-runs once it lands rather than firing
 * against nobody.
 */
export function useUserId(): User['id'] | null {
  return useSession().user?.id ?? null;
}
