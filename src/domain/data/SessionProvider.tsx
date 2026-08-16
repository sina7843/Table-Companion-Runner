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
 *
 * TC-P07 added the other half of that sentence: finding out. A session ends on the server's
 * clock and there is no expiry timestamp here to watch, so the app learns the same way a
 * person would — the next call comes back `unauthenticated`. `sessionExpiry.ts` reports that
 * once, this provider re-reads the identity to be sure, and `expired` is what lets the
 * sign-in screen say why somebody is looking at it.
 */
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
import { useRepositories } from './RepositoryProvider';
import { onSessionExpired } from './sessionExpiry.ts';
import { useTelemetry } from '../telemetry.ts';
import type { User } from '../types.ts';

export interface SessionState {
  status: 'loading' | 'ready' | 'signed-out';
  user: User | null;
  /**
   * True when the app was signed in during this visit and is not any more.
   *
   * The difference matters to the person: arriving signed out is normal, and being signed out
   * mid-edit needs to say so — otherwise a sign-in form appearing over somebody's work reads
   * as the app losing their place for no reason.
   */
  expired: boolean;
  /** Re-reads the identity, for after a sign-in or a reconnect. */
  refresh: () => void;
  /** Resolves to the signed-in user, or rejects with the server's own sentence. */
  signIn: (input: { email: string; password: string }) => Promise<User>;
  signUp: (input: { email: string; password: string; displayName: string }) => Promise<User>;
  signOut: () => Promise<void>;
  /** Replaces the cached identity after the account changes something about itself. */
  setUser: (user: User) => void;
}

const SessionCtx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { users, auth } = useRepositories();
  const [state, setState] = useState<Pick<SessionState, 'status' | 'user'>>({
    status: 'loading',
    user: null,
  });
  const [version, setVersion] = useState(0);
  const [expired, setExpired] = useState(false);

  const signIn = useCallback(
    async (input: { email: string; password: string }) => {
      const user = await auth.signIn(input);
      believedSignedIn.current = true;
      setExpired(false);
      setState({ status: 'ready', user });
      return user;
    },
    [auth],
  );

  const signUp = useCallback(
    async (input: { email: string; password: string; displayName: string }) => {
      const user = await auth.signUp(input);
      believedSignedIn.current = true;
      setExpired(false);
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
      // Deliberate, so it is not reported as an expiry: the person meant this.
      believedSignedIn.current = false;
      setExpired(false);
      setState({ status: 'signed-out', user: null });
    }
  }, [auth]);

  const setUser = useCallback((user: User) => {
    setState((current) => (current.status === 'ready' ? { status: 'ready', user } : current));
  }, []);

  /**
   * A call came back `unauthenticated`, so the session ended on the server's clock.
   *
   * The identity is re-read rather than assumed gone: the only party that can say whether
   * there is still a session is the server, and one refused request is evidence, not proof.
   * If it answers, nothing changes on screen; if it refuses too, the app is signed out with
   * `expired` set, and the sign-in screen can say why the user is looking at it.
   *
   * **Only when this app believed it was signed in.** Without that guard the re-read is
   * itself a call that comes back `unauthenticated`, which reports another expiry, which
   * re-reads — and a signed-out visitor's browser asks `/me` forever. TC-P08 found exactly
   * that, six hundred times in fifteen seconds, on the sign-in screen. It could not have
   * shown up below the browser: nothing under a DOM ever mounts this provider.
   *
   * The flag is lowered as the signal is taken, so one ended session produces one re-read.
   */
  const telemetry = useTelemetry();
  const believedSignedIn = useRef(false);

  useEffect(
    () =>
      onSessionExpired(() => {
        if (!believedSignedIn.current) return;
        believedSignedIn.current = false;
        setExpired(true);
        setVersion((n) => n + 1);
        telemetry({ name: 'session_expired' });
      }),
    [telemetry],
  );

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading', user: null });

    void users.current().then(
      (user) => {
        if (!cancelled) {
          believedSignedIn.current = true;
          setExpired(false);
          setState({ status: 'ready', user });
        }
      },
      () => {
        // A failed identity read is signed-out, not an error page: the rest of the shell
        // still renders, and the screens that need a user say so themselves.
        if (!cancelled) {
          believedSignedIn.current = false;
          setState({ status: 'signed-out', user: null });
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [users, version]);

  const value = useMemo<SessionState>(
    () => ({
      ...state,
      expired: expired && state.status === 'signed-out',
      refresh: () => setVersion((n) => n + 1),
      signIn,
      signUp,
      signOut,
      setUser,
    }),
    [state, expired, signIn, signUp, signOut, setUser],
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
