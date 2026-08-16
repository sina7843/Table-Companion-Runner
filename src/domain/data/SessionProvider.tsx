/**
 * Who is signed in.
 *
 * Before this existed, eleven screens imported `CURRENT_USER_ID` straight from the fixture
 * file — which meant every one of them had a hard dependency on demo data, and the day a
 * real sign-in arrived every one of them would have had to change. Now they ask the
 * session, and the session asks `users.current()` through the repository. Fixtures answer
 * with the fixture user; a deployment answers with whoever holds the cookie.
 *
 * As of TC-P02 that cookie is real, and this layer still holds no credential. `signIn` hands
 * an email and a password to the server and reads back a `User`; the session itself arrives
 * as an HttpOnly cookie the browser stores and this code cannot read, so there is no token
 * here to leak, persist or forget to clear. "Am I still signed in" is `users.current()`,
 * which the server answers from that cookie — and refuses when it has expired.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRepositories } from './RepositoryProvider';
import type { User } from '../types.ts';

export interface SessionState {
  status: 'loading' | 'ready' | 'signed-out';
  user: User | null;
  /** Re-reads the identity, for after a sign-in or a reconnect. */
  refresh: () => void;
  /** Resolves to the signed-in user, or rejects with the server's own sentence. */
  signIn: (input: { email: string; password: string }) => Promise<User>;
  signOut: () => Promise<void>;
}

const SessionCtx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { users, auth } = useRepositories();
  const [state, setState] = useState<Pick<SessionState, 'status' | 'user'>>({
    status: 'loading',
    user: null,
  });
  const [version, setVersion] = useState(0);

  const signIn = useCallback(
    async (input: { email: string; password: string }) => {
      const user = await auth.signIn(input);
      setState({ status: 'ready', user });
      return user;
    },
    [auth],
  );

  const signOut = useCallback(async () => {
    // The server clears the cookie; this only stops the app rendering somebody who is gone.
    // A failed sign-out still signs out locally — leaving the UI logged in would be worse.
    try {
      await auth.signOut();
    } finally {
      setState({ status: 'signed-out', user: null });
    }
  }, [auth]);

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

  const value = useMemo<SessionState>(
    () => ({ ...state, refresh: () => setVersion((n) => n + 1), signIn, signOut }),
    [state, signIn, signOut],
  );

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
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
