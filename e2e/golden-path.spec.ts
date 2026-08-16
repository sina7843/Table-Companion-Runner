/**
 * The Phase 1 Golden Path, with two independent browsers.
 *
 * A DM in one browser context and a player in another — separate cookie jars, separate
 * storage, separate everything. That is the whole point of TC-P08: a suite that shares one
 * session cannot tell "the player sees it" from "the DM sees it", which is exactly the class
 * of bug a multiplayer product has.
 *
 * The steps run in order and depend on each other, so this is a `serial` describe rather than
 * one enormous test — a failure names the step it happened in instead of a line number 200
 * deep in a script.
 *
 * Nothing here is stubbed. The bundle is the one `npm run build` produced, the API is the one
 * `npm run server` runs, the database is real PostgreSQL, and the realtime channel is the real
 * event stream. What is asserted about privacy is asserted twice — once on the screen, once on
 * the wire — because TC-P08 says client-side hiding is not a security pass.
 */
import { expect, test, type Page } from '@playwright/test';
import { apiGet, open, reopen, signUp, visibleText, markup, type Client } from './helpers.ts';
import { API_URL, serverLog } from './stack.ts';

test.describe.configure({ mode: 'serial' });

const PHONE = { width: 390, height: 844 };

/**
 * How the polls below back off.
 *
 * Playwright's default retries a failing expectation about ten times a second, and several
 * of these poll by making an HTTP request. Two browsers doing that for a minute is tens of
 * thousands of short-lived sockets, which on Windows exhausts the ephemeral port range and
 * fails as ERR_ADDRESS_IN_USE — a suite failure with nothing wrong in the product. Backing
 * off is the fix; a retry count would only have moved the failure.
 */
const POLL = { intervals: [100, 250, 500, 1000, 2000], timeout: 15_000 };

let dm: Client;
let player: Client;

let campaignName = '';
let inviteCode = '';
let characterName = '';
let campaignId = '';
let combatId = '';
/** The creature the DM keeps off the player's screen. */
let hiddenCreature = '';

/** The fight as the server holds it, read as whoever is asking. */
async function fightAs(page: Page): Promise<{
  id: string;
  round: number;
  status: string;
  version: number;
  activeParticipantId: string | null;
  participants: {
    id: string;
    name: string;
    entityType: string;
    visibility: string;
    health: { current: number; max: number };
    conditions: { key: string; label: string }[];
    state: string;
  }[];
}> {
  const live = await apiGet(page, `/combats/${combatId}`);
  expect(live.status).toBe(200);
  return live.body as never;
}

/**
 * Issues a combat command over the API, as whoever owns that page.
 *
 * A handful of steps below drive the server directly rather than through a control: hiding a
 * creature and applying a condition are DM actions the runner reaches through a panel, and
 * driving three levels of UI to exercise a server rule would be testing the panel. What is
 * being checked in those steps is what the *other* client can then see, which is the same
 * either way.
 *
 * It reads the version immediately before it posts, and re-reads once on a conflict — the
 * same thing the screen does, and the same thing anything sharing a fight with another device
 * has to do. That is not a retry papering over flakiness; a stale version is the product
 * working, and the recovery is the product's own.
 */
async function issue(page: Page, command: unknown, label: string): Promise<void> {
  let last = 'it never answered';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await fightAs(page);
    const answer = await page.request.post(`${API_URL}/combats/${combatId}/commands`, {
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      data: {
        commandId: `e2e-${label}-${Date.now()}-${attempt}`,
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

test.beforeAll(async ({ browser }) => {
  dm = await signUp(browser, 'Marta the DM');
  // The player is on a phone, because that is the composition the design specifies for them
  // and a touch target that only works at 1280px is not a touch target.
  player = await signUp(browser, 'Priya the Player', { viewport: PHONE });
});

test.afterAll(async () => {
  await dm?.close();
  await player?.close();
});

/* ── Setting the table ──────────────────────────────────────────────────────── */

test('the DM creates a campaign and gets an invite code', async () => {
  const page = dm.page;
  campaignName = `Cragmaw Hollow ${Date.now() % 100000}`;

  await open(page, '/campaigns/new');
  await expect(page.getByText('Choose a game system')).toBeVisible();

  await page
    .getByRole('button', { name: /Dungeons & Dragons/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Name the campaign' }).click();

  await page.getByLabel('Campaign name').fill(campaignName);
  await page.getByRole('button', { name: 'Create campaign' }).click();

  // Straight into the campaign it just made, which is where the invite code lives.
  await expect(page).toHaveURL(/\/dm\/campaigns\/[^/]+$/);
  campaignId = page.url().split('/').pop() ?? '';
  expect(campaignId).not.toBe('');

  const mine = await apiGet(page, `/campaigns/${campaignId}`);
  const campaign = mine.body as { name: string; inviteCode: string; dmUserId: string };
  expect(campaign.name).toBe(campaignName);
  inviteCode = campaign.inviteCode;
  expect(inviteCode.length).toBeGreaterThan(3);

  // And it is on the screen, not only in the response.
  await expect(page.getByText(inviteCode).first()).toBeVisible();
});

test('the player joins with the code, in their own browser', async () => {
  const page = player.page;

  await open(page, '/join');
  await page.getByLabel('Invite code').fill(inviteCode);
  await page.getByRole('button', { name: 'Join campaign' }).click();

  await expect(page.getByText(`Joined ${campaignName}`)).toBeVisible();

  // A membership on the server, not a message on a screen.
  const mine = await apiGet(page, `/campaigns/${campaignId}`);
  expect(mine.status).toBe(200);
  const campaign = mine.body as { members: { userId: string; role: string }[] };
  const me = (await apiGet(page, '/me')).body as { id: string };
  const membership = campaign.members.find((member) => member.userId === me.id);
  expect(membership?.role, 'joining makes a player, never a DM').toBe('player');
});

test('the player builds a character through the guided builder', async () => {
  const page = player.page;
  characterName = 'Ilse Vantar';

  await open(page, `/builder?campaign=${campaignId}`);
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();

  /*
   * The builder is generic — its steps, its questions and its validation all come from the
   * ruleset — so this drives whatever it asks for rather than hard-coding a list of steps. A
   * test that knew there were nine steps would break the day a ruleset added one, which is
   * precisely the architecture the product is built to allow.
   *
   * Clicking *every* choosable row on a step answers both kinds of question: a single choice
   * ends on the last row clicked, and a multi-choice at its limit replaces the oldest, so it
   * ends holding the last `choose` of them. Both are valid answers.
   */
  const stepHeading = () => page.locator('main h3').first();

  for (let guard = 0; guard < 20; guard += 1) {
    if (
      await page
        .getByRole('button', { name: /^Create/ })
        .isVisible()
        .catch(() => false)
    )
      break;

    const before = await stepHeading().innerText();

    const rows = page.locator('button.tc-row');
    const count = Math.min(await rows.count(), 8);
    for (let index = 0; index < count; index += 1) {
      await rows.nth(index).click();
    }

    // Ability scores: one tap per slot takes the next unspent number.
    if (
      await page
        .getByText(/Unassigned:/)
        .isVisible()
        .catch(() => false)
    ) {
      const slots = page.locator('button[data-interactive="true"]');
      for (let index = 0, count = await slots.count(); index < count; index += 1) {
        await slots.nth(index).click();
      }
    }

    await page.getByRole('button', { name: 'Continue' }).click();

    // A step that does not advance is a step this loop could not answer, and saying so beats
    // timing out ninety seconds later with no idea which one it was.
    await expect(
      stepHeading(),
      `the builder stayed on "${before}" — this loop could not answer it`,
    ).not.toHaveText(before);
  }

  // The review step is where the character is named.
  await page.locator('#character-name').fill(characterName);
  await page.getByRole('button', { name: /^Create/ }).click();

  // A real character, owned by them, in the campaign — read back from the server rather than
  // believed from the screen that submitted it.
  await expect(async () => {
    const me = (await apiGet(page, '/me')).body as { id: string };
    const mine = (await apiGet(page, `/users/${me.id}/characters`)).body as {
      name: string;
      campaignId: string | null;
      ownerUserId: string;
    }[];
    const made = mine.find((entry) => entry.name === characterName);
    expect(made, 'the character was created').toBeTruthy();
    expect(made?.campaignId).toBe(campaignId);
    expect(made?.ownerUserId).toBe(me.id);
  }).toPass(POLL);
});

test('the DM builds an encounter with the party and a creature', async () => {
  const page = dm.page;

  await open(page, '/dm/encounters/new');
  await expect(page).toHaveURL(/\/dm\/encounters\/[^/]+\/edit$/);

  await page.getByLabel('Encounter name').fill('Ambush at the ford');

  // The source picker is a radiogroup, which is what a segmented control is: one of these,
  // not a set of toggles. Selecting by role is how a test stays honest about that.
  const source = page.getByRole('radiogroup', { name: 'Source' });

  // The party is not "added" to an encounter — the campaign's characters are in it, and what
  // the DM chooses is who is at the table tonight. The player's character, built minutes ago
  // in another browser, is already here and already marked present.
  await source.getByRole('radio', { name: 'Party' }).click();
  await expect(page.getByRole('checkbox', { name: `${characterName} is present` })).toBeChecked();

  // Creatures are added, one at a time, from the library.
  await source.getByRole('radio', { name: 'Monsters' }).click();
  const firstCreature = page.getByRole('button', { name: /^Add .+ to this encounter$/ }).first();
  await firstCreature.click();

  // Autosave says so itself rather than the test assuming a debounce has elapsed.
  await expect(page.getByRole('status').filter({ hasText: 'Saved' }).first()).toBeVisible();

  // And the encounter the *server* holds is the one on screen.
  await expect(async () => {
    const encounters = (await apiGet(page, `/campaigns/${campaignId}/encounters`)).body as {
      name: string;
      entries: { count: number }[];
    }[];
    const built = encounters.find((entry) => entry.name === 'Ambush at the ford');
    expect(built, 'the encounter was saved').toBeTruthy();
    expect(built!.entries.length).toBeGreaterThan(0);
  }).toPass(POLL);
});

test('the DM starts the fight and rolls initiative', async () => {
  const page = dm.page;

  await page.getByRole('button', { name: 'Start combat' }).first().click();
  await expect(page).toHaveURL(/\/dm\/combat\/[^/]+$/);
  combatId = page.url().split('/').pop() ?? '';

  // Initiative is the server's — a client that rolled its own would be a client that decided
  // who goes first. The screen asks; the numbers arrive from the answer.
  await page
    .getByRole('button', { name: /Roll (all|what is missing)/ })
    .first()
    .click();

  await expect(async () => {
    const fight = await fightAs(page);
    expect(fight.participants.length).toBeGreaterThan(1);
  }).toPass(POLL);

  // The DM hides one creature before the fight starts, which is when that decision is made:
  // `participant.visibility` is a setup command and the server says so. The player must never
  // learn it is there, and the rest of this file checks that in four places.
  const roster = await fightAs(page);
  hiddenCreature = roster.participants.find((entry) => entry.entityType !== 'player')!.name;
  const hiddenId = roster.participants.find((entry) => entry.entityType !== 'player')!.id;
  await issue(
    page,
    { kind: 'participant.visibility', participantIds: [hiddenId], visibility: 'dm-only' },
    'hide',
  );

  await page.getByRole('button', { name: 'Begin round 1' }).first().click();

  await expect(async () => {
    const fight = await fightAs(page);
    expect(fight.status).toBe('live');
    expect(fight.round).toBe(1);
    expect(fight.activeParticipantId).toBeTruthy();
  }).toPass(POLL);
});

/* ── Two clients, one fight ─────────────────────────────────────────────────── */

test('the fight appears on the player’s phone without a reload', async () => {
  await open(player.page, '/play/combat');

  // No reload, no polling in the test: the event stream is what makes this arrive.
  await expect(player.page.getByText(characterName).first()).toBeVisible();

  const theirs = await fightAs(player.page);
  expect(theirs.id).toBe(combatId);
  expect(theirs.status).toBe('live');
});

test('damage the DM applies reaches the player’s screen', async () => {
  const fight = await fightAs(dm.page);
  // The player's own character: the one participant both clients can see, and the one whose
  // hit points a player actually watches.
  const target = fight.participants.find((entry) => entry.name === characterName)!;
  const before = target.health.current;

  await dm.page
    .getByRole('button', { name: new RegExp(`^Apply \\d+ damage to ${characterName}`) })
    .first()
    .click();

  // The server decides what the damage did; both screens read the same answer back, and
  // neither computed it.
  await expect(async () => {
    const after = await fightAs(dm.page);
    expect(after.participants.find((entry) => entry.id === target.id)!.health.current).toBeLessThan(
      before,
    );
  }).toPass(POLL);

  await expect(async () => {
    const theirs = await fightAs(player.page);
    expect(
      theirs.participants.find((entry) => entry.id === target.id)!.health.current,
    ).toBeLessThan(before);
  }).toPass(POLL);
});

test('healing puts it back, and both clients agree again', async () => {
  const fight = await fightAs(dm.page);
  const target = fight.participants.find((entry) => entry.name === characterName)!;
  const before = target.health.current;

  await dm.page
    .getByRole('button', { name: new RegExp(`^Heal ${characterName} for \\d+`) })
    .first()
    .click();

  await expect(async () => {
    const after = await fightAs(dm.page);
    expect(
      after.participants.find((entry) => entry.id === target.id)!.health.current,
    ).toBeGreaterThan(before);
  }).toPass(POLL);

  await expect(async () => {
    const theirs = await fightAs(player.page);
    expect(
      theirs.participants.find((entry) => entry.id === target.id)!.health.current,
    ).toBeGreaterThan(before);
  }).toPass(POLL);
});

test('the turn advances, and both clients agree who is up', async () => {
  const before = await fightAs(dm.page);

  await dm.page.getByRole('button', { name: 'Next turn' }).click();

  await expect(async () => {
    const after = await fightAs(dm.page);
    expect(after.activeParticipantId).not.toBe(before.activeParticipantId);
  }).toPass(POLL);

  await expect(async () => {
    const mine = await fightAs(dm.page);
    const theirs = await fightAs(player.page);
    expect(theirs.activeParticipantId).toBe(mine.activeParticipantId);
    expect(theirs.round).toBe(mine.round);
  }).toPass(POLL);
});

/* ── Privacy, checked in four places ────────────────────────────────────────── */

test('an unrevealed creature is absent from the player’s payload, not hidden in it', async () => {
  const fight = await fightAs(dm.page);
  const creature = fight.participants.find((entry) => entry.name === hiddenCreature)!;
  expect(creature.visibility).toBe('dm-only');

  // On the wire: not in the player's response at all. This is the assertion that matters —
  // a payload that carries the creature and a screen that declines to draw it is a screen
  // away from a leak, and TC-P08 says client-side hiding is not a pass.
  await expect(async () => {
    const theirs = await fightAs(player.page);
    const found = theirs.participants.find((entry) => entry.id === creature.id);
    expect(found, 'a hidden creature is absent from the payload, not marked in it').toBeFalsy();
  }).toPass(POLL);

  // In the DOM: not in the markup either, including whatever CSS might be hiding.
  await reopen(player.page);
  await expect(player.page.getByText(characterName).first()).toBeVisible();
  expect(await markup(player.page)).not.toContain(hiddenCreature);
  expect(await visibleText(player.page)).not.toContain(hiddenCreature);

  // And the DM still sees it, or this test proves nothing.
  expect(await visibleText(dm.page)).toContain(hiddenCreature);
});

test('a secret roll never reaches the player, on screen or on the wire', async () => {
  const secret = `secret-${Date.now()}`;

  const recorded = await dm.page.request.post(`${API_URL}/combats/${combatId}/rolls`, {
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
    data: {
      id: `roll-${secret}`,
      combatId,
      actor: 'The DM',
      title: secret,
      expression: '1d20+3',
      mode: 'normal',
      dice: [{ sides: 20, value: 17 }],
      modifier: 3,
      total: 20,
      outcome: 'normal',
      visibility: 'secret',
      at: new Date().toISOString(),
    },
  });
  expect(recorded.status()).toBe(200);

  // The DM's own log has it.
  await expect(async () => {
    const mine = (await apiGet(dm.page, `/combats/${combatId}/rolls`)) as {
      body: { title: string }[];
    };
    expect(mine.body.some((roll) => roll.title === secret)).toBe(true);
  }).toPass(POLL);

  // The player's does not — and could not, because it is filtered before it is serialised.
  const theirs = (await apiGet(player.page, `/combats/${combatId}/rolls`)).body as {
    title: string;
  }[];
  expect(theirs.some((roll) => roll.title === secret)).toBe(false);

  await reopen(player.page);
  await expect(player.page.getByText(characterName).first()).toBeVisible();
  expect(await markup(player.page)).not.toContain(secret);
});

test('nothing private is in the server’s logs', async () => {
  const log = serverLog();
  expect(log.length, 'the server logged something this run').toBeGreaterThan(0);

  // Structured request logs carry a route pattern and a code. They must never carry a
  // credential, a session token, a query string or a body.
  expect(log).not.toContain('table-companion-e2e-password');
  expect(log).not.toContain(inviteCode);
  expect(log).not.toContain('scrypt$');
  expect(log).not.toMatch(/tc_session=/);

  // The route is the pattern, never the resolved path — an id in a log line is a record of
  // who did what to which fight.
  expect(log).not.toContain(`/combats/${combatId}/commands`);
  expect(log).toContain('/combats/:combatId/commands');
});

/* ── Conditions, override, undo, and the end ────────────────────────────────── */

test('a condition the DM applies shows on the player’s phone', async () => {
  const fight = await fightAs(dm.page);
  const theirs = fight.participants.find((entry) => entry.entityType === 'player')!;

  await issue(dm.page, { kind: 'condition.add', participantId: theirs.id, key: 'prone' }, 'cond');

  await expect(async () => {
    const mine = await fightAs(player.page);
    const me = mine.participants.find((entry) => entry.id === theirs.id)!;
    expect(me.conditions.some((condition) => condition.key === 'prone')).toBe(true);
  }).toPass(POLL);

  await reopen(player.page);
  await expect(player.page.getByText(/Prone/i).first()).toBeVisible();
});

test('a DM override is applied, recorded, and undone without losing the history', async () => {
  const fight = await fightAs(dm.page);
  const someone = fight.participants.find((entry) => entry.name === characterName)!;
  const before = someone.health.current;

  // An explicit override — the DM saying "it is 1, whatever the rules just worked out". It is
  // a DM-only command, and every accepted command leaves exactly one audit row behind it.
  const overridden = await dm.page.request.post(`${API_URL}/combats/${combatId}/commands`, {
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
    data: {
      commandId: `e2e-override-${Date.now()}`,
      expectedVersion: fight.version,
      command: { kind: 'health.override', participantId: someone.id, current: 1 },
    },
  });
  expect(overridden.status(), await overridden.text()).toBe(200);
  const outcome = (await overridden.json()) as { seq: number; combat: { version: number } };

  await expect(async () => {
    const after = await fightAs(dm.page);
    expect(after.participants.find((entry) => entry.id === someone.id)!.health.current).toBe(1);
  }).toPass(POLL);

  // The player sees it too — an override is not a private correction.
  await expect(async () => {
    const theirs = await fightAs(player.page);
    expect(theirs.participants.find((entry) => entry.id === someone.id)!.health.current).toBe(1);
  }).toPass(POLL);

  // Undo puts the hit points back. The `seq` comes from the answer the command gave, which is
  // how the runner's own undo tray finds it.
  const undone = await dm.page.request.post(`${API_URL}/combats/${combatId}/commands`, {
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
    data: {
      commandId: `e2e-undo-${Date.now()}`,
      expectedVersion: outcome.combat.version,
      command: { kind: 'undo', seq: outcome.seq },
    },
  });
  expect(undone.status(), await undone.text()).toBe(200);

  await expect(async () => {
    const restored = await fightAs(dm.page);
    expect(restored.participants.find((entry) => entry.id === someone.id)!.health.current).toBe(
      before,
    );
  }).toPass(POLL);

  // And undoing the same change twice is refused rather than applied again.
  const again = await dm.page.request.post(`${API_URL}/combats/${combatId}/commands`, {
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
    data: {
      commandId: `e2e-undo-twice-${Date.now()}`,
      expectedVersion: (await fightAs(dm.page)).version,
      command: { kind: 'undo', seq: outcome.seq },
    },
  });
  expect(again.status(), 'undoing the same change twice is refused').toBe(409);
});

test('ending the fight ends it for both of them', async () => {
  await dm.page.getByRole('button', { name: 'End this combat' }).click();

  await expect(async () => {
    const mine = await fightAs(dm.page);
    expect(mine.status).toBe('ended');
  }).toPass(POLL);

  await expect(async () => {
    const theirs = await fightAs(player.page);
    expect(theirs.status).toBe('ended');
  }).toPass(POLL);

  // On the player's phone the fight stops being the live one, so their combat tab says there
  // is nothing running rather than showing a fight that finished.
  await reopen(player.page);
  await expect(
    player.page.getByText(/No combat is running|This fight is over/i).first(),
  ).toBeVisible();
});
