/**
 * What an operator needs to know, in the one format every collector already reads.
 *
 * Prometheus text exposition, hand-written, because it is a line-based format and a client
 * library would be a dependency for thirty lines. Nothing here talks to a vendor: `/metrics`
 * is a plain endpoint and whatever scrapes it decides where the numbers go.
 *
 * **Labels are bounded on purpose.** A metric labelled with a request id, a campaign id or a
 * path is a metric with unbounded cardinality — it becomes a memory leak in this process and a
 * bill in whatever stores it. Route *patterns* and status *classes* are both small closed sets,
 * which is the whole reason the router already knows the pattern.
 *
 * And metrics are counts, never content. There is nothing here a subject could object to.
 */

export interface Metrics {
  /** One request finished. `route` must be a pattern, never a resolved path. */
  request(route: string, method: string, status: number, durationMs: number): void;
  /** A realtime stream opened or closed. */
  stream(delta: 1 | -1): void;
  /** Something was refused for a reason worth counting: a rate limit, a conflict, a refusal. */
  refusal(code: string): void;
  /** The Prometheus text body. */
  render(): string;
}

/** The status classes worth telling apart. Anything else is `5xx`. */
const statusClass = (status: number): string =>
  status < 300 ? '2xx' : status < 400 ? '3xx' : status < 500 ? '4xx' : '5xx';

/** Seconds, as Prometheus expects. The buckets a web request actually lives in. */
const BUCKETS = [0.005, 0.025, 0.1, 0.5, 1, 5, 30];

const escapeLabel = (value: string): string =>
  value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');

export function createMetrics(startedAt: number = performance.now()): Metrics {
  const requests = new Map<string, number>();
  const durations = new Map<string, number[]>();
  const sums = new Map<string, number>();
  const refusals = new Map<string, number>();
  let streamsOpen = 0;
  let streamsTotal = 0;

  return {
    request(route, method, status, durationMs) {
      const key = `${method}|${route}|${statusClass(status)}`;
      requests.set(key, (requests.get(key) ?? 0) + 1);

      const seconds = durationMs / 1000;
      const counts = durations.get(route) ?? Array.from({ length: BUCKETS.length + 1 }, () => 0);
      const found = BUCKETS.findIndex((edge) => seconds <= edge);
      const index = found === -1 ? BUCKETS.length : found;
      counts[index] = (counts[index] ?? 0) + 1;
      durations.set(route, counts);
      sums.set(route, (sums.get(route) ?? 0) + seconds);
    },

    stream(delta) {
      streamsOpen += delta;
      if (delta === 1) streamsTotal += 1;
    },

    refusal(code) {
      refusals.set(code, (refusals.get(code) ?? 0) + 1);
    },

    render() {
      const lines: string[] = [];

      lines.push(
        '# HELP table_companion_requests_total Requests, by route pattern, method and status class.',
        '# TYPE table_companion_requests_total counter',
      );
      for (const [key, count] of requests) {
        const [method, route, status] = key.split('|');
        lines.push(
          `table_companion_requests_total{method="${escapeLabel(method ?? '')}",route="${escapeLabel(route ?? '')}",status="${status ?? ''}"} ${count}`,
        );
      }

      lines.push(
        '# HELP table_companion_request_duration_seconds Request duration, by route pattern.',
        '# TYPE table_companion_request_duration_seconds histogram',
      );
      for (const [route, counts] of durations) {
        let cumulative = 0;
        for (const [index, edge] of BUCKETS.entries()) {
          cumulative += counts[index] ?? 0;
          lines.push(
            `table_companion_request_duration_seconds_bucket{route="${escapeLabel(route)}",le="${edge}"} ${cumulative}`,
          );
        }
        cumulative += counts[BUCKETS.length] ?? 0;
        lines.push(
          `table_companion_request_duration_seconds_bucket{route="${escapeLabel(route)}",le="+Inf"} ${cumulative}`,
          `table_companion_request_duration_seconds_sum{route="${escapeLabel(route)}"} ${(sums.get(route) ?? 0).toFixed(6)}`,
          `table_companion_request_duration_seconds_count{route="${escapeLabel(route)}"} ${cumulative}`,
        );
      }

      lines.push(
        '# HELP table_companion_refusals_total Requests refused, by the contract error code.',
        '# TYPE table_companion_refusals_total counter',
      );
      for (const [code, count] of refusals) {
        lines.push(`table_companion_refusals_total{code="${escapeLabel(code)}"} ${count}`);
      }

      lines.push(
        '# HELP table_companion_realtime_streams Event streams currently open.',
        '# TYPE table_companion_realtime_streams gauge',
        `table_companion_realtime_streams ${streamsOpen}`,
        '# HELP table_companion_realtime_streams_total Event streams opened since start.',
        '# TYPE table_companion_realtime_streams_total counter',
        `table_companion_realtime_streams_total ${streamsTotal}`,
        '# HELP table_companion_uptime_seconds Seconds since this process started serving.',
        '# TYPE table_companion_uptime_seconds gauge',
        `table_companion_uptime_seconds ${((performance.now() - startedAt) / 1000).toFixed(3)}`,
      );

      return `${lines.join('\n')}\n`;
    },
  };
}

/** Counts nothing. For tests and for a deployment that does not want the endpoint. */
export const noMetrics: Metrics = {
  request: () => {},
  stream: () => {},
  refusal: () => {},
  render: () => '',
};
