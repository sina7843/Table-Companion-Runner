/**
 * Database integration tests.
 *
 * These need a real PostgreSQL, because the things worth checking here are the things an
 * in-memory double cannot have: a foreign key, a check constraint, a transaction that rolls
 * back, and a row that is still there when the process that wrote it has gone.
 *
 * They build the whole schema inside a `tc_test` schema of their own and never touch the
 * one a developer is working in. With `DATABASE_URL` unset every test below skips, so
 * `npm run test` stays green on a machine with no database — see `docker-compose.yml` for
 * the one this repository expects.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase, type Database } from './db.ts';
import { migrate } from './migrate.ts';
import { seed } from './seed.ts';
import { createPostgresRepositories, StoreError } from './store.ts';
import {
  id,
  type Character,
  type CombatInstance,
  type EncounterTemplateId,
  type Roll,
} from '../src/domain/types.ts';
import type { CombatCommand } from '../src/domain/combat/commands.ts';

/** Unique command ids without a clock, so a retry in a test is deliberate rather than luck. */
let commandCounter = 0;
const nextCommandId = () => (commandCounter += 1);
import type { Repositories } from '../src/domain/data/repositories.ts';

const DATABASE_URL = process.env.DATABASE_URL?.trim();
const skip = DATABASE_URL
  ? false
  : 'DATABASE_URL is not set. Run `docker compose up -d` and see .env.example.';

/** A namespace owned entirely by this file, so nothing here can reach a developer's data. */
const TEST_SCHEMA = 'tc_test';

/** The seeded demo world's DM, and the only fixture id these tests hard-code. */
const DM = id<'User'>('u-marta');

let db: Database;
let repos: Repositories;

before(async () => {
  if (!DATABASE_URL) return;

  // Dropping and rebuilding the test schema is what makes the run repeatable. It is the
  // only destructive statement in the repository, and it can only ever reach `tc_test`.
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
  repos = createPostgresRepositories(db, { currentUserId: DM });
});

after(async () => {
  await db?.close();
});

/* ── Migrations ─────────────────────────────────────────────────────────────── */

test('migrations record themselves and applying them again is a no-op', { skip }, async () => {
  const again = await migrate(db);
  assert.deepEqual(again.applied, [], 'a second run must not re-apply a migration');
  assert.ok(again.skipped.includes('001_initial.sql'));

  // One recorded row per file on disk — not a hard-coded count, which would only ever be
  // wrong once and then be edited to match rather than read.
  const [row] = await db.query<{ total: number }>(
    'select count(*)::int as total from schema_migrations',
  );
  assert.equal(row?.total, again.skipped.length);
});

test('every entity in the domain has a table behind it', { skip }, async () => {
  const rows = await db.query<{ table_name: string }>(
    'select table_name from information_schema.tables where table_schema = $1',
    [TEST_SCHEMA],
  );
  const tables = new Set(rows.map((row) => row.table_name));

  for (const expected of [
    'users',
    'campaigns',
    'campaign_members',
    'invites',
    'characters',
    'character_drafts',
    'monsters',
    'encounters',
    'combats',
    'combat_participants',
    'combat_events',
    'rolls',
    'sessions',
  ]) {
    assert.ok(tables.has(expected), `missing table: ${expected}`);
  }
});

/* ── Persistence across a restart ───────────────────────────────────────────── */

test('the seeded world is in the database, not in this process', { skip }, async () => {
  const seeded = await repos.campaigns.listForUser(DM);
  assert.ok(seeded.length > 0, 'the demo world has campaigns');

  // A second pool is a second set of connections. Nothing this file holds is involved in
  // answering it, so a row it can read is a row PostgreSQL has, not one we remembered.
  const reconnected = createDatabase(DATABASE_URL ?? '', { schema: TEST_SCHEMA });
  try {
    const afterRestart = createPostgresRepositories(reconnected, { currentUserId: DM });
    const campaigns = await afterRestart.campaigns.listForUser(DM);
    assert.deepEqual(
      campaigns.map((campaign) => campaign.id),
      seeded.map((campaign) => campaign.id),
    );

    const monsters = await afterRestart.monsters.count();
    assert.ok(monsters >= 50, 'the seeded creature library survived');
  } finally {
    await reconnected.close();
  }
});

test('a connection dropped underneath the pool is survivable, not fatal', { skip }, async () => {
  // Regression: a PostgreSQL restart used to take the API process down with it. `pg` reports
  // a dropped idle client as an `error` event on the pool, and an unhandled one is an
  // uncaught exception. Terminating our own backend reproduces exactly that.
  const reported: unknown[] = [];
  const fragile = createDatabase(DATABASE_URL ?? '', {
    schema: TEST_SCHEMA,
    onPoolError: (error) => reported.push(error),
  });

  try {
    const [pid] = await fragile.query<{ pid: number }>('select pg_backend_pid() as pid');
    assert.ok(pid);

    const executioner = createDatabase(DATABASE_URL ?? '');
    try {
      await executioner.query('select pg_terminate_backend($1)', [pid.pid]);
    } finally {
      await executioner.close();
    }

    // The event is asynchronous, so give it a turn or two to arrive.
    for (let attempt = 0; attempt < 50 && reported.length === 0; attempt += 1) {
      await new Promise((done) => setTimeout(done, 20));
    }
    assert.equal(reported.length, 1, 'the dropped connection was reported, not thrown');

    // And the pool is still usable: the next request opens a new connection.
    const [row] = await fragile.query<{ total: number }>(
      'select count(*)::int as total from users',
    );
    assert.ok((row?.total ?? 0) > 0);
  } finally {
    await fragile.close();
  }
});

/* ── Campaigns and ownership ────────────────────────────────────────────────── */

test(
  'creating a campaign gives it one DM, an invite code and an invite row',
  { skip },
  async () => {
    const campaign = await repos.campaigns.create({
      name: 'The Sunless Citadel',
      systemId: id<'GameSystem'>('dnd5e'),
      dmUserId: DM,
    });

    assert.equal(campaign.dmUserId, DM);
    assert.deepEqual(campaign.members, [{ userId: DM, role: 'dm' }]);
    assert.match(campaign.inviteCode, /^[A-Z]+-\d{4}$/);

    const invites = await db.query<{ campaign_id: string }>(
      'select campaign_id from invites where code = $1',
      [campaign.inviteCode],
    );
    assert.equal(invites[0]?.campaign_id, campaign.id);

    // And it reads back with its membership, rather than only existing in the write's return.
    const read = await repos.campaigns.byId(campaign.id);
    assert.equal(read?.name, 'The Sunless Citadel');
    assert.equal(read?.members.length, 1);
  },
);

test('attaching a character links it without transferring ownership', { skip }, async () => {
  const [campaign] = await repos.campaigns.listForUser(DM);
  assert.ok(campaign);

  const character = await makeCharacter({ name: 'Sarwyn Coalhand', ownerUserId: DM });
  assert.equal(character.campaignId, undefined);

  const attached = await repos.characters.attachToCampaign(character.id, campaign.id);
  assert.equal(attached.campaignId, campaign.id);
  assert.equal(attached.ownerUserId, DM, 'ownership does not move with the link');

  // The DM is already a member as the DM. Attaching must update that row, not add a second.
  const members = await db.query<{ user_id: string; role: string; character_id: string | null }>(
    'select user_id, role, character_id from campaign_members where campaign_id = $1 and user_id = $2',
    [campaign.id, DM],
  );
  assert.equal(members.length, 1);
  assert.equal(members[0]?.role, 'dm');
  assert.equal(members[0]?.character_id, character.id);
});

test('attaching a character that does not exist is refused, not invented', { skip }, async () => {
  const [campaign] = await repos.campaigns.listForUser(DM);
  assert.ok(campaign);
  await assert.rejects(
    () => repos.characters.attachToCampaign(id<'Character'>('ch-nobody'), campaign.id),
    (error: unknown) => error instanceof StoreError && error.status === 404,
  );
});

/* ── Monsters: the ingest boundary ──────────────────────────────────────────── */

test('a library creature cannot be edited, and survives being removed', { skip }, async () => {
  const [library] = await repos.monsters.list({ origin: 'library', limit: 1 });
  assert.ok(library);

  await assert.rejects(
    () => repos.monsters.save({ ...library, name: 'Rewritten by the DM' }),
    (error: unknown) =>
      error instanceof StoreError &&
      error.message === 'Library creatures cannot be edited. Clone it first.',
  );

  await repos.monsters.remove(library.id);
  const stillThere = await repos.monsters.byId(library.id);
  assert.equal(stillThere?.name, library.name, 'reference content is not a user record');
});

test('the database itself refuses to give a library creature an owner', { skip }, async () => {
  await assert.rejects(() =>
    db.query(
      `insert into monsters (id, system_id, name, subtitle, origin, owner_user_id,
         challenge_label, challenge_rank, source, health)
       values ('m-forged','dnd5e','Forged','x','library',$1,'CR 1',1,'x','{}'::jsonb)`,
      [DM],
    ),
  );
});

test('a write that claims to be library content comes back as homebrew', { skip }, async () => {
  const [library] = await repos.monsters.list({ origin: 'library', limit: 1 });
  assert.ok(library);

  const created = await repos.monsters.create({
    ...library,
    id: id<'Monster'>('m-claims-to-be-library'),
    name: 'Claims to be library',
    origin: 'library',
    ownerUserId: DM,
  });
  assert.equal(created.origin, 'homebrew');
});

test('a clone is a separate creature and cannot reach its source', { skip }, async () => {
  const [source] = await repos.monsters.list({ origin: 'library', limit: 1 });
  assert.ok(source);

  const clone = await repos.monsters.cloneFrom(source.id, DM, 'Marta');
  assert.notEqual(clone.id, source.id);
  assert.equal(clone.origin, 'homebrew');
  assert.equal(clone.clonedFrom, source.id);
  assert.equal(clone.source, 'Marta');
  assert.equal(clone.name, `${source.name} (copy)`);

  await repos.monsters.save({
    ...clone,
    name: 'Edited clone',
    health: { ...clone.health, max: 1 },
  });
  const original = await repos.monsters.byId(source.id);
  assert.equal(original?.name, source.name);
  assert.equal(original?.health.max, source.health.max);

  await repos.monsters.remove(clone.id);
  assert.equal(await repos.monsters.byId(clone.id), null);
});

test('monster filters compose the way the library screen assumes', { skip }, async () => {
  const all = await repos.monsters.count();

  const named = await repos.monsters.list({ search: 'dragon' });
  assert.ok(named.length > 0);
  assert.ok(
    named.every((monster) =>
      `${monster.name} ${monster.subtitle}`.toLowerCase().includes('dragon'),
    ),
  );

  const ranked = await repos.monsters.list({ challengeMin: 5, challengeMax: 10 });
  assert.ok(ranked.length > 0);
  assert.ok(ranked.every((monster) => monster.challengeRank >= 5 && monster.challengeRank <= 10));

  // Facet values are the ruleset's own strings, matched exactly — the core never
  // normalises a taxonomy it does not interpret.
  const dragons = await repos.monsters.list({ facets: { type: ['Dragon'] } });
  assert.ok(dragons.length > 0);
  assert.equal((await repos.monsters.list({ facets: { type: ['dragon'] } })).length, 0);

  // Values within a facet are OR-ed, so asking for two types must not return fewer than one.
  const dragonsOrUndead = await repos.monsters.list({ facets: { type: ['Dragon', 'Undead'] } });
  assert.ok(dragonsOrUndead.length > dragons.length);

  // Facets are AND-ed, so adding one narrows.
  const large = await repos.monsters.list({ facets: { type: ['Dragon'], size: ['Large'] } });
  assert.ok(large.length > 0 && large.length < dragons.length);

  const sorted = await repos.monsters.list({ sort: 'challenge-asc', limit: 5 });
  assert.equal(sorted.length, 5);
  for (let index = 1; index < sorted.length; index += 1) {
    assert.ok((sorted[index]?.challengeRank ?? 0) >= (sorted[index - 1]?.challengeRank ?? 0));
  }

  // A limit is paging, not filtering: the count behind it does not move.
  assert.equal(await repos.monsters.count({ limit: 5 }), all);
});

/* ── Encounters and combat ──────────────────────────────────────────────────── */

test('a duplicated encounter is independent and has not been run', { skip }, async () => {
  const campaign = await demoCampaign();
  const [source] = await repos.encounters.listForCampaign(campaign.id);
  assert.ok(source);

  const copy = await repos.encounters.duplicate(source.id);
  assert.notEqual(copy.id, source.id);
  assert.equal(copy.name, `${source.name} (copy)`);
  assert.equal(copy.lastRunAt, undefined, 'a copy has not been run, whatever the original did');
  assert.deepEqual(copy.entries, source.entries);

  await repos.encounters.save({ ...copy, name: 'Edited copy', entries: [] });
  const original = await repos.encounters.byId(source.id);
  assert.equal(original?.name, source.name);
  assert.deepEqual(original?.entries, source.entries);

  await repos.encounters.remove(copy.id);
  assert.equal(await repos.encounters.byId(copy.id), null);
});

test('starting a fight expands the roster and leaves the template alone', { skip }, async () => {
  const campaign = await demoCampaign();
  const roster = await repos.characters.listForCampaign(campaign.id);
  assert.ok(roster.length > 1, 'the demo campaign has a party to add');
  const [goblin] = await repos.monsters.list({ search: 'goblin', origin: 'library', limit: 1 });
  assert.ok(goblin);

  const template = await repos.encounters.create({ campaignId: campaign.id, name: 'Ambush' });
  const prepared = await repos.encounters.save({
    ...template,
    entries: [{ id: 'entry-1', monsterId: goblin.id, count: 3, hidden: true }],
    absentCharacterIds: roster[0] ? [roster[0].id] : [],
    notes: 'They wait in the trees.',
  });

  const combat = await repos.combats.startFromTemplate(prepared.id);
  assert.equal(combat.status, 'preparing');
  assert.equal(combat.round, 0);
  assert.equal(combat.activeParticipantId, null);
  assert.equal(combat.encounterTemplateId, prepared.id);

  const creatures = combat.participants.filter((entry) => entry.entityType === 'monster');
  assert.equal(creatures.length, 3, 'a count of three becomes three combatants');
  assert.deepEqual(
    creatures.map((entry) => entry.name),
    [`${goblin.name} #1`, `${goblin.name} #2`, `${goblin.name} #3`],
  );
  assert.ok(creatures.every((entry) => entry.groupKey === goblin.id));
  assert.ok(
    creatures.every((entry) => entry.visibility === 'private'),
    'a hidden entry starts hidden',
  );
  assert.ok(creatures.every((entry) => entry.health.current === entry.health.max));

  const players = combat.participants.filter((entry) => entry.entityType === 'player');
  assert.equal(players.length, Math.max(roster.length - 1, 0), 'the absent character sits it out');

  // The template records that it ran and changes in no other way.
  const template2 = await repos.encounters.byId(prepared.id);
  assert.ok(template2?.lastRunAt);
  assert.deepEqual({ ...template2, lastRunAt: undefined }, { ...prepared, lastRunAt: undefined });

  // Running it twice gives two independent fights.
  const second = await repos.combats.startFromTemplate(prepared.id);
  assert.notEqual(second.id, combat.id);
  assert.notEqual(second.participants[0]?.id, combat.participants[0]?.id);
});

test(
  'saving a fight rewrites its roster, records an event and never touches the template',
  { skip },
  async () => {
    const { combat, templateId } = await startAFight();
    const templateBefore = await repos.encounters.byId(templateId);

    const first = combat.participants[0];
    assert.ok(first);

    let version = combat.version ?? 0;
    const send = async (command: CombatCommand) => {
      const outcome = await repos.combats.command({
        combatId: combat.id,
        commandId: `store-${nextCommandId()}`,
        expectedVersion: version,
        command,
      });
      version = outcome.combat.version ?? version + 1;
      return outcome;
    };

    await send({ kind: 'initiative.set', participantIds: [first.id], value: 18 });
    await send({ kind: 'combat.begin' });
    const hurt = await send({ kind: 'health.damage', participantId: first.id, amount: 3 });

    const saved = hurt.combat;
    assert.equal(saved.status, 'live');
    assert.equal(saved.round, 1);
    assert.equal(saved.participants.length, combat.participants.length);
    assert.equal(saved.participants.find((entry) => entry.id === first.id)?.initiative, 18);

    // The number is the authority's arithmetic, not the caller's: the command said "3", and
    // what 3 damage does to that track is what came back.
    assert.equal(
      saved.participants.find((entry) => entry.id === first.id)?.health.current,
      first.health.current - 3,
    );

    // Order survives the round trip, which is what makes initiative order a stored fact.
    assert.equal(saved.participants.length, combat.participants.length);

    const events = await db.query<{ kind: string; seq: number; summary: string | null }>(
      'select kind, seq, summary from combat_events where combat_id = $1 order by seq',
      [combat.id],
    );
    assert.deepEqual(
      events.map((event) => event.kind),
      ['combat.started', 'initiative.set', 'combat.begin', 'health.damage'],
    );
    assert.deepEqual(
      events.map((event) => event.seq),
      [1, 2, 3, 4],
    );
    assert.match(events.at(-1)?.summary ?? '', /damage/);

    // The template is a note about what has been run and nothing more.
    assert.deepEqual(await repos.encounters.byId(templateId), templateBefore);

    // Dropping a participant removes its row rather than orphaning it. It is a DM command
    // before the fight begins, so this one runs on a fresh fight.
    const second = await startAFight();
    const dropped = second.combat.participants[0];
    assert.ok(dropped);
    await repos.combats.command({
      combatId: second.combat.id,
      commandId: `store-${nextCommandId()}`,
      expectedVersion: second.combat.version ?? 0,
      command: { kind: 'participant.remove', participantIds: [dropped.id] },
    });
    const [remaining] = await db.query<{ total: number }>(
      'select count(*)::int as total from combat_participants where combat_id = $1',
      [second.combat.id],
    );
    assert.equal(remaining?.total, second.combat.participants.length - 1);
  },
);

test('a command the state cannot accept changes nothing', { skip }, async () => {
  const { combat } = await startAFight();
  const untouched = await repos.combats.byId(combat.id);
  assert.ok(untouched);

  const [eventsBefore] = await db.query<{ total: number }>(
    'select count(*)::int as total from combat_events where combat_id = $1',
    [combat.id],
  );

  // A fight that has not begun has no turn to advance. The refusal is a conflict, and the
  // whole transaction — the fight, its participants and its history — is untouched by it.
  await assert.rejects(
    () =>
      repos.combats.command({
        combatId: combat.id,
        commandId: `store-${nextCommandId()}`,
        expectedVersion: combat.version ?? 0,
        command: { kind: 'turn.next' },
      }),
    (error: unknown) => error instanceof StoreError && error.status === 409,
  );

  const reread = await repos.combats.byId(combat.id);
  assert.deepEqual(reread, untouched, 'nothing of the refused command survived');

  const [eventsAfter] = await db.query<{ total: number }>(
    'select count(*)::int as total from combat_events where combat_id = $1',
    [combat.id],
  );
  assert.equal(eventsAfter?.total, eventsBefore?.total, 'no half-written history either');
});

/* ── Rolls ──────────────────────────────────────────────────────────────────── */

test('rolls are append-only, and a colliding client id is re-minted', { skip }, async () => {
  const { combat } = await startAFight();

  const roll: Roll = {
    id: id<'Roll'>('r-live-1'),
    combatId: combat.id,
    actor: 'Quill Featherwind',
    title: 'Rapier',
    expression: '1d20 +6',
    mode: 'normal',
    dice: [{ sides: 20, value: 17 }],
    modifier: 6,
    total: 23,
    outcome: 'normal',
    visibility: 'party',
    at: new Date().toISOString(),
  };

  const first = await repos.rolls.record(roll);
  assert.equal(first.id, roll.id, 'the client id is kept when it is free');

  // A second device's per-page counter produces the same id on its first roll. Losing that
  // roll would lose a line of the log, so the server keeps it under an id of its own.
  const second = await repos.rolls.record({ ...roll, actor: 'Bram Ironfoot', total: 11 });
  assert.notEqual(second.id, first.id);
  assert.equal(second.actor, 'Bram Ironfoot');

  const log = await repos.rolls.listForCombat(combat.id);
  assert.equal(log.length, 2);
  assert.deepEqual(log[0]?.dice, [{ sides: 20, value: 17 }]);
});

/* ── Drafts ─────────────────────────────────────────────────────────────────── */

test('a draft autosaves as an upsert and becomes a character exactly once', { skip }, async () => {
  const draft = await repos.drafts.create({
    systemId: id<'GameSystem'>('dnd5e'),
    ownerUserId: DM,
    name: 'Unnamed',
  });
  assert.equal(draft.stepId, 'ruleset');

  // Autosave fires on every answer, so the same id has to overwrite rather than accumulate.
  await repos.drafts.save({ ...draft, name: 'Vex', stepId: 'species' });
  await repos.drafts.save({ ...draft, name: 'Vex', stepId: 'class', choices: { class: 'rogue' } });

  const mine = await repos.drafts.listForOwner(DM);
  assert.equal(mine.filter((entry) => entry.id === draft.id).length, 1);
  const current = await repos.drafts.byId(draft.id);
  assert.equal(current?.stepId, 'class');
  assert.deepEqual(current?.choices, { class: 'rogue' });

  const character = await repos.drafts.finalise(
    draft.id,
    await buildCharacter({ id: 'ch-vex', name: 'Vex', ownerUserId: DM }),
  );
  assert.equal(character.name, 'Vex');
  assert.equal(await repos.drafts.byId(draft.id), null, 'a finished draft is no longer a draft');
  assert.ok(await repos.characters.byId(character.id));
});

/* ── Helpers ────────────────────────────────────────────────────────────────── */

async function buildCharacter(input: {
  id: string;
  name: string;
  ownerUserId: string;
}): Promise<Character> {
  return {
    id: id<'Character'>(input.id),
    systemId: id<'GameSystem'>('dnd5e'),
    ownerUserId: id<'User'>(input.ownerUserId),
    name: input.name,
    subtitle: 'Human Fighter 1',
    archetype: 'Fighter',
    level: 1,
    attributes: [{ key: 'str', label: 'Strength', value: 15, modifier: 2 }],
    resources: [],
    health: { current: 12, max: 12, temporary: 0 },
    conditions: [],
    sectionVisibility: { inventory: 'private' },
    systemData: { class: 'fighter' },
  };
}

/** Inserts a character straight through the schema, since there is no `characters.create`. */
async function makeCharacter(input: { name: string; ownerUserId: string }): Promise<Character> {
  const character = await buildCharacter({
    id: `ch-${input.name.toLowerCase().replaceAll(/\W/g, '-')}`,
    name: input.name,
    ownerUserId: input.ownerUserId,
  });

  const draft = await repos.drafts.create({
    systemId: character.systemId,
    ownerUserId: character.ownerUserId,
    name: character.name,
  });
  return repos.drafts.finalise(draft.id, character);
}

/**
 * The seeded demo campaign — the one with both a prepared encounter and a party in it.
 *
 * Found rather than hard-coded, and not simply the first row: tests above create campaigns
 * of their own, `listForUser` is ordered newest first, and the demo world also contains a
 * campaign with encounters but no characters.
 */
async function demoCampaign() {
  for (const campaign of await repos.campaigns.listForUser(DM)) {
    const [encounters, roster] = await Promise.all([
      repos.encounters.listForCampaign(campaign.id),
      repos.characters.listForCampaign(campaign.id),
    ]);
    if (encounters.length > 0 && roster.length > 1) return campaign;
  }
  assert.fail('the seeded world has no campaign with both a prepared encounter and a party');
}

/** A fresh template and the fight started from it, so each combat test owns its own data. */
async function startAFight(): Promise<{
  combat: CombatInstance;
  templateId: EncounterTemplateId;
}> {
  const campaign = await demoCampaign();
  const [creature] = await repos.monsters.list({ origin: 'library', limit: 1 });
  assert.ok(creature);

  const template = await repos.encounters.create({
    campaignId: campaign.id,
    name: `Fight ${Math.floor(performance.now())}`,
  });
  const prepared = await repos.encounters.save({
    ...template,
    entries: [{ id: 'entry-1', monsterId: creature.id, count: 2 }],
  });

  return { combat: await repos.combats.startFromTemplate(prepared.id), templateId: prepared.id };
}
