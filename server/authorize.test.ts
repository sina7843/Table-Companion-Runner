/**
 * Negative authorization tests: what a caller must NOT be able to reach.
 *
 * Every test below is written from the attacker's side. It asks for something with a
 * perfectly well-formed request and a real session, and asserts the server refuses — because
 * "the screen does not offer it" is not a control, and the client is not a boundary.
 *
 * The five shapes the prompt names, and where each is covered:
 *
 * - horizontal privilege escalation — "another account's ..." tests
 * - direct-ID access               — "reading by id" tests
 * - DM-only actions                — the encounter and combat-lifecycle tests
 * - character privacy              — the redaction tests
 * - secret rolls                   — the roll log tests
 *
 * These run against the store, one layer below HTTP, so a route added later that forgets a
 * check is still refused: `createAuthorizedRepositories` is the only `Repositories` a handler
 * is ever given. `auth.test.ts` covers the layer above — sessions, cookies and CSRF.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase, type Database } from './db.ts';
import { migrate } from './migrate.ts';
import { seed } from './seed.ts';
import { createPostgresRepositories, StoreError } from './store.ts';
import { createAuthorizedRepositories } from './authorize.ts';
import { id, type Campaign, type Character, type Roll, type UserId } from '../src/domain/types.ts';
import type { CombatCommand } from '../src/domain/combat/commands.ts';

/** Unique command ids without a clock, so a retry in a test is deliberate rather than luck. */
let commandCounter = 0;
const counter = () => (commandCounter += 1);
import type { Repositories } from '../src/domain/data/repositories.ts';

const DATABASE_URL = process.env.DATABASE_URL?.trim();
const skip = DATABASE_URL
  ? false
  : 'DATABASE_URL is not set. Run `docker compose up -d` and see .env.example.';

const TEST_SCHEMA = 'tc_test_authz';

let db: Database;
/** The seeded demo world's DM. */
let dm: UserId;
/** A player in the same campaign, with a character of their own. */
let player: UserId;
/** Signed in, and in none of the DM's campaigns. */
let outsider: UserId;
let campaign: Campaign;
let playerCharacter: Character;

/** The repositories one account sees. Every rule under test lives inside this call. */
const as = (userId: UserId): Repositories =>
  createAuthorizedRepositories(createPostgresRepositories(db, { currentUserId: userId }), {
    userId,
  });

/** Asserts a call was refused, and with which status. */
async function refused(run: () => Promise<unknown>, status = 403): Promise<StoreError> {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof StoreError, `expected a StoreError, got ${String(error)}`);
    assert.equal(error.status, status);
    return error;
  }
  return assert.fail('that call should have been refused');
}

before(async () => {
  if (!DATABASE_URL) return;

  const root = createDatabase(DATABASE_URL);
  try {
    await root.query(`drop schema if exists ${TEST_SCHEMA} cascade`);
    await root.query(`create schema ${TEST_SCHEMA}`);
  } finally {
    await root.close();
  }

  db = createDatabase(DATABASE_URL, { schema: TEST_SCHEMA });
  await migrate(db);
  await seed(db);

  // Everything is discovered from the seeded world rather than hard-coded, so a change to
  // the fixtures cannot quietly turn one of these tests into a tautology.
  const [dmRow] = await db.query<{ dm_user_id: string }>(
    `select dm_user_id from campaigns c
      where exists (select 1 from characters ch where ch.campaign_id = c.id
                     and ch.owner_user_id <> c.dm_user_id)
      limit 1`,
  );
  assert.ok(dmRow, 'the seeded world has a campaign with a player-owned character');
  dm = id<'User'>(dmRow.dm_user_id);

  const campaigns = await as(dm).campaigns.listForUser(dm);
  const found = campaigns.find((entry) => entry.members.some((member) => member.role === 'player'));
  assert.ok(found, 'the seeded world has a campaign with a player in it');
  campaign = found;

  const roster = await as(dm).characters.listForCampaign(campaign.id);
  const mine = roster.find((character) => character.ownerUserId !== dm);
  assert.ok(mine, 'that campaign has a character somebody other than the DM owns');
  playerCharacter = mine;
  player = mine.ownerUserId;

  outsider = id<'User'>('u-outsider');
  await db.query(
    `insert into users (id, display_name) values ($1, 'A Stranger') on conflict (id) do nothing`,
    [outsider],
  );
});

after(async () => {
  await db?.close();
});

/* ── Horizontal privilege escalation ────────────────────────────────────────── */

test("a signed-in account cannot read another account's lists", { skip }, async () => {
  const stranger = as(outsider);
  await refused(() => stranger.campaigns.listForUser(dm));
  await refused(() => stranger.characters.listForOwner(player));
  await refused(() => stranger.characters.listUnattached(player));
  await refused(() => stranger.drafts.listForOwner(dm));
  await refused(() => stranger.recents.listForUser(dm));
  await refused(() => stranger.activity.listForUser(dm));
  await refused(() => stranger.combats.liveForUser(dm));
});

test(
  'a player cannot read the DM lists either — the rule is the account, not the role',
  { skip },
  async () => {
    await refused(() => as(player).campaigns.listForUser(dm));
    await refused(() => as(player).recents.listForUser(dm));
  },
);

test('a forged owner on a write is replaced, not honoured', { skip }, async () => {
  const theirs = as(player);

  // Claiming to be the DM while creating a campaign makes you the DM of your own campaign.
  const created = await theirs.campaigns.create({
    name: 'A Player Campaign',
    systemId: campaign.systemId,
    dmUserId: dm,
  });
  assert.equal(created.dmUserId, player);

  const draft = await theirs.drafts.create({
    systemId: campaign.systemId,
    ownerUserId: dm,
    name: 'Not the DM',
  });
  assert.equal(draft.ownerUserId, player);
});

/* ── Direct-ID access ───────────────────────────────────────────────────────── */

test('an outsider reading by id learns nothing, not even that it exists', { skip }, async () => {
  const stranger = as(outsider);
  assert.equal(await stranger.campaigns.byId(campaign.id), null);
  assert.equal(await stranger.characters.byId(playerCharacter.id), null);
  assert.equal(await stranger.users.byId(dm), null);

  const encounters = await as(dm).encounters.listForCampaign(campaign.id);
  const encounter = encounters[0];
  assert.ok(encounter);
  assert.equal(await stranger.encounters.byId(encounter.id), null);
});

test(
  'the user directory is not public — you see who you share a table with',
  { skip },
  async () => {
    assert.deepEqual(await as(outsider).users.byIds([dm, player]), []);
    const known = await as(player).users.byIds([dm, player, outsider]);
    assert.deepEqual(known.map((user) => user.id).toSorted(), [dm, player].toSorted());
  },
);

test(
  'an outsider cannot attach their character to a campaign they are not in',
  { skip },
  async () => {
    await refused(() => as(outsider).characters.attachToCampaign(playerCharacter.id, campaign.id));
    // Nor can a member attach a character they do not own.
    await refused(() => as(dm).characters.attachToCampaign(playerCharacter.id, campaign.id));
  },
);

/* ── DM-only actions ────────────────────────────────────────────────────────── */

test('encounters are a DM surface end to end, notes and all', { skip }, async () => {
  const theirs = as(player);
  await refused(() => theirs.encounters.listForCampaign(campaign.id));
  await refused(() => theirs.encounters.create({ campaignId: campaign.id, name: 'Mine now' }));

  const [encounter] = await as(dm).encounters.listForCampaign(campaign.id);
  assert.ok(encounter);
  assert.equal(await theirs.encounters.byId(encounter.id), null);
  await refused(() => theirs.encounters.save({ ...encounter, notes: 'read by nobody' }));
  await refused(() => theirs.encounters.duplicate(encounter.id));
  await refused(() => theirs.encounters.remove(encounter.id));

  // And the DM-only setup notes never reach a player, because the whole record never does.
  const dmCopy = await as(dm).encounters.byId(encounter.id);
  assert.equal(dmCopy?.id, encounter.id);
});

test('only the DM starts a fight', { skip }, async () => {
  const [encounter] = await as(dm).encounters.listForCampaign(campaign.id);
  assert.ok(encounter);
  await refused(() => as(player).combats.startFromTemplate(encounter.id));
  await refused(() => as(outsider).combats.startFromTemplate(encounter.id));
});

test(
  'homebrew belongs to whoever made it, and nobody else can see or edit it',
  { skip },
  async () => {
    const [library] = await as(dm).monsters.list({ origin: 'library', limit: 1 });
    assert.ok(library);

    const clone = await as(dm).monsters.cloneFrom(library.id, dm, 'Marta');
    assert.equal(clone.ownerUserId, dm);

    const theirs = as(player);
    assert.equal(await theirs.monsters.byId(clone.id), null);
    assert.equal(
      (await theirs.monsters.list({ origin: 'homebrew' })).some((m) => m.id === clone.id),
      false,
    );
    await refused(() => theirs.monsters.save({ ...clone, name: 'Mine now' }));
    await refused(() => theirs.monsters.remove(clone.id));

    // A clone made by a player is theirs whatever the request claims.
    const theirClone = await theirs.monsters.cloneFrom(library.id, dm, 'Not the DM');
    assert.equal(theirClone.ownerUserId, player);

    await as(dm).monsters.remove(clone.id);
    await theirs.monsters.remove(theirClone.id);
  },
);

/* ── Character privacy ──────────────────────────────────────────────────────── */

test('a hidden section is absent from the payload, not hidden in the UI', { skip }, async () => {
  const owner = as(player);
  const full = await owner.characters.byId(playerCharacter.id);
  assert.ok(full);

  // The owner hides their inventory from the party.
  await db.query(
    `update characters set section_visibility = section_visibility || '{"inventory":"private"}'::jsonb
      where id = $1`,
    [playerCharacter.id],
  );

  // A second player in the same campaign asks for the sheet directly.
  const otherPlayer = id<'User'>('u-other-player');
  await db.query(
    `insert into users (id, display_name) values ($1, 'Another Player') on conflict (id) do nothing`,
    [otherPlayer],
  );
  await db.query(
    `insert into campaign_members (campaign_id, user_id, role) values ($1,$2,'player')
     on conflict (campaign_id, user_id) do nothing`,
    [campaign.id, otherPlayer],
  );

  const seen = await as(otherPlayer).characters.byId(playerCharacter.id);
  assert.ok(seen, 'a party-mate is visible at all');
  assert.deepEqual(seen.systemData, {}, 'the ruleset payload behind the hidden section is gone');
  assert.deepEqual(seen.resources, []);
  assert.equal(seen.draft, undefined);
  // What the design marks always-shared survives.
  assert.equal(seen.name, playerCharacter.name);
  assert.deepEqual(seen.health, full.health);

  // The owner and the DM are unaffected.
  const mine = await owner.characters.byId(playerCharacter.id);
  assert.notDeepEqual(mine?.systemData, {});
  const dmView = await as(dm).characters.byId(playerCharacter.id);
  assert.notDeepEqual(dmView?.systemData, {});

  // And the roster read is redacted the same way — one rule, not two.
  const roster = await as(otherPlayer).characters.listForCampaign(campaign.id);
  const row = roster.find((entry) => entry.id === playerCharacter.id);
  assert.deepEqual(row?.systemData, {});

  await db.query(
    `update characters set section_visibility = section_visibility - 'inventory' where id = $1`,
    [playerCharacter.id],
  );
});

/* ── Secret rolls and hidden creatures ──────────────────────────────────────── */

test('a secret roll and an unrevealed creature never leave the server', { skip }, async () => {
  const [encounter] = await as(dm).encounters.listForCampaign(campaign.id);
  assert.ok(encounter);
  const [creature] = await as(dm).monsters.list({ origin: 'library', limit: 1 });
  assert.ok(creature);

  const template = await as(dm).encounters.create({ campaignId: campaign.id, name: 'Ambush' });
  const prepared = await as(dm).encounters.save({
    ...template,
    entries: [{ id: 'e1', monsterId: creature.id, count: 1, hidden: true }],
  });
  const fight = await as(dm).combats.startFromTemplate(prepared.id);

  const dmView = await as(dm).combats.byId(fight.id);
  const playerView = await as(player).combats.byId(fight.id);
  assert.ok(dmView && playerView);
  assert.ok(
    dmView.participants.some((entry) => entry.entityType === 'monster'),
    'the DM sees the ambusher',
  );
  assert.equal(
    playerView.participants.some((entry) => entry.entityType === 'monster'),
    false,
    'the player receives no row for it at all — not a dimmed one, none',
  );
  assert.equal(await as(outsider).combats.byId(fight.id), null);

  const secret: Roll = {
    id: id<'Roll'>('r-secret'),
    combatId: fight.id,
    actor: 'DM',
    title: 'Stealth',
    expression: '1d20 +6',
    mode: 'normal',
    dice: [{ sides: 20, value: 18 }],
    modifier: 6,
    total: 24,
    outcome: 'normal',
    visibility: 'dm-only',
    at: new Date().toISOString(),
  };
  await as(dm).rolls.record(secret);

  const dmLog = await as(dm).rolls.listForCombat(fight.id);
  const playerLog = await as(player).rolls.listForCombat(fight.id);
  assert.ok(dmLog.some((roll) => roll.title === 'Stealth'));
  assert.equal(
    playerLog.some((roll) => roll.title === 'Stealth'),
    false,
  );
  assert.equal(
    playerLog.some((roll) => roll.visibility === 'dm-only'),
    false,
  );

  // A player claiming to roll in secret is recorded in the open: rolling secretly is a DM
  // privilege the design gives them, and a device does not get to grant itself one.
  const theirs = await as(player).rolls.record({ ...secret, id: id<'Roll'>('r-player-secret') });
  assert.equal(theirs.visibility, 'party');
  assert.ok((await as(player).rolls.listForCombat(fight.id)).some((r) => r.id === theirs.id));

  await refused(() => as(outsider).rolls.record({ ...secret, id: id<'Roll'>('r-outsider') }), 403);
});

/* ── Combat writes ──────────────────────────────────────────────────────────── */

test('a player may only issue the commands that are theirs to issue', { skip }, async () => {
  const [creature] = await as(dm).monsters.list({ origin: 'library', limit: 1 });
  assert.ok(creature);
  const template = await as(dm).encounters.create({ campaignId: campaign.id, name: 'Skirmish' });
  const prepared = await as(dm).encounters.save({
    ...template,
    entries: [{ id: 'e1', monsterId: creature.id, count: 2 }],
  });
  const fight = await as(dm).combats.startFromTemplate(prepared.id);

  const mine = fight.participants.find(
    (entry) => entry.source.kind === 'character' && entry.source.characterId === playerCharacter.id,
  );
  assert.ok(mine, 'the player is in this fight');

  // The DM starts it and hands the turn to the player's own combatant.
  let version = fight.version ?? 0;
  const asDm = async (command: CombatCommand) => {
    const outcome = await as(dm).combats.command({
      combatId: fight.id,
      commandId: `dm-${counter()}`,
      expectedVersion: version,
      command,
    });
    version = outcome.combat.version ?? version + 1;
    return outcome;
  };

  await asDm({ kind: 'combat.begin' });
  await asDm({ kind: 'turn.jump', participantId: mine.id });

  const theirs = as(player);
  const seen = await theirs.combats.byId(fight.id);
  assert.ok(seen);
  const at = seen.version ?? 0;

  const asPlayer = (command: CombatCommand) =>
    theirs.combats.command({
      combatId: fight.id,
      commandId: `player-${counter()}`,
      expectedVersion: at,
      command,
    });

  // Everything about the fight itself is the DM's.
  await refused(() => asPlayer({ kind: 'combat.end' }));
  await refused(() => asPlayer({ kind: 'turn.previous' }));
  await refused(() => asPlayer({ kind: 'turn.resort' }));
  await refused(() => asPlayer({ kind: 'participant.remove', participantIds: [mine.id] }));
  await refused(() => asPlayer({ kind: 'initiative.set', participantIds: [mine.id], value: 20 }));
  await refused(() => asPlayer({ kind: 'health.override', participantId: mine.id, current: 99 }));
  await refused(() =>
    asPlayer({ kind: 'state.override', participantId: mine.id, state: 'active' }),
  );
  await refused(() => asPlayer({ kind: 'undo', seq: 1 }));

  const otherCharacter = seen.participants.find(
    (entry) => entry.entityType === 'player' && entry.id !== mine.id,
  );
  if (otherCharacter) {
    // Another character's hit points and death saves are not a player's to move.
    await refused(() =>
      asPlayer({ kind: 'health.damage', participantId: otherCharacter.id, amount: 9 }),
    );
    await refused(() => asPlayer({ kind: 'deathSave.roll', participantId: otherCharacter.id }));
  }

  // What they may do: take damage on their own combatant, and hand on their own turn.
  const hurt = await asPlayer({ kind: 'health.damage', participantId: mine.id, amount: 3 });
  const wasAt = seen.participants.find((entry) => entry.id === mine.id)!.health.current;
  assert.equal(
    hurt.combat.participants.find((entry) => entry.id === mine.id)?.health.current,
    // Floored, because a track does not go below zero — which is exactly the arithmetic the
    // phone no longer does. It said "3"; what 3 means here was worked out from the stored track.
    Math.max(0, wasAt - 3),
    'the authority worked the number out; the phone only said how much',
  );

  const ended = await theirs.combats.command({
    combatId: fight.id,
    commandId: `player-${counter()}`,
    expectedVersion: hurt.combat.version ?? 0,
    command: { kind: 'turn.next' },
  });
  assert.notEqual(ended.combat.activeParticipantId, mine.id);

  // And a turn that is not theirs is refused, whatever their device thinks.
  await refused(() =>
    theirs.combats.command({
      combatId: fight.id,
      commandId: `player-${counter()}`,
      expectedVersion: ended.combat.version ?? 0,
      command: { kind: 'turn.next' },
    }),
  );

  // The fight the DM reads back still has everything the player never saw.
  const dmAfter = await as(dm).combats.byId(fight.id);
  assert.equal(dmAfter?.participants.length, fight.participants.length);
  assert.equal(dmAfter?.status, 'live');

  await refused(() =>
    as(outsider).combats.command({
      combatId: fight.id,
      commandId: `outsider-${counter()}`,
      expectedVersion: dmAfter?.version ?? 0,
      command: { kind: 'turn.next' },
    }),
  );
});

/* ── Invites ────────────────────────────────────────────────────────────────── */

test('an invite code joins the campaign it belongs to, once', { skip }, async () => {
  const joiner = id<'User'>('u-joiner');
  await db.query(
    `insert into users (id, display_name) values ($1, 'A Joiner') on conflict (id) do nothing`,
    [joiner],
  );

  const joined = await as(joiner).campaigns.acceptInvite(campaign.inviteCode.toLowerCase());
  assert.equal(joined.id, campaign.id);
  assert.ok(joined.members.some((member) => member.userId === joiner && member.role === 'player'));

  // Twice is not an error, and does not produce a second membership.
  const again = await as(joiner).campaigns.acceptInvite(campaign.inviteCode);
  assert.equal(again.members.filter((member) => member.userId === joiner).length, 1);

  // A wrong code says exactly what a revoked one says.
  const wrong = await refused(() => as(joiner).campaigns.acceptInvite('NOPE-0000'), 404);
  await db.query('update invites set revoked_at = now() where upper(code) = upper($1)', [
    campaign.inviteCode,
  ]);
  const revoked = await refused(
    () => as(outsider).campaigns.acceptInvite(campaign.inviteCode),
    404,
  );
  assert.equal(wrong.message, revoked.message);

  await db.query('update invites set revoked_at = null where upper(code) = upper($1)', [
    campaign.inviteCode,
  ]);
});
