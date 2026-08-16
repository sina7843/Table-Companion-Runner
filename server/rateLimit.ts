/**
 * Abuse control: a fixed-window counter, in memory.
 *
 * Deliberately the simplest thing that works. A fixed window lets a caller spend two windows'
 * worth of requests across a boundary; a sliding log would fix that and cost a timestamp array
 * per key. The limits below are set for "stop credential stuffing and runaway retries", not
 * for fairness accounting, and doubling the burst at a boundary does not defeat either.
 *
 * ponytail: per-process. Two instances behind a load balancer each enforce their own count, so
 * the effective limit is the limit times the instance count. That is fine while there is one
 * process and wrong the moment there is not — the fix is a shared counter (Redis, or a
 * PostgreSQL table with the same shape), and it belongs with the horizontal-scaling work in
 * TC-P09 rather than as speculative infrastructure here.
 */

export interface RateRule {
  /** Requests allowed per window. */
  limit: number;
  windowMs: number;
}

export interface RateVerdict {
  allowed: boolean;
  /** Seconds until the window resets. Sent as `Retry-After`. */
  retryAfterSeconds: number;
  /** Requests left in this window, for the caller that wants to slow down before it is told. */
  remaining: number;
}

interface Window {
  count: number;
  resetAt: number;
}

/**
 * The rules, by what they protect.
 *
 * `auth` is the one that matters: it is the only endpoint where guessing repeatedly is
 * worthwhile, and scrypt makes each guess expensive for the server too. The rest exist so a
 * loop in a client cannot become an outage.
 */
export const RATE_RULES = {
  /** Sign in and sign up. Ten attempts a quarter of an hour, per address and per account. */
  auth: { limit: 10, windowMs: 15 * 60 * 1000 },
  /** Invite redemption — the other endpoint where guessing a code is the attack. */
  invite: { limit: 20, windowMs: 60 * 60 * 1000 },
  /** Rolls. A fight is fast, but not this fast. */
  roll: { limit: 600, windowMs: 60 * 1000 },
  /** Every other write. Autosave debounces at 400–500ms, so this is far above real use. */
  write: { limit: 600, windowMs: 60 * 1000 },
  /** Reads, as a backstop against a runaway effect loop rather than against an attacker. */
  read: { limit: 3000, windowMs: 60 * 1000 },
} as const satisfies Record<string, RateRule>;

export type RateClass = keyof typeof RATE_RULES;

/**
 * Scales every limit, for a deployment where one address is many people.
 *
 * The limiter counts an anonymous caller by address, which is the only thing it can know
 * about them — so a company behind one NAT, a university, a conference network or a test
 * suite all look like one very busy person. That is a real deployment property rather than a
 * test inconvenience, and the honest answer is a knob with a safe default rather than either
 * a limit nobody can raise or a limit nobody enforces.
 *
 * It scales the count and never the window: the shape of the protection stays the same.
 */
export function scaleRules(scale: number): Record<RateClass, RateRule> {
  const factor = Number.isFinite(scale) && scale >= 1 ? Math.floor(scale) : 1;
  const scaled = {} as Record<RateClass, RateRule>;
  for (const [name, rule] of Object.entries(RATE_RULES) as [RateClass, RateRule][]) {
    scaled[name] = { limit: rule.limit * factor, windowMs: rule.windowMs };
  }
  return scaled;
}

export interface RateLimiter {
  check(key: string, rule: RateRule): RateVerdict;
  /** Drops expired windows. Called on a timer by the owner, and by tests directly. */
  sweep(): void;
  size(): number;
}

export function createRateLimiter(now: () => number = Date.now): RateLimiter {
  const windows = new Map<string, Window>();

  return {
    check(key, rule) {
      const at = now();
      const existing = windows.get(key);

      if (!existing || existing.resetAt <= at) {
        windows.set(key, { count: 1, resetAt: at + rule.windowMs });
        return { allowed: true, retryAfterSeconds: 0, remaining: rule.limit - 1 };
      }

      existing.count += 1;
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - at) / 1000));
      return existing.count > rule.limit
        ? { allowed: false, retryAfterSeconds, remaining: 0 }
        : { allowed: true, retryAfterSeconds: 0, remaining: rule.limit - existing.count };
    },

    sweep() {
      const at = now();
      for (const [key, window] of windows) {
        if (window.resetAt <= at) windows.delete(key);
      }
    },

    size: () => windows.size,
  };
}

/**
 * Who to count against.
 *
 * An authenticated caller is counted by account, so one person on a flaky hotel network is not
 * throttled by everybody else behind that address — and so a botnet cannot spread a
 * credential-stuffing run across a thousand addresses once it is in. An anonymous caller has
 * only their address, which is exactly the case `auth` has to hold.
 */
export function rateKey(rateClass: RateClass, actorId: string | null, address: string): string {
  return `${rateClass}:${actorId ?? `ip:${address}`}`;
}

/**
 * The address to count an anonymous caller against.
 *
 * `X-Forwarded-For` is attacker-controlled unless a proxy we trust rewrote it, so it is read
 * only when the deployment says there is one. Leftmost is the client as the nearest trusted
 * proxy saw it; with no trusted proxy, the socket is the only thing that cannot be forged.
 */
export function clientAddress(
  socketAddress: string | undefined,
  forwardedFor: string | undefined,
  trustProxy: boolean,
): string {
  if (trustProxy && forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }
  return socketAddress ?? 'unknown';
}
