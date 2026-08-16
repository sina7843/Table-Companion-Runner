/**
 * Structured logs, and the rule about what may go in one.
 *
 * One JSON object per line on stdout, because that is what every log pipeline can already
 * read and it costs no dependency. A human reading it directly gets something dense but
 * legible; `jq` gets something queryable.
 *
 * **What a log line may contain:** the request id, the method, the *route pattern*, the
 * status, how long it took, and the account id.
 *
 * **What it may never contain:** a request or response body, a cookie, a session token, a
 * password, an email address, a query string, or a resolved path. Those are the four ways a
 * log becomes the thing that leaks. The route *pattern* is logged rather than the URL
 * precisely so that no id, invite code or search term is written down — `/campaigns/:campaignId`
 * says everything an operator needs and nothing a subject would object to.
 *
 * An error is logged by its message alone. A stack trace is useful and also the place a
 * connection string most often appears, so it is left out and the request id is what ties a
 * report to a line.
 *
 * As of TC-P09 the rule is **enforced, not stated**: `redact()` runs on every line from every
 * caller, refuses a field whose name looks like a credential, and refuses a value that looks
 * like one whatever it is called. A rule that lives only in a comment is one hurried commit
 * away from being untrue.
 */

export type LogLevel = 'info' | 'warn' | 'error';

export interface RequestLog {
  requestId: string;
  method: string;
  /** The pattern, never the resolved path. `-` when nothing matched. */
  route: string;
  status: number;
  durationMs: number;
  /** The signed-in account, when there was one. Never an email. */
  actorId?: string;
  /** The stable error code, for a failed request. */
  code?: string;
  /** One sentence. Never a stack, never a payload. */
  message?: string;
}

export interface Logger {
  request(level: LogLevel, entry: RequestLog): void;
  event(level: LogLevel, event: string, fields?: Record<string, string | number | boolean>): void;
}

/** ISO-8601, so a line sorts by time as a string. */
const stamp = (): string => new Date().toISOString();

/* ── The guard ──────────────────────────────────────────────────────────────── */

/**
 * Field names a log line may never carry, whatever anyone passes.
 *
 * The rules above are a policy, and a policy is a thing somebody forgets under pressure — a
 * new field on `RequestLog`, a `logger.event` call with the wrong object, a well-meaning
 * `...error`. This is the same policy as code, applied to every line on its way out.
 *
 * Matched on the *name*, case-insensitively and as a substring, because that is what catches
 * `passwordHash`, `sessionToken` and `x-api-key` without needing to have thought of each one.
 */
const FORBIDDEN_KEYS = [
  'password',
  'token',
  'secret',
  'cookie',
  'authorization',
  'credential',
  'apikey',
  'api_key',
  'email',
  'inviteCode',
  'invite_code',
  'body',
  'payload',
  'query',
  'stack',
];

/**
 * Values that are a credential whatever they are called.
 *
 * Two shapes, both of which have shown up in a log line in some project: this application's own
 * password hash format, and its session cookie. Neither has any business in a log, and a
 * message that quotes one is a message that was assembled from the wrong thing.
 */
const FORBIDDEN_VALUES = [/scrypt\$/i, /tc_session=/i, /\bbearer\s+\S+/i];

const isForbiddenKey = (key: string): boolean => {
  const lowered = key.toLowerCase();
  return FORBIDDEN_KEYS.some((forbidden) => lowered.includes(forbidden.toLowerCase()));
};

/** What is written in place of something that may not be. Visible, so it is noticed. */
const REDACTED = '[redacted]';

/**
 * Strips what may not be logged, one level deep and then some.
 *
 * Deliberately not a deep clone of arbitrary structures: a log record is a flat object by
 * design, and a nested one is already a sign that something is being logged that should not
 * be. A nested value is redacted wholesale rather than walked.
 */
export function redact(record: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (isForbiddenKey(key)) {
      safe[key] = REDACTED;
      continue;
    }
    if (typeof value === 'string') {
      safe[key] = FORBIDDEN_VALUES.some((pattern) => pattern.test(value)) ? REDACTED : value;
      continue;
    }
    if (value === null || typeof value !== 'object') {
      safe[key] = value;
      continue;
    }
    // An object where a scalar belongs. Its *shape* is worth knowing; its contents are not.
    safe[key] = REDACTED;
  }

  return safe;
}

export function createLogger(
  write: (line: string) => void = (line) => process.stdout.write(line),
): Logger {
  const emit = (record: Record<string, unknown>): void => {
    // The guard runs on the way out, on every line, from every caller. A policy that lives
    // only in a comment is a policy that is one hurried commit from being untrue.
    write(`${JSON.stringify(redact(record))}\n`);
  };

  return {
    request(level, entry) {
      emit({ ts: stamp(), level, kind: 'request', ...entry });
    },
    event(level, event, fields = {}) {
      emit({ ts: stamp(), level, kind: 'event', event, ...fields });
    },
  };
}

/** Discards everything. For tests that are not about logging. */
export const silentLogger: Logger = { request: () => {}, event: () => {} };
