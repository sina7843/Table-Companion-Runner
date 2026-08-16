/**
 * What happens when the world is less than perfect: a refresh, a backend restart, a dropped
 * event stream, and two clients acting at once.
 *
 * Every one of these is a thing that will happen at a real table on a real evening. What is
 * being asserted is not that they never happen but that none of them corrupts state or loses
 * work — the durable answer is always the database's, and every client converges on it.
 *
 * Serial, and it restarts the backend underneath itself, which is why the whole suite runs on
 * one worker. That is stated in `playwright.config.ts` rather than discovered here.
 */
import { expect, test, type Page } from '@playwright/test';
import { apiGet, open, reopen, signUp, type Client } from './helpers.ts';
import { API_URL, REMOTE_BASE_URL, restartApi, waitForApi } from './stack.ts';

test.describe.configure({ mode: 'serial' });

const POLL = { intervals: [100, 250, 500, 1000, 2000], timeout: 20_000 };

let dm: Client;
let player: Client;
let campaignId = '';
let combatId = '';
let characterName = '';

interface Fight {
  id: string;
  round: number;
  status: string;
  version: number;
  activeParticipantId: string | null;
  participants: { id: string; name: string; entityType: string; health: { current: number } }[];
}

const fightAs = async (page: Page): Promise<Fight> =>
  (await apiGet(page, `/combats/${combatId}`)).body as Fight;

/** Issues a command directly, re-reading the version once if somebody moved first. */
async function issue(page: Page, command: unknown, label: string): Promise<void> {
  let last = 'it never answered';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await fightAs(page);
    const answer = await page.request.post(`${API_URL}/combats/${combatId}/commands`, {
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      data: {
        commandId: `res-${label}-${Date.now()}-${attempt}`,
        expectedVersion: current.version,
        command,
      },
    });
    if (answer.status() === 200) return;
    last = `${answer.status()} ${await answer.text()}`;
    if (answer.status() !== 409) break;
  }
  expect(false, `${label} was refused: ${last}`).toBe(true);
}

/* ── A fight to be resilient about ──────────────────────────────────────────── */

test.beforeAll(async ({ browser }) => {
  dm = await signUp(browser, 'Resilient DM');
  player = await signUp(browser, 'Resilient Player', { viewport: { width: 390, height: 844 } });
  characterName = 'Bram Ostler';

  // Built through the API rather than the UI: the Golden Path already proves the screens do
  // this, and repeating it here would make every resilience failure a question about a form.
  const campaign = (
    await dm.page.request.post(`${API_URL}/campaigns`, {
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      data: { name: 'Restart Ridge', systemId: 'dnd5e-2024', dmUserId: 'ignored' },
    })
  ).json() as unknown as Promise<{ id: string; inviteCode: string }>;
  const made = await campaign;
  campaignId = made.id;

  const joined = await player.page.request.post(
    `${API_URL}/invites/${encodeURIComponent(made.inviteCode)}/accept`,
    {
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      data: {},
    },
  );
  expect(joined.status()).toBe(200);

  // The player builds a character through the UI, because a draft that survives a restart is
  // one of the things under test and it has to be a real draft.
  await open(player.page, `/builder?campaign=${campaignId}`);
  await expect(player.page.getByRole('button', { name: 'Continue' })).toBeVisible();

  const heading = () => player.page.locator('main h3').first();
  for (let guard = 0; guard < 20; guard += 1) {
    if (
      await player.page
        .getByRole('button', { name: /^Create/ })
        .isVisible()
        .catch(() => false)
    ) {
      break;
    }
    const before = await heading().innerText();
    const rows = player.page.locator('button.tc-row');
    for (let index = 0, count = Math.min(await rows.count(), 8); index < count; index += 1) {
      await rows.nth(index).click();
    }
    if (
      await player.page
        .getByText(/Unassigned:/)
        .isVisible()
        .catch(() => false)
    ) {
      const slots = player.page.locator('button[data-interactive="true"]');
      for (let index = 0, count = await slots.count(); index < count; index += 1) {
        await slots.nth(index).click();
      }
    }
    await player.page.getByRole('button', { name: 'Continue' }).click();
    await expect(heading()).not.toHaveText(before);
  }
  await player.page.locator('#character-name').fill(characterName);
  await player.page.getByRole('button', { name: /^Create/ }).click();

  // The character has to exist before an encounter can have a party, and a start with nobody
  // in it is refused — so this waits for the thing rather than assuming the click worked.
  await expect(async () => {
    const roster = (await apiGet(dm.page, `/campaigns/${campaignId}/characters`)).body as {
      name: string;
    }[];
    expect(roster.some((entry) => entry.name === characterName)).toBe(true);
  }).toPass(POLL);

  // An encounter with the party in it, and a fight from it.
  const encounter = (await (
    await dm.page.request.post(`${API_URL}/encounters`, {
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      data: { campaignId, name: 'The bridge' },
    })
  ).json()) as { id: string };

  const started = await dm.page.request.post(`${API_URL}/encounters/${encounter.id}/start`, {
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
    data: {},
  });
  expect(started.status(), await started.text()).toBe(200);
  combatId = ((await started.json()) as { id: string }).id;

  await issue(dm.page, { kind: 'initiative.roll', onlyMissing: false }, 'init');
  await issue(dm.page, { kind: 'combat.begin' }, 'begin');
});

test.afterAll(async () => {
  await dm?.close();
  await player?.close();
});

/* ── Refresh ────────────────────────────────────────────────────────────────── */

test('a refresh returns the same fight, not a reconstruction of it', async () => {
  await open(dm.page, `/dm/combat/${combatId}`);
  const before = await fightAs(dm.page);

  await issue(dm.page, { kind: 'turn.next' }, 'turn');
  const moved = await fightAs(dm.page);
  expect(moved.version).toBeGreaterThan(before.version);

  await reopen(dm.page);
  await expect(dm.page.getByText(/Round/i).first()).toBeVisible();

  const after = await fightAs(dm.page);
  expect(after.version).toBe(moved.version);
  expect(after.activeParticipantId).toBe(moved.activeParticipantId);
  expect(after.round).toBe(moved.round);
});

test('a draft survives a refresh, because it was never only in the tab', async () => {
  // Autosave writes to the server, so "recovery" is a read rather than a restore. The
  // character built above is the evidence: it exists for the account, not for the browser.
  const me = (await apiGet(player.page, '/me')).body as { id: string };
  const mine = (await apiGet(player.page, `/users/${me.id}/characters`)).body as {
    name: string;
  }[];
  expect(mine.some((entry) => entry.name === characterName)).toBe(true);

  await open(player.page, '/play/characters');
  await expect(player.page.getByText(characterName).first()).toBeVisible();
});

/* ── Backend restart ────────────────────────────────────────────────────────── */

test('a backend restart loses nothing that was committed', async () => {
  // Restarting a deployment this suite did not start is not its business. Skipped by name so
  // a staging run says which coverage it did not have rather than appearing complete.
  test.skip(REMOTE_BASE_URL !== null, 'the suite does not restart a deployment it did not start');

  const before = await fightAs(dm.page);
  await issue(
    dm.page,
    { kind: 'health.damage', participantId: before.participants[0]!.id, amount: 3 },
    'dmg',
  );
  const committed = await fightAs(dm.page);

  // The process goes away entirely — not a reload, a restart. Anything the server was holding
  // in memory is gone with it; anything it committed is in PostgreSQL.
  await restartApi();
  await waitForApi();

  // The API answers again, but the page reaches it through a proxy that was holding pooled
  // connections to a process which no longer exists. Those sockets fail once and are replaced
  // — which is what happens behind any reverse proxy when a backend restarts, and what a
  // browser would see. Waiting for the whole path to recover is part of the test, not around
  // it: "the restart lost nothing" is only true once somebody can ask again.
  await expect(async () => {
    const through = await dm.page.request.get('/api/health');
    expect(through.status()).toBe(200);
  }).toPass(POLL);

  const after = await fightAs(dm.page);
  expect(after.version).toBe(committed.version);
  expect(after.round).toBe(committed.round);
  expect(after.activeParticipantId).toBe(committed.activeParticipantId);
  expect(after.participants.map((entry) => entry.health.current)).toEqual(
    committed.participants.map((entry) => entry.health.current),
  );

  // And the session outlives the process too, because it is a row rather than a memory map.
  const me = await apiGet(dm.page, '/me');
  expect(me.status, 'the session survived the restart').toBe(200);
});

test('both clients recover on their own after the restart', async () => {
  test.skip(REMOTE_BASE_URL !== null, 'follows the restart above');

  // Neither page is reloaded by the test. The event stream reconnects, the screens re-read,
  // and both converge on what the database says — which is the whole point of the design.
  await expect(async () => {
    const mine = await fightAs(dm.page);
    const theirs = await fightAs(player.page);
    expect(theirs.version).toBe(mine.version);
    expect(theirs.round).toBe(mine.round);
  }).toPass(POLL);

  // A command issued after the restart still lands, which means the client picked up the
  // authoritative version rather than the one it held before the process died.
  await issue(dm.page, { kind: 'turn.next' }, 'after-restart');
});

/* ── The event stream ───────────────────────────────────────────────────────── */

test('a dropped stream reconnects and the screen catches up', async () => {
  await open(player.page, '/play/combat');
  await expect(player.page.getByText(characterName).first()).toBeVisible();

  // Offline: the browser drops the stream the way a phone leaving a building does.
  await player.page.context().setOffline(true);

  // While it is away, the fight moves on.
  const before = await fightAs(dm.page);
  await issue(dm.page, { kind: 'turn.next' }, 'while-offline');
  await issue(dm.page, { kind: 'turn.next' }, 'while-offline-2');
  const moved = await fightAs(dm.page);
  expect(moved.version).toBeGreaterThan(before.version);

  // Back: the stream reconnects on its own and the screen re-reads. No reload here — a player
  // who walked back to the table does not refresh their phone.
  await player.page.context().setOffline(false);

  await expect(async () => {
    const theirs = await fightAs(player.page);
    expect(theirs.version).toBe(moved.version);
    expect(theirs.activeParticipantId).toBe(moved.activeParticipantId);
  }).toPass(POLL);
});

test('a client that missed more than the replay window is told to re-read', async () => {
  // The stream carries a bounded replay window on purpose. Past it the honest answer is "you
  // are behind, read again" rather than a reconstruction the server cannot vouch for. What is
  // asserted is the outcome: whatever route it took, the client ends on the server's state.
  await player.page.context().setOffline(true);

  for (let index = 0; index < 6; index += 1) {
    await issue(dm.page, { kind: 'turn.next' }, `gap-${index}`);
  }
  const moved = await fightAs(dm.page);

  await player.page.context().setOffline(false);

  await expect(async () => {
    const theirs = await fightAs(player.page);
    expect(theirs.version).toBe(moved.version);
  }).toPass(POLL);
});

/* ── Two clients, one version ───────────────────────────────────────────────── */

test('two commands built on the same version cannot both win', async () => {
  const shared = await fightAs(dm.page);
  const target = shared.participants[0]!;

  const post = (amount: number, id: string) =>
    dm.page.request.post(`${API_URL}/combats/${combatId}/commands`, {
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      data: {
        commandId: id,
        expectedVersion: shared.version,
        command: { kind: 'health.damage', participantId: target.id, amount },
      },
    });

  const [first, second] = await Promise.all([
    post(2, `race-a-${Date.now()}`),
    post(7, `race-b-${Date.now()}`),
  ]);

  const statuses = [first.status(), second.status()].sort((a, b) => a - b);
  expect(statuses, 'one lands and one is told to re-read').toEqual([200, 409]);

  // The refused one is refused *deterministically*: nothing partial was written, and the
  // fight moved by exactly one command.
  const after = await fightAs(dm.page);
  expect(after.version).toBe(shared.version + 1);
});

test('a stale command from a client that looked away is refused, and recovers', async () => {
  const stale = await fightAs(dm.page);

  // Somebody else moves first.
  await issue(player.page, { kind: 'turn.next' }, 'player-turn').catch(() => undefined);
  await issue(dm.page, { kind: 'turn.next' }, 'dm-turn');

  const refused = await dm.page.request.post(`${API_URL}/combats/${combatId}/commands`, {
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
    data: {
      commandId: `stale-${Date.now()}`,
      expectedVersion: stale.version,
      command: { kind: 'turn.next' },
    },
  });
  expect(refused.status()).toBe(409);
  expect(((await refused.json()) as { error: { code: string } }).error.code).toBe('conflict');

  // The recovery is a re-read and the same command again — which is exactly what the screen
  // does, and it works.
  await issue(dm.page, { kind: 'turn.next' }, 'recovered');
});

/* ── The session ────────────────────────────────────────────────────────────── */

test('a signed-out browser does not hammer the server', async ({ browser }) => {
  // TC-P07's expiry signal re-reads the identity when a call comes back `unauthenticated`.
  // The re-read is itself such a call, so without a guard a signed-out visitor's browser asks
  // `/me` forever — six hundred times in fifteen seconds, which is how TC-P08 found it. This
  // is the regression test, and it can only exist here: nothing below a browser mounts the
  // provider that does it.
  const context = await browser.newContext();
  const page = await context.newPage();

  let identityReads = 0;
  page.on('request', (request) => {
    if (request.url().includes('/me')) identityReads += 1;
  });

  await open(page, '/');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await page.waitForTimeout(3000);

  expect(identityReads, `the signed-out page asked who it was ${identityReads} times`).toBeLessThan(
    5,
  );

  await context.close();
});
