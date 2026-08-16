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

export function createLogger(
  write: (line: string) => void = (line) => process.stdout.write(line),
): Logger {
  const emit = (record: Record<string, unknown>): void => {
    write(`${JSON.stringify(record)}\n`);
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
