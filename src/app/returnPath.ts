/**
 * Where a signed-out visitor was trying to go, if anywhere.
 *
 * `RequireSession` records it when it redirects; the sign-in and sign-up screens read it back.
 *
 * Only a same-origin path is honoured. An absolute or protocol-relative URL arriving in router
 * state would make the sign-in screen an open redirect, and the moment somebody is most likely
 * to follow a link without reading it is the one right after they have typed a password.
 *
 * Its own module rather than a helper inside the screen so it can be tested directly: this is
 * a security check, and the project has no DOM test environment to exercise it through the
 * component.
 */
export function returnPath(state: unknown): string | null {
  const from = (state as { from?: unknown } | null)?.from;
  if (typeof from !== 'string') return null;
  return from.startsWith('/') && !from.startsWith('//') ? from : null;
}
