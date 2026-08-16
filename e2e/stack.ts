/**
 * The stack the end-to-end suite runs against: a real PostgreSQL database, the real backend,
 * and the real built bundle served over the same origin.
 *
 * Nothing here is a stand-in. The point of TC-P08 is that the Golden Path is exercised by two
 * independent browsers against the software a deployment would run — a mock at any layer would
 * turn "the product works" into "the mock agrees with the test".
 *
 * **It owns its own database.** `TC_E2E_DATABASE_URL`, or the same server as `DATABASE_URL`
 * with the database name suffixed `_e2e`. The suite drops and rebuilds it on every run, which
 * is only safe because it is not the developer's — CLAUDE.md's rule against destroying
 * developer data is why this is a separate database rather than a schema inside theirs.
 *
 * The API is spawned here rather than by Playwright's own `webServer` because one test has to
 * kill and restart it. Its pid and port are written to a file so a worker process — which does
 * not share memory with global setup — can do that.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A deployment this suite did not build.
 *
 * Set `TC_E2E_BASE_URL` and the suite stops building a world and runs against one that is
 * already there — which is how a staging deployment is validated rather than described. It
 * creates its own accounts, its own campaign and its own fight, so it needs nothing seeded and
 * leaves nothing another run depends on.
 *
 * The one test that cannot run remotely is the backend restart: this process has no business
 * killing somebody else's server, and it says so rather than skipping quietly.
 */
export const REMOTE_BASE_URL = process.env.TC_E2E_BASE_URL?.trim().replace(/\/+$/, '') || null;

export const API_PORT = Number(process.env.TC_E2E_API_PORT ?? 8788);
export const APP_PORT = Number(process.env.TC_E2E_APP_PORT ?? 4174);
export const APP_URL = REMOTE_BASE_URL ?? `http://127.0.0.1:${APP_PORT}`;
// A deployment serves both from one origin under `/api`; the local stack runs the API on its
// own port. Either way this is where a direct call goes.
export const API_URL = REMOTE_BASE_URL ? `${REMOTE_BASE_URL}/api` : `http://127.0.0.1:${API_PORT}`;

const STATE_FILE = join(import.meta.dirname, '.stack.json');

/** The database this suite is allowed to destroy. Never the developer's. */
export function e2eDatabaseUrl(): string {
  const explicit = process.env.TC_E2E_DATABASE_URL?.trim();
  if (explicit) return explicit;

  const base = process.env.DATABASE_URL?.trim();
  if (!base) {
    throw new Error(
      'Neither TC_E2E_DATABASE_URL nor DATABASE_URL is set. Run `docker compose up -d` and see .env.example.',
    );
  }

  const url = new URL(base);
  const name = url.pathname.replace(/^\//, '') || 'table_companion';
  if (name.endsWith('_e2e')) return base;
  url.pathname = `/${name}_e2e`;
  return url.toString();
}

interface StackState {
  apiPid: number;
  apiPort: number;
  databaseUrl: string;
}

const readState = (): StackState => JSON.parse(readFileSync(STATE_FILE, 'utf8')) as StackState;

/** Polls `/health` until the API answers, or gives up with the reason it never did. */
export async function waitForApi(port = API_PORT, timeoutMs = 30_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  let last = 'it was never reached';
  while (Date.now() < until) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
      last = `it answered ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((done) => setTimeout(done, 150));
  }
  throw new Error(`The API on port ${port} never became healthy: ${last}`);
}

function spawnApi(databaseUrl: string, port: number): ChildProcess {
  const child = spawn(process.execPath, [join(import.meta.dirname, '..', 'server', 'main.ts')], {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      PORT: String(port),
      NODE_ENV: 'test',
      // One address is many people here: every browser context, every API call and every
      // sign-up in the suite comes from 127.0.0.1. That is the same shape as a company
      // behind one NAT, which is why the knob exists in the product rather than only here.
      TC_RATE_LIMIT_SCALE: process.env.TC_RATE_LIMIT_SCALE ?? '50',
      // Logs are the fourth place TC-P08 checks for a leak, so they are captured rather
      // than silenced. `logs.ts` collects them.
      TC_LOG_LEVEL: 'info',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  const capture = (chunk: Buffer) => appendLog(chunk.toString('utf8'));
  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);
  return child;
}

/* ── The server's own log, kept so a test can read it ───────────────────────── */

const LOG_FILE = join(import.meta.dirname, '.server.log');

function appendLog(text: string): void {
  try {
    const existing = (() => {
      try {
        return readFileSync(LOG_FILE, 'utf8');
      } catch {
        return '';
      }
    })();
    writeFileSync(LOG_FILE, existing + text, 'utf8');
  } catch {
    // A log that cannot be written is not a reason to fail a run; the test that reads it
    // asserts on what is there and would fail on its own if nothing was.
  }
}

/** Everything the API has logged this run. */
export function serverLog(): string {
  try {
    return readFileSync(LOG_FILE, 'utf8');
  } catch {
    return '';
  }
}

export function clearServerLog(): void {
  try {
    writeFileSync(LOG_FILE, '', 'utf8');
  } catch {
    /* see appendLog */
  }
}

/* ── Lifecycle ──────────────────────────────────────────────────────────────── */

let api: ChildProcess | null = null;

/** True when something is already answering on the port. */
async function portInUse(port: number): Promise<boolean> {
  try {
    await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(1000),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Clears an API left behind by a run that was interrupted.
 *
 * Without this the suite silently tests the *previous* run's server: `waitForApi` sees a
 * healthy port, the new process fails to bind and dies, and every failure after that is a
 * mystery — a stale rate-limit window, a connection to a database that has since been
 * dropped, a log file nothing is writing to. It was the root cause of two of the flakes this
 * suite hit while it was being written, which is why it is handled rather than documented.
 */
async function clearPort(port: number): Promise<void> {
  if (!(await portInUse(port))) return;

  try {
    const stale = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as StackState;
    if (stale.apiPid) process.kill(stale.apiPid, 'SIGTERM');
  } catch {
    // No state file, or the pid is already gone. Either way the check below decides.
  }

  const until = Date.now() + 10_000;
  while (Date.now() < until) {
    if (!(await portInUse(port))) return;
    await new Promise((done) => setTimeout(done, 200));
  }

  throw new Error(
    `Port ${port} is still in use and this suite could not free it. Something else is ` +
      `listening there — stop it, or set TC_E2E_API_PORT to a free port.`,
  );
}

export async function startStack(): Promise<StackState | null> {
  // Against a deployment there is nothing to start, nothing to migrate and nothing to reset.
  // Waiting for it to be healthy is the whole of the setup.
  if (REMOTE_BASE_URL) {
    const until = Date.now() + 60_000;
    while (Date.now() < until) {
      const answer = await fetch(`${REMOTE_BASE_URL}/health`).catch(() => null);
      if (answer?.ok) return null;
      await new Promise((done) => setTimeout(done, 500));
    }
    throw new Error(`${REMOTE_BASE_URL} never became healthy.`);
  }

  const databaseUrl = e2eDatabaseUrl();
  clearServerLog();
  await clearPort(API_PORT);

  api = spawnApi(databaseUrl, API_PORT);

  // A process that dies on startup — a bad port, a bad URL — must say so rather than leave
  // `waitForApi` to time out after thirty seconds with nothing to go on.
  api.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      process.stderr.write(`[e2e] the API exited with code ${code}\n${serverLog().slice(-2000)}\n`);
    }
  });

  await waitForApi();

  const state: StackState = { apiPid: api.pid ?? 0, apiPort: API_PORT, databaseUrl };
  writeFileSync(STATE_FILE, JSON.stringify(state), 'utf8');
  return state;
}

export async function stopStack(): Promise<void> {
  if (REMOTE_BASE_URL) return;
  api?.kill();
  api = null;
  try {
    rmSync(STATE_FILE);
  } catch {
    /* already gone */
  }
}

/**
 * Kills the API and starts a new one, as a deployment restart would.
 *
 * Called from inside a test, in a worker process that never saw `startStack` — which is what
 * the state file is for. The database is untouched, which is the whole point: what survives a
 * restart is what was committed, and nothing that was only in the server's memory.
 */
export async function restartApi(): Promise<void> {
  if (REMOTE_BASE_URL) {
    throw new Error('This suite does not restart a deployment it did not start.');
  }
  const state = readState();

  try {
    process.kill(state.apiPid, 'SIGTERM');
  } catch {
    // Already gone. Starting a new one is still the right next step.
  }

  // Wait for the port to actually free up, or the new process races the old one for it.
  const until = Date.now() + 15_000;
  while (Date.now() < until) {
    try {
      await fetch(`http://127.0.0.1:${state.apiPort}/health`);
      await new Promise((done) => setTimeout(done, 100));
    } catch {
      break;
    }
  }

  const child = spawnApi(state.databaseUrl, state.apiPort);
  await waitForApi(state.apiPort);
  writeFileSync(STATE_FILE, JSON.stringify({ ...state, apiPid: child.pid ?? 0 }), 'utf8');
}
