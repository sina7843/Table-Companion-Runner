/**
 * The one thing a repository has to tell the app that is not a return value.
 *
 * A session ends on the server's clock, not the browser's. There is no expiry timestamp to
 * watch here — the cookie is HttpOnly, deliberately, so this code cannot read it and must not
 * pretend to predict it. What it can know is the moment a call comes back `unauthenticated`,
 * and that is the honest signal: the app finds out the same way the user would have.
 *
 * Kept as a module-level emitter rather than threaded through React context because the party
 * that detects it (`httpRepositories`) sits *below* the party that must react to it
 * (`SessionProvider`), and inverting that would mean a provider between the data layer and
 * itself. One subscription, no re-plumbing.
 *
 * Sign-in and sign-up are excluded by their caller: a wrong password is a 401 about a
 * credential, not about a session, and treating it as an expiry would sign a user out of a
 * session they never had.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

/**
 * Called when a request that carried a session was refused for want of one.
 *
 * Deliberately carries nothing. A listener's only correct response is to re-read the identity,
 * and a payload here would be a second source of truth about who is signed in.
 */
export function reportSessionExpired(): void {
  for (const listener of listeners) listener();
}

/** Subscribes; returns the unsubscribe. */
export function onSessionExpired(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam: drops every subscriber, so one test cannot notify the next one's listener. */
export function resetSessionExpiryListeners(): void {
  listeners.clear();
}
