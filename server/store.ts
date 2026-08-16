/**
 * The `Repositories` surface over PostgreSQL — the production twin of
 * `src/domain/data/fixtureRepositories.ts`.
 *
 * It implements the same interface, method for method, and keeps the same refusals with the
 * same wording, because those messages are what the screens already render. A DM who tries
 * to edit a library creature must read the same sentence whether the data came from a
 * fixture array or from a database.
 *
 * Three properties the fixture layer guarantees in memory and this layer guarantees in SQL:
 *
 * - **A read cannot write.** Rows are mapped into fresh objects, so nothing a caller holds
 *   can reach the store — the SQL equivalent of `copyTemplate` / `copyCombat`.
 * - **A fight cannot edit the encounter it came from.** There is no statement anywhere
 *   below that writes an encounter's roster from a combat write. `startFromTemplate`
 *   touches `last_run_at` and nothing else.
 * - **Library content is never edited.** `create` and `save` always produce homebrew, and
 *   the database refuses an owned library row outright.
 *
 * What this layer does NOT do: authorize. Every method here trusts its caller, exactly as
 * the fixture layer does. Authorization is TC-P02 and belongs at the request boundary,
 * above this file.
 */
import { randomUUID } from 'node:crypto';
import { id } from '../src/domain/types.ts';
import { listGameSystems } from '../src/domain/ruleset/registry.ts';
import type {
  Attribute,
  Campaign,
  CampaignActivity,
  CampaignId,
  CampaignMember,
  Character,
  CharacterDraft,
  CharacterDraftId,
  CharacterId,
  CharacterSectionKey,
  CombatInstance,
  CombatInstanceId,
  CombatParticipant,
  Condition,
  DeathSaves,
  DerivedValue,
  EncounterEntry,
  EncounterTemplate,
  EncounterTemplateId,
  EntityType,
  GameSystemId,
  HealthTrack,
  Monster,
  MonsterAction,
  MonsterActionGroup,
  MonsterId,
  ParticipantId,
  ParticipantState,
  RecentItem,
  ResourcePool,
  Roll,
  RolledDie,
  RollMode,
  RollOutcome,
  User,
  UserId,
  Visibility,
} from '../src/domain/types.ts';
import type {
  CombatCommandInput,
  CreateCampaignInput,
  CreateDraftInput,
  MonsterQuery,
  Repositories,
} from '../src/domain/data/repositories.ts';
import { codeForStatus, type ApiErrorCode } from '../src/domain/data/apiContract.ts';
import { executeCombatCommand, type CombatPort } from './combatService.ts';
import { iso, type Db } from './db.ts';

/**
 * The most rolls one combat's log will hand back in a single read.
 *
 * A fight is bounded in practice and unbounded in principle; the log screen shows the last
 * ten by default and offers "show all", which this makes "show the most recent five hundred".
 * Beyond that a session needs paging rather than a bigger array.
 */
export const MAX_ROLLS_PER_READ = 500;

/* ── Errors the screens already know how to render ──────────────────────────── */

/**
 * A refusal the caller could have avoided, as opposed to a fault.
 *
 * Carries the stable `code` the API answers with. Callers branch on the code; the message is
 * for people and may be reworded without breaking anything.
 */
export class StoreError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(status: number, message: string, code?: ApiErrorCode) {
    super(message);
    this.name = 'StoreError';
    this.status = status;
    this.code = code ?? codeForStatus(status);
  }
}

const gone = (what: string) => new StoreError(404, `That ${what} no longer exists.`, 'not_found');

/* ── Row shapes ─────────────────────────────────────────────────────────────── */

interface UserRow {
  id: string;
  display_name: string;
}

interface CampaignRow {
  id: string;
  name: string;
  system_id: string;
  dm_user_id: string;
  invite_code: string;
  created_at: Date;
}

interface MemberRow {
  campaign_id: string;
  user_id: string;
  role: 'dm' | 'player';
  character_id: string | null;
}

interface CharacterRow {
  id: string;
  system_id: string;
  campaign_id: string | null;
  owner_user_id: string;
  name: string;
  subtitle: string;
  archetype: string | null;
  level: number;
  health: HealthTrack;
  attributes: Attribute[];
  resources: ResourcePool[];
  conditions: Condition[];
  section_visibility: Partial<Record<CharacterSectionKey, Visibility>>;
  draft: { step: number; totalSteps: number } | null;
  pending_level_up: boolean;
  system_data: Record<string, unknown>;
}

interface MonsterRow {
  id: string;
  system_id: string;
  name: string;
  subtitle: string;
  origin: 'library' | 'homebrew';
  owner_user_id: string | null;
  cloned_from: string | null;
  challenge_label: string;
  challenge_rank: number;
  source: string;
  facets: Record<string, string[]>;
  attributes: Attribute[];
  health: HealthTrack;
  derived: DerivedValue[];
  traits: MonsterAction[];
  action_groups: MonsterActionGroup[];
  system_data: Record<string, unknown>;
}

interface EncounterRow {
  id: string;
  campaign_id: string;
  name: string;
  location: string | null;
  entries: EncounterEntry[];
  absent_character_ids: string[] | null;
  notes: string | null;
  updated_at: Date | null;
  last_run_at: Date | null;
}

interface CombatRow {
  id: string;
  campaign_id: string;
  encounter_template_id: string | null;
  name: string;
  location: string | null;
  status: CombatInstance['status'];
  round: number;
  active_participant_id: string | null;
  started_at: Date | null;
  ended_at: Date | null;
  version: number;
}

interface ParticipantRow {
  id: string;
  combat_id: string;
  name: string;
  subtitle: string;
  entity_type: EntityType;
  initiative: number | null;
  health: HealthTrack;
  conditions: Condition[];
  state: ParticipantState;
  death_saves: DeathSaves | null;
  visibility: Visibility;
  targeted: boolean;
  group_key: string | null;
  source_kind: 'character' | 'monster';
  source_character_id: string | null;
  source_monster_id: string | null;
}

interface RollRow {
  id: string;
  combat_id: string | null;
  actor: string;
  title: string;
  expression: string;
  mode: RollMode;
  dice: RolledDie[];
  modifier: number;
  total: number;
  outcome: RollOutcome;
  visibility: Visibility;
  at: Date;
}

interface DraftRow {
  id: string;
  system_id: string;
  owner_user_id: string;
  campaign_id: string | null;
  name: string;
  choices: Record<string, unknown>;
  step_id: string;
  updated_at: Date;
}

interface RecentRow {
  kind: RecentItem['kind'];
  entity_id: string;
  label: string;
  href: string;
  at: Date;
}

interface ActivityRow {
  id: string;
  campaign_id: string;
  kind: CampaignActivity['kind'];
  summary: string;
  detail: string;
  character_id: string | null;
  at: Date;
}

/* ── Row → domain ───────────────────────────────────────────────────────────── */

function toUser(row: UserRow): User {
  return { id: id<'User'>(row.id), displayName: row.display_name };
}

function toCampaign(row: CampaignRow, members: MemberRow[]): Campaign {
  return {
    id: id<'Campaign'>(row.id),
    name: row.name,
    systemId: id<'GameSystem'>(row.system_id),
    dmUserId: id<'User'>(row.dm_user_id),
    inviteCode: row.invite_code,
    members: members.map((member): CampaignMember => ({
      userId: id<'User'>(member.user_id),
      role: member.role,
      ...(member.character_id ? { characterId: id<'Character'>(member.character_id) } : {}),
    })),
    createdAt: iso(row.created_at) ?? new Date(0).toISOString(),
  };
}

function toCharacter(row: CharacterRow): Character {
  return {
    id: id<'Character'>(row.id),
    systemId: id<'GameSystem'>(row.system_id),
    ...(row.campaign_id ? { campaignId: id<'Campaign'>(row.campaign_id) } : {}),
    ownerUserId: id<'User'>(row.owner_user_id),
    name: row.name,
    subtitle: row.subtitle,
    ...(row.archetype ? { archetype: row.archetype } : {}),
    level: row.level,
    attributes: row.attributes,
    resources: row.resources,
    health: row.health,
    conditions: row.conditions,
    sectionVisibility: row.section_visibility,
    ...(row.draft ? { draft: row.draft } : {}),
    ...(row.pending_level_up ? { pendingLevelUp: true } : {}),
    systemData: row.system_data,
  };
}

function toMonster(row: MonsterRow): Monster {
  return {
    id: id<'Monster'>(row.id),
    systemId: id<'GameSystem'>(row.system_id),
    name: row.name,
    subtitle: row.subtitle,
    origin: row.origin,
    ...(row.owner_user_id ? { ownerUserId: id<'User'>(row.owner_user_id) } : {}),
    ...(row.cloned_from ? { clonedFrom: id<'Monster'>(row.cloned_from) } : {}),
    challengeLabel: row.challenge_label,
    challengeRank: row.challenge_rank,
    source: row.source,
    facets: row.facets,
    attributes: row.attributes,
    health: row.health,
    derived: row.derived,
    traits: row.traits,
    actionGroups: row.action_groups,
    systemData: row.system_data,
  };
}

function toEncounter(row: EncounterRow): EncounterTemplate {
  return {
    id: id<'EncounterTemplate'>(row.id),
    campaignId: id<'Campaign'>(row.campaign_id),
    name: row.name,
    ...(row.location ? { location: row.location } : {}),
    entries: row.entries,
    ...(row.absent_character_ids
      ? { absentCharacterIds: row.absent_character_ids.map((value) => id<'Character'>(value)) }
      : {}),
    ...(row.notes ? { notes: row.notes } : {}),
    ...(row.updated_at ? { updatedAt: iso(row.updated_at) } : {}),
    ...(row.last_run_at ? { lastRunAt: iso(row.last_run_at) } : {}),
  };
}

function toParticipant(row: ParticipantRow): CombatParticipant {
  return {
    id: id<'CombatParticipant'>(row.id),
    name: row.name,
    subtitle: row.subtitle,
    entityType: row.entity_type,
    initiative: row.initiative,
    health: row.health,
    conditions: row.conditions,
    state: row.state,
    ...(row.death_saves ? { deathSaves: row.death_saves } : {}),
    visibility: row.visibility,
    ...(row.targeted ? { targeted: true } : {}),
    ...(row.group_key ? { groupKey: row.group_key } : {}),
    source:
      row.source_kind === 'character'
        ? { kind: 'character', characterId: id<'Character'>(row.source_character_id ?? '') }
        : { kind: 'monster', monsterId: id<'Monster'>(row.source_monster_id ?? '') },
  };
}

function toCombat(row: CombatRow, participants: ParticipantRow[]): CombatInstance {
  return {
    id: id<'CombatInstance'>(row.id),
    campaignId: id<'Campaign'>(row.campaign_id),
    ...(row.encounter_template_id
      ? { encounterTemplateId: id<'EncounterTemplate'>(row.encounter_template_id) }
      : {}),
    name: row.name,
    ...(row.location ? { location: row.location } : {}),
    status: row.status,
    round: row.round,
    activeParticipantId: row.active_participant_id
      ? id<'CombatParticipant'>(row.active_participant_id)
      : null,
    participants: participants.map(toParticipant),
    ...(row.started_at ? { startedAt: iso(row.started_at) } : {}),
    ...(row.ended_at ? { endedAt: iso(row.ended_at) } : {}),
    // Carried on the read, because a caller has to send it back with the next command.
    version: row.version,
  };
}

function toRoll(row: RollRow): Roll {
  return {
    id: id<'Roll'>(row.id),
    ...(row.combat_id ? { combatId: id<'CombatInstance'>(row.combat_id) } : {}),
    actor: row.actor,
    title: row.title,
    expression: row.expression,
    mode: row.mode,
    dice: row.dice,
    modifier: row.modifier,
    total: row.total,
    outcome: row.outcome,
    visibility: row.visibility,
    at: iso(row.at) ?? new Date(0).toISOString(),
  };
}

function toDraft(row: DraftRow): CharacterDraft {
  return {
    id: id<'CharacterDraft'>(row.id),
    systemId: id<'GameSystem'>(row.system_id),
    ownerUserId: id<'User'>(row.owner_user_id),
    ...(row.campaign_id ? { campaignId: id<'Campaign'>(row.campaign_id) } : {}),
    name: row.name,
    choices: row.choices,
    stepId: row.step_id,
    updatedAt: iso(row.updated_at) ?? new Date(0).toISOString(),
  };
}

/* ── Helpers ────────────────────────────────────────────────────────────────── */

const newId = (prefix: string): string => `${prefix}-${randomUUID()}`;

/**
 * `CRAGMAW-7742` — a word from the campaign name and four digits, as the design draws it.
 *
 * Random rather than derived from a counter, and unique in the database. It is still a
 * joining convenience rather than a secret; TC-P02 owns what redeeming one is allowed to do.
 */
function makeInviteCode(name: string): string {
  const word = (name.split(/\s+/).find((part) => part.length > 3) ?? name)
    .replaceAll(/[^a-z]/gi, '')
    .toUpperCase()
    .slice(0, 8);
  const digits = 1000 + Math.floor(Number(randomUUID().replaceAll(/\D/g, '').slice(0, 6)) % 9000);
  return `${word || 'CAMPAIGN'}-${digits}`;
}

async function membersOf(db: Db, campaignIds: string[]): Promise<Map<string, MemberRow[]>> {
  const byCampaign = new Map<string, MemberRow[]>();
  if (campaignIds.length === 0) return byCampaign;

  const rows = await db.query<MemberRow>(
    'select campaign_id, user_id, role, character_id from campaign_members where campaign_id = any($1::text[]) order by role desc, user_id',
    [campaignIds],
  );
  for (const row of rows) {
    const existing = byCampaign.get(row.campaign_id);
    if (existing) existing.push(row);
    else byCampaign.set(row.campaign_id, [row]);
  }
  return byCampaign;
}

async function loadCombats(db: Db, rows: CombatRow[]): Promise<CombatInstance[]> {
  if (rows.length === 0) return [];
  const participants = await db.query<ParticipantRow>(
    `select * from combat_participants where combat_id = any($1::text[]) order by combat_id, ordinal`,
    [rows.map((row) => row.id)],
  );
  return rows.map((row) =>
    toCombat(
      row,
      participants.filter((participant) => participant.combat_id === row.id),
    ),
  );
}

/** Builds the shared WHERE clause for `monsters.list` and `monsters.count`. */
function monsterFilter(query: MonsterQuery | undefined): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const next = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  if (query?.origin) clauses.push(`origin = ${next(query.origin)}`);

  const search = query?.search?.trim();
  if (search) {
    // Name and subtitle both: a DM typing "goblinoid" is searching as legitimately as one
    // typing "goblin". `ilike` is fine at library scale; a trigram index is a later problem.
    clauses.push(`(name || ' ' || subtitle) ilike '%' || ${next(search)} || '%'`);
  }

  if (typeof query?.challengeMin === 'number') {
    clauses.push(`challenge_rank >= ${next(query.challengeMin)}`);
  }
  if (typeof query?.challengeMax === 'number') {
    clauses.push(`challenge_rank <= ${next(query.challengeMax)}`);
  }

  // Values within a facet are OR-ed, facets are AND-ed. `?|` asks whether any of the given
  // strings appears as an element of that facet's JSON array, which is exactly the rule.
  for (const [facet, wanted] of Object.entries(query?.facets ?? {})) {
    if (wanted.length === 0) continue;
    clauses.push(`coalesce(facets -> ${next(facet)}, '[]'::jsonb) ?| ${next(wanted)}::text[]`);
  }

  return { sql: clauses.length > 0 ? `where ${clauses.join(' and ')}` : '', params };
}

function monsterOrder(sort: MonsterQuery['sort']): string {
  if (sort === 'name') return 'order by name asc';
  if (sort === 'challenge-asc') return 'order by challenge_rank asc, name asc';
  // Descending by difficulty is the design's default: a DM picking an opponent is shopping
  // downward from "too hard".
  return 'order by challenge_rank desc, name asc';
}

const MONSTER_COLUMNS = `id, system_id, name, subtitle, origin, owner_user_id, cloned_from,
  challenge_label, challenge_rank, source, facets, attributes, health, derived, traits,
  action_groups, system_data`;

/** PostgreSQL's unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = '23505';

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === UNIQUE_VIOLATION;

async function insertMonster(db: Db, monster: Monster): Promise<Monster> {
  const [row] = await db.query<MonsterRow>(
    `insert into monsters (id, system_id, name, subtitle, origin, owner_user_id, cloned_from,
       challenge_label, challenge_rank, source, facets, attributes, health, derived, traits,
       action_groups, system_data)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     returning ${MONSTER_COLUMNS}`,
    [
      monster.id,
      monster.systemId,
      monster.name,
      monster.subtitle,
      // Writes always produce homebrew. Library content is ingested reference data, and a
      // DM must not be able to change what the book says by accident.
      'homebrew',
      monster.ownerUserId ?? null,
      monster.clonedFrom ?? null,
      monster.challengeLabel,
      monster.challengeRank,
      monster.source,
      JSON.stringify(monster.facets),
      JSON.stringify(monster.attributes),
      JSON.stringify(monster.health),
      JSON.stringify(monster.derived),
      JSON.stringify(monster.traits),
      JSON.stringify(monster.actionGroups),
      JSON.stringify(monster.systemData),
    ],
  );
  if (!row) throw new StoreError(500, 'The creature could not be saved.');
  return toMonster(row);
}

/**
 * Whether a stored roll is the one being recorded again.
 *
 * The identifying fields only: who rolled what, when, and what came up. A retry replays the
 * same bytes; anything less specific would treat a genuine id collision as a duplicate and
 * silently lose a line of the log.
 */
function isSameRoll(stored: RollRow, incoming: Roll): boolean {
  return (
    stored.combat_id === (incoming.combatId ?? null) &&
    stored.actor === incoming.actor &&
    stored.title === incoming.title &&
    stored.expression === incoming.expression &&
    stored.total === incoming.total &&
    new Date(stored.at).getTime() === new Date(incoming.at).getTime()
  );
}

/** Appends to a fight's history. Always called inside the transaction that wrote the fight. */
async function recordCombatEvent(
  db: Db,
  combatId: string,
  kind: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await db.query(
    `insert into combat_events (combat_id, seq, kind, payload)
     select $1, coalesce(max(seq), 0) + 1, $2, $3::jsonb from combat_events where combat_id = $1`,
    [combatId, kind, JSON.stringify(payload)],
  );
}

async function writeParticipants(
  db: Db,
  combatId: string,
  participants: readonly CombatParticipant[],
): Promise<void> {
  // The set is replaced rather than merged, which is what the current whole-record write
  // contract means. TC-P04 replaces this with per-participant intents; the table shape it
  // needs is already here, so that is a change to this function and not to the schema.
  await db.query('delete from combat_participants where combat_id = $1', [combatId]);

  for (const [ordinal, participant] of participants.entries()) {
    await db.query(
      `insert into combat_participants (id, combat_id, ordinal, name, subtitle, entity_type,
         initiative, health, conditions, state, death_saves, visibility, targeted, group_key,
         source_kind, source_character_id, source_monster_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        participant.id,
        combatId,
        ordinal,
        participant.name,
        participant.subtitle,
        participant.entityType,
        participant.initiative,
        JSON.stringify(participant.health),
        JSON.stringify(participant.conditions),
        participant.state,
        participant.deathSaves ? JSON.stringify(participant.deathSaves) : null,
        participant.visibility,
        participant.targeted ?? false,
        participant.groupKey ?? null,
        participant.source.kind,
        participant.source.kind === 'character' ? participant.source.characterId : null,
        participant.source.kind === 'monster' ? participant.source.monsterId : null,
      ],
    );
  }
}

/**
 * How the combat service reads and writes a fight.
 *
 * Handed to it rather than imported by it, so the service is a transaction and a set of rules
 * with no opinion about SQL, and the SQL stays in this file with the rest of it.
 */
const combatPort: CombatPort = {
  async load(tx, combatId) {
    const rows = await tx.query<CombatRow>('select * from combats where id = $1', [combatId]);
    const [row] = rows;
    if (!row) return null;
    const [combat] = await loadCombats(tx, rows);
    return combat ? { combat, version: row.version } : null;
  },

  writeParticipants: (tx, combatId, participants) => writeParticipants(tx, combatId, participants),

  async systemIdFor(tx, campaignId) {
    const [row] = await tx.query<{ system_id: string }>(
      'select system_id from campaigns where id = $1',
      [campaignId],
    );
    return row ? id<'GameSystem'>(row.system_id) : null;
  },

  /**
   * The attributes behind each participant, for an initiative roll.
   *
   * Two reads rather than one per combatant: a fight of thirteen is thirteen round trips done
   * the obvious way, and this is the one command that needs them at all.
   */
  async attributesFor(tx, participants) {
    const characterIds = participants
      .filter((entry) => entry.source.kind === 'character')
      .map((entry) => (entry.source.kind === 'character' ? entry.source.characterId : ''));
    const monsterIds = participants
      .filter((entry) => entry.source.kind === 'monster')
      .map((entry) => (entry.source.kind === 'monster' ? entry.source.monsterId : ''));

    const [characters, monsters] = await Promise.all([
      characterIds.length > 0
        ? tx.query<{ id: string; attributes: Attribute[] }>(
            'select id, attributes from characters where id = any($1::text[])',
            [characterIds],
          )
        : Promise.resolve([]),
      monsterIds.length > 0
        ? tx.query<{ id: string; attributes: Attribute[] }>(
            'select id, attributes from monsters where id = any($1::text[])',
            [monsterIds],
          )
        : Promise.resolve([]),
    ]);

    const bySource = new Map<string, Attribute[]>();
    for (const row of [...characters, ...monsters]) bySource.set(row.id, row.attributes);

    const byParticipant = new Map<string, Attribute[]>();
    for (const participant of participants) {
      const sourceId =
        participant.source.kind === 'character'
          ? participant.source.characterId
          : participant.source.monsterId;
      byParticipant.set(participant.id, bySource.get(sourceId) ?? []);
    }
    return byParticipant;
  },
};

export interface StoreOptions {
  /**
   * Who `users.current()` answers with.
   *
   * TC-P01 has no authentication, so this is supplied by configuration and is null unless a
   * developer set it. TC-P02 replaces it with the authenticated session.
   */
  currentUserId?: string | null;
}

/* ── The repositories ───────────────────────────────────────────────────────── */

export function createPostgresRepositories(db: Db, options: StoreOptions = {}): Repositories {
  const currentUserId = options.currentUserId ?? null;

  return {
    /**
     * Authentication is not a repository operation on this side of the wire.
     *
     * Signing in mints a session cookie and signing out revokes it, and both are effects on
     * an HTTP response rather than reads or writes of domain data — so they are handled at
     * the request boundary in `http.ts`, over `auth.ts`. These exist because `Repositories`
     * is one interface shared with the browser, where they are the client's half of the
     * call. Reaching them here would mean a route bypassed the boundary, which is worth a
     * loud failure rather than a silent one.
     */
    auth: {
      signIn: () => Promise.reject(new StoreError(500, 'Sign-in is handled at the HTTP boundary.')),
      signUp: () => Promise.reject(new StoreError(500, 'Sign-up is handled at the HTTP boundary.')),
      signOut: () =>
        Promise.reject(new StoreError(500, 'Sign-out is handled at the HTTP boundary.')),
    },

    users: {
      current: async () => {
        if (!currentUserId) {
          throw new StoreError(401, 'Not signed in.', 'unauthenticated');
        }
        const [row] = await db.query<UserRow>('select id, display_name from users where id = $1', [
          currentUserId,
        ]);
        if (!row) throw new StoreError(401, 'Not signed in.', 'unauthenticated');
        return toUser(row);
      },
      byId: async (userId: UserId) => {
        const [row] = await db.query<UserRow>('select id, display_name from users where id = $1', [
          userId,
        ]);
        return row ? toUser(row) : null;
      },
      byIds: async (userIds: UserId[]) => {
        if (userIds.length === 0) return [];
        const rows = await db.query<UserRow>(
          'select id, display_name from users where id = any($1::text[]) order by display_name',
          [userIds],
        );
        return rows.map(toUser);
      },
      // Scoped by the session rather than by anything the caller sent: there is no id in
      // the path or the body, so there is no other account this statement can reach.
      updateSelf: async (input: { displayName: string }) => {
        if (!currentUserId) throw new StoreError(401, 'Not signed in.', 'unauthenticated');
        const name = input.displayName.trim();
        if (name === '')
          throw new StoreError(400, 'A display name is required.', 'validation_failed');

        const [row] = await db.query<UserRow>(
          'update users set display_name = $2 where id = $1 returning id, display_name',
          [currentUserId, name],
        );
        if (!row) throw new StoreError(401, 'Not signed in.', 'unauthenticated');
        return toUser(row);
      },
    },

    // Supported systems are a property of the deployed build, not of a user's data: the
    // registry is the only module that knows which adapters exist, so it stays the source.
    gameSystems: { list: () => Promise.resolve(listGameSystems()) },

    campaigns: {
      listForUser: async (userId: UserId) => {
        const rows = await db.query<CampaignRow>(
          `select c.* from campaigns c
             join campaign_members m on m.campaign_id = c.id
            where m.user_id = $1
            order by c.created_at desc`,
          [userId],
        );
        const members = await membersOf(
          db,
          rows.map((row) => row.id),
        );
        return rows.map((row) => toCampaign(row, members.get(row.id) ?? []));
      },

      byId: async (campaignId: CampaignId) => {
        const [row] = await db.query<CampaignRow>('select * from campaigns where id = $1', [
          campaignId,
        ]);
        if (!row) return null;
        const members = await membersOf(db, [row.id]);
        return toCampaign(row, members.get(row.id) ?? []);
      },

      create: (input: CreateCampaignInput) =>
        db.tx(async (tx) => {
          const campaignId = newId('c');
          const createdAt = new Date().toISOString();

          // The unique constraint on the code is the authority; a collision is retried
          // rather than papered over with a longer random string.
          let inviteCode = makeInviteCode(input.name);
          for (let attempt = 0; attempt < 5; attempt += 1) {
            const [clash] = await tx.query<{ code: string }>(
              'select invite_code as code from campaigns where invite_code = $1',
              [inviteCode],
            );
            if (!clash) break;
            inviteCode = makeInviteCode(input.name);
          }

          const [row] = await tx.query<CampaignRow>(
            `insert into campaigns (id, name, system_id, dm_user_id, invite_code, created_at)
             values ($1,$2,$3,$4,$5,$6) returning *`,
            [campaignId, input.name, input.systemId, input.dmUserId, inviteCode, createdAt],
          );
          if (!row) throw new StoreError(500, 'The campaign could not be created.');

          // Phase 1 has exactly one DM per campaign; the creator is it.
          await tx.query(
            `insert into campaign_members (campaign_id, user_id, role) values ($1,$2,'dm')`,
            [campaignId, input.dmUserId],
          );
          await tx.query('insert into invites (code, campaign_id, created_by) values ($1,$2,$3)', [
            inviteCode,
            campaignId,
            input.dmUserId,
          ]);

          const members = await membersOf(tx, [campaignId]);
          return toCampaign(row, members.get(campaignId) ?? []);
        }),

      acceptInvite: (code: string) =>
        db.tx(async (tx) => {
          if (!currentUserId) throw new StoreError(401, 'Not signed in.', 'unauthenticated');

          // The invite row is the authority, not the code printed on the campaign: only it
          // knows about revocation, expiry and how many times it has been spent.
          const [invite] = await tx.query<{ campaign_id: string; spent: boolean }>(
            `select campaign_id,
                    (revoked_at is not null
                     or (expires_at is not null and expires_at <= now())
                     or (max_uses is not null and used_count >= max_uses)) as spent
               from invites where upper(code) = upper($1) for update`,
            [code.trim()],
          );
          // One message for a code that never existed and one that is no longer good: a
          // wrong code must not tell a stranger which campaigns are real.
          if (!invite || invite.spent) {
            throw new StoreError(404, 'That invite code does not match a campaign.', 'not_found');
          }

          const [campaign] = await tx.query<CampaignRow>('select * from campaigns where id = $1', [
            invite.campaign_id,
          ]);
          if (!campaign) {
            throw new StoreError(404, 'That invite code does not match a campaign.', 'not_found');
          }

          // Joining twice is not an error — a second tap on the same link is a second tap.
          const [existing] = await tx.query<{ user_id: string }>(
            'select user_id from campaign_members where campaign_id = $1 and user_id = $2',
            [campaign.id, currentUserId],
          );
          if (!existing) {
            await tx.query(
              `insert into campaign_members (campaign_id, user_id, role) values ($1,$2,'player')`,
              [campaign.id, currentUserId],
            );
            await tx.query(
              'update invites set used_count = used_count + 1 where upper(code) = upper($1)',
              [code.trim()],
            );
          }

          const members = await membersOf(tx, [campaign.id]);
          return toCampaign(campaign, members.get(campaign.id) ?? []);
        }),
    },

    characters: {
      listForCampaign: async (campaignId: CampaignId) => {
        const rows = await db.query<CharacterRow>(
          'select * from characters where campaign_id = $1 order by name',
          [campaignId],
        );
        return rows.map(toCharacter);
      },
      listForOwner: async (userId: UserId) => {
        const rows = await db.query<CharacterRow>(
          'select * from characters where owner_user_id = $1 order by name',
          [userId],
        );
        return rows.map(toCharacter);
      },
      listUnattached: async (userId: UserId) => {
        const rows = await db.query<CharacterRow>(
          'select * from characters where owner_user_id = $1 and campaign_id is null order by name',
          [userId],
        );
        return rows.map(toCharacter);
      },
      byId: async (characterId: CharacterId) => {
        const [row] = await db.query<CharacterRow>('select * from characters where id = $1', [
          characterId,
        ]);
        return row ? toCharacter(row) : null;
      },

      attachToCampaign: (characterId: CharacterId, campaignId: CampaignId) =>
        db.tx(async (tx) => {
          // A link, not a move: the character keeps its owner and its own history.
          const [row] = await tx.query<CharacterRow>(
            'update characters set campaign_id = $2, updated_at = now() where id = $1 returning *',
            [characterId, campaignId],
          );
          if (!row) throw gone('character');

          const [campaign] = await tx.query<{ dm_user_id: string }>(
            'select dm_user_id from campaigns where id = $1',
            [campaignId],
          );
          if (!campaign) throw gone('campaign');

          // The DM is already a member as the DM; a player joins or has their character
          // pointer updated. Either way membership is upserted, never duplicated.
          if (campaign.dm_user_id === row.owner_user_id) {
            await tx.query(
              'update campaign_members set character_id = $3 where campaign_id = $1 and user_id = $2',
              [campaignId, row.owner_user_id, characterId],
            );
          } else {
            await tx.query(
              `insert into campaign_members (campaign_id, user_id, role, character_id)
               values ($1,$2,'player',$3)
               on conflict (campaign_id, user_id) do update set character_id = excluded.character_id`,
              [campaignId, row.owner_user_id, characterId],
            );
          }

          return toCharacter(row);
        }),
    },

    monsters: {
      list: async (query?: MonsterQuery) => {
        const { sql, params } = monsterFilter(query);
        // Interpolated rather than bound because both are integers by the time they reach
        // here: `parseMonsterQuery` coerces and bounds them, and `Math.trunc(Number(...))` is
        // the second gate. Nothing a caller typed reaches this string.
        const page = query?.limit ? ` limit ${Math.max(0, Math.trunc(Number(query.limit)))}` : '';
        const skip = query?.offset
          ? ` offset ${Math.max(0, Math.trunc(Number(query.offset)))}`
          : '';
        const rows = await db.query<MonsterRow>(
          `select ${MONSTER_COLUMNS} from monsters ${sql} ${monsterOrder(query?.sort)}${page}${skip}`,
          params,
        );
        return rows.map(toMonster);
      },

      count: async (query?: MonsterQuery) => {
        const { sql, params } = monsterFilter(query);
        // `count(*)` is bigint, which `pg` hands back as a string; the cast keeps the
        // contract's `Promise<number>` honest.
        const [row] = await db.query<{ total: number }>(
          `select count(*)::int as total from monsters ${sql}`,
          params,
        );
        return row?.total ?? 0;
      },

      byId: async (monsterId: MonsterId) => {
        const [row] = await db.query<MonsterRow>(
          `select ${MONSTER_COLUMNS} from monsters where id = $1`,
          [monsterId],
        );
        return row ? toMonster(row) : null;
      },

      /**
       * A creature the caller has not saved before.
       *
       * The id arrives in the body — a new creature is minted client-side so autosave has
       * something to write against before the first round trip. That makes a collision a
       * caller's mistake rather than a server fault, and TC-P08 found it answering with a
       * 500 and a PostgreSQL constraint name in the log. It is a `conflict`: the contract has
       * a code for "understood, and it clashes with what is already here", and an unhandled
       * database error is never an acceptable answer to a well-formed request.
       */
      create: async (monster: Monster) => {
        try {
          return await insertMonster(db, monster);
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw new StoreError(409, 'A creature with that id already exists.', 'conflict');
          }
          throw error;
        }
      },

      save: (monster: Monster) =>
        db.tx(async (tx) => {
          const [existing] = await tx.query<{ origin: string }>(
            'select origin from monsters where id = $1 for update',
            [monster.id],
          );
          if (!existing) throw gone('creature');
          if (existing.origin === 'library') {
            throw new StoreError(
              409,
              'Library creatures cannot be edited. Clone it first.',
              'conflict',
            );
          }

          const [row] = await tx.query<MonsterRow>(
            `update monsters set system_id=$2, name=$3, subtitle=$4, origin='homebrew',
               owner_user_id=$5, cloned_from=$6, challenge_label=$7, challenge_rank=$8,
               source=$9, facets=$10, attributes=$11, health=$12, derived=$13, traits=$14,
               action_groups=$15, system_data=$16, updated_at=now()
             where id=$1 returning ${MONSTER_COLUMNS}`,
            [
              monster.id,
              monster.systemId,
              monster.name,
              monster.subtitle,
              monster.ownerUserId ?? null,
              monster.clonedFrom ?? null,
              monster.challengeLabel,
              monster.challengeRank,
              monster.source,
              JSON.stringify(monster.facets),
              JSON.stringify(monster.attributes),
              JSON.stringify(monster.health),
              JSON.stringify(monster.derived),
              JSON.stringify(monster.traits),
              JSON.stringify(monster.actionGroups),
              JSON.stringify(monster.systemData),
            ],
          );
          if (!row) throw gone('creature');
          return toMonster(row);
        }),

      // Library records survive a remove rather than erroring, matching the fixture layer:
      // the DM asked to delete something they do not own, and nothing of theirs was lost.
      remove: async (monsterId: MonsterId) => {
        await db.query(`delete from monsters where id = $1 and origin = 'homebrew'`, [monsterId]);
      },

      cloneFrom: (sourceId: MonsterId, ownerUserId: UserId, ownerName: string) =>
        db.tx(async (tx) => {
          const [source] = await tx.query<MonsterRow>(
            `select ${MONSTER_COLUMNS} from monsters where id = $1`,
            [sourceId],
          );
          if (!source) throw gone('creature');

          const original = toMonster(source);
          return insertMonster(tx, {
            ...original,
            id: id<'Monster'>(newId('m')),
            name: `${original.name} (copy)`,
            origin: 'homebrew',
            ownerUserId,
            source: ownerName,
            clonedFrom: original.id,
          });
        }),
    },

    encounters: {
      listForCampaign: async (campaignId: CampaignId) => {
        const rows = await db.query<EncounterRow>(
          'select * from encounters where campaign_id = $1 order by updated_at desc nulls last, name',
          [campaignId],
        );
        return rows.map(toEncounter);
      },
      byId: async (encounterId: EncounterTemplateId) => {
        const [row] = await db.query<EncounterRow>('select * from encounters where id = $1', [
          encounterId,
        ]);
        return row ? toEncounter(row) : null;
      },

      create: async (input: { campaignId: CampaignId; name: string }) => {
        const [row] = await db.query<EncounterRow>(
          `insert into encounters (id, campaign_id, name, entries, updated_at)
           values ($1,$2,$3,'[]'::jsonb, now()) returning *`,
          [newId('e'), input.campaignId, input.name],
        );
        if (!row) throw new StoreError(500, 'The encounter could not be created.');
        return toEncounter(row);
      },

      save: async (encounter: EncounterTemplate) => {
        const [row] = await db.query<EncounterRow>(
          `update encounters set name=$2, location=$3, entries=$4, absent_character_ids=$5,
             notes=$6, updated_at=now()
           where id=$1 returning *`,
          [
            encounter.id,
            encounter.name,
            encounter.location ?? null,
            JSON.stringify(encounter.entries),
            encounter.absentCharacterIds ? JSON.stringify(encounter.absentCharacterIds) : null,
            encounter.notes ?? null,
          ],
        );
        if (!row) throw gone('encounter');
        return toEncounter(row);
      },

      remove: async (encounterId: EncounterTemplateId) => {
        await db.query('delete from encounters where id = $1', [encounterId]);
      },

      duplicate: async (encounterId: EncounterTemplateId) => {
        // Entries and absences are copied, not shared, and a copy has not been run whatever
        // the original has done — hence no last_run_at.
        const [row] = await db.query<EncounterRow>(
          `insert into encounters (id, campaign_id, name, location, entries,
             absent_character_ids, notes, updated_at)
           select $2, campaign_id, name || ' (copy)', location, entries,
                  absent_character_ids, notes, now()
             from encounters where id = $1
           returning *`,
          [encounterId, newId('e')],
        );
        if (!row) throw gone('encounter');
        return toEncounter(row);
      },
    },

    combats: {
      liveForCampaign: async (campaignId: CampaignId) => {
        const rows = await db.query<CombatRow>(
          `select * from combats where campaign_id = $1 and status = 'live'
            order by started_at desc nulls last limit 1`,
          [campaignId],
        );
        const [combat] = await loadCombats(db, rows);
        return combat ?? null;
      },

      liveForUser: async (userId: UserId) => {
        // One call rather than one per campaign: "Continue active combat" is the first thing
        // both homes ask for, and a DM with six campaigns should not pay six round trips.
        const rows = await db.query<CombatRow>(
          `select c.* from combats c
             join campaign_members m on m.campaign_id = c.campaign_id
            where m.user_id = $1 and c.status = 'live'
            order by c.started_at desc nulls last limit 1`,
          [userId],
        );
        const [combat] = await loadCombats(db, rows);
        return combat ?? null;
      },

      listForCampaign: async (campaignId: CampaignId) => {
        const rows = await db.query<CombatRow>(
          'select * from combats where campaign_id = $1 order by started_at desc nulls last',
          [campaignId],
        );
        return loadCombats(db, rows);
      },

      byId: async (combatId: CombatInstanceId) => {
        const rows = await db.query<CombatRow>('select * from combats where id = $1', [combatId]);
        const [combat] = await loadCombats(db, rows);
        return combat ?? null;
      },

      /**
       * The only way a fight changes, since TC-P04.
       *
       * The whole-record write that used to live here is gone. Everything that made it unsafe
       * — the client computing hit points, two devices overwriting each other, a retry landing
       * twice — is answered in `combatService.ts`, inside one transaction that locks the
       * fight, checks the version, computes the result from the *stored* state and appends an
       * audit row. Note what is still absent from all of it: any write to `encounters`.
       */
      command: (input: CombatCommandInput) =>
        executeCombatCommand(db, combatPort, input, {
          actorUserId: currentUserId ? id<'User'>(currentUserId) : null,
        }),

      startFromTemplate: (encounterId: EncounterTemplateId) =>
        db.tx(async (tx) => {
          const [templateRow] = await tx.query<EncounterRow>(
            'select * from encounters where id = $1 for update',
            [encounterId],
          );
          if (!templateRow) throw gone('encounter');
          const template = toEncounter(templateRow);

          const participants: CombatParticipant[] = [];

          for (const entry of template.entries) {
            const [monsterRow] = await tx.query<MonsterRow>(
              `select ${MONSTER_COLUMNS} from monsters where id = $1`,
              [entry.monsterId],
            );
            // A template referencing a deleted creature loses that entry rather than
            // failing the start; the encounter screens count and report the difference.
            if (!monsterRow) continue;
            const monster = toMonster(monsterRow);

            // Identical creatures share a group key so the initiative list can collapse
            // them into one row, and are numbered so the DM can still name one of them.
            const grouped = entry.count > 1;
            for (let index = 1; index <= entry.count; index += 1) {
              participants.push({
                id: id<'CombatParticipant'>(newId('p')),
                name: grouped ? `${monster.name} #${index}` : monster.name,
                subtitle: monster.challengeLabel,
                entityType: 'monster',
                initiative: null,
                health: { current: monster.health.max, max: monster.health.max, temporary: 0 },
                conditions: [],
                state: 'waiting',
                visibility: entry.hidden ? 'private' : 'party',
                ...(grouped ? { groupKey: entry.monsterId } : {}),
                source: { kind: 'monster', monsterId: monster.id },
              });
            }
          }

          const absent = new Set<string>(template.absentCharacterIds ?? []);
          const roster = await tx.query<CharacterRow>(
            'select * from characters where campaign_id = $1 order by name',
            [template.campaignId],
          );
          for (const character of roster.map(toCharacter)) {
            if (absent.has(character.id)) continue;
            participants.push({
              id: id<'CombatParticipant'>(newId('p')),
              name: character.name,
              subtitle: character.subtitle,
              entityType: 'player',
              initiative: null,
              health: { ...character.health },
              conditions: character.conditions.map((condition) => ({ ...condition })),
              state: 'waiting',
              visibility: 'party',
              source: { kind: 'character', characterId: character.id },
            });
          }

          const combatId = newId('cb');
          const startedAt = new Date().toISOString();
          const [row] = await tx.query<CombatRow>(
            `insert into combats (id, campaign_id, encounter_template_id, name, location,
               status, round, active_participant_id, started_at)
             values ($1,$2,$3,$4,$5,'preparing',0,null,$6) returning *`,
            [
              combatId,
              template.campaignId,
              template.id,
              template.name,
              template.location ?? null,
              startedAt,
            ],
          );
          if (!row) throw new StoreError(500, 'The combat could not be started.');

          await writeParticipants(tx, combatId, participants);
          await recordCombatEvent(tx, combatId, 'combat.started', {
            encounterTemplateId: template.id,
            participants: participants.length,
          });

          // The template records that it has been run. That is a note about the template,
          // not a change to the fight it describes — the roster is untouched.
          await tx.query('update encounters set last_run_at = $2 where id = $1', [
            template.id,
            startedAt,
          ]);

          const [combat] = await loadCombats(tx, [row]);
          if (!combat) throw new StoreError(500, 'The combat could not be started.');
          return combat;
        }),
    },

    rolls: {
      listForCombat: async (combatId: CombatInstanceId) => {
        const rows = await db.query<RollRow>(
          'select * from rolls where combat_id = $1 order by at desc limit $2',
          [combatId, MAX_ROLLS_PER_READ],
        );
        return rows.map(toRoll);
      },

      // Append only. A correction is a new line, never an edit to the one it corrects.
      record: async (roll: Roll) => {
        const insert = `insert into rolls (id, combat_id, actor, title, expression, mode, dice,
             modifier, total, outcome, visibility, at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`;
        const values = (rollId: string) => [
          rollId,
          roll.combatId ?? null,
          roll.actor,
          roll.title,
          roll.expression,
          roll.mode,
          JSON.stringify(roll.dice),
          roll.modifier,
          roll.total,
          roll.outcome,
          roll.visibility,
          roll.at,
        ];

        // Roll ids are still minted on the client, where a per-page counter means two
        // devices in one fight collide on their first roll each. Dropping the second roll
        // would lose a line of the log, so the server re-mints instead. TC-P04 takes id
        // minting server-side and this fallback stops being reachable.
        const [row] = await db.query<RollRow>(
          `${insert} on conflict (id) do nothing returning *`,
          values(roll.id),
        );
        if (row) return toRoll(row);

        // Two different things look identical from here and need opposite answers: a client
        // resending a roll whose response it never saw, and a second device whose per-page
        // counter produced the same id. Comparing the payload is what tells them apart.
        const [existing] = await db.query<RollRow>('select * from rolls where id = $1', [roll.id]);
        if (existing && isSameRoll(existing, roll)) return toRoll(existing);

        const [reminted] = await db.query<RollRow>(`${insert} returning *`, values(newId('r')));
        if (!reminted) throw new StoreError(500, 'The roll could not be recorded.');
        return toRoll(reminted);
      },
    },

    drafts: {
      listForOwner: async (userId: UserId) => {
        const rows = await db.query<DraftRow>(
          'select * from character_drafts where owner_user_id = $1 order by updated_at desc',
          [userId],
        );
        return rows.map(toDraft);
      },
      byId: async (draftId: CharacterDraftId) => {
        const [row] = await db.query<DraftRow>('select * from character_drafts where id = $1', [
          draftId,
        ]);
        return row ? toDraft(row) : null;
      },

      create: async (input: CreateDraftInput) => {
        const [row] = await db.query<DraftRow>(
          `insert into character_drafts (id, system_id, owner_user_id, campaign_id, name,
             choices, step_id, updated_at)
           values ($1,$2,$3,$4,$5,$6,'ruleset', now()) returning *`,
          [
            newId('draft'),
            input.systemId,
            input.ownerUserId,
            input.campaignId ?? null,
            input.name ?? '',
            JSON.stringify({ ruleset: input.systemId }),
          ],
        );
        if (!row) throw new StoreError(500, 'The draft could not be created.');
        return toDraft(row);
      },

      // Autosave: called on every answer, so it is one idempotent upsert and nothing else.
      save: async (draft: CharacterDraft) => {
        const [row] = await db.query<DraftRow>(
          `insert into character_drafts (id, system_id, owner_user_id, campaign_id, name,
             choices, step_id, updated_at)
           values ($1,$2,$3,$4,$5,$6,$7, now())
           on conflict (id) do update set campaign_id = excluded.campaign_id,
             name = excluded.name, choices = excluded.choices, step_id = excluded.step_id,
             updated_at = now()
           returning *`,
          [
            draft.id,
            draft.systemId,
            draft.ownerUserId,
            draft.campaignId ?? null,
            draft.name,
            JSON.stringify(draft.choices),
            draft.stepId,
          ],
        );
        if (!row) throw new StoreError(500, 'The draft could not be saved.');
        return toDraft(row);
      },

      discard: async (draftId: CharacterDraftId) => {
        await db.query('delete from character_drafts where id = $1', [draftId]);
      },

      finalise: (draftId: CharacterDraftId, character: Character) =>
        db.tx(async (tx) => {
          const [row] = await tx.query<CharacterRow>(
            `insert into characters (id, system_id, campaign_id, owner_user_id, name, subtitle,
               archetype, level, health, attributes, resources, conditions, section_visibility,
               draft, pending_level_up, system_data)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,null,$14,$15)
             returning *`,
            [
              character.id,
              character.systemId,
              character.campaignId ?? null,
              character.ownerUserId,
              character.name,
              character.subtitle,
              character.archetype ?? null,
              character.level,
              JSON.stringify(character.health),
              JSON.stringify(character.attributes),
              JSON.stringify(character.resources),
              JSON.stringify(character.conditions),
              JSON.stringify(character.sectionVisibility),
              character.pendingLevelUp ?? false,
              JSON.stringify(character.systemData),
            ],
          );
          if (!row) throw new StoreError(500, 'The character could not be created.');

          if (character.campaignId) {
            await tx.query(
              'update campaign_members set character_id = $3 where campaign_id = $1 and user_id = $2',
              [character.campaignId, character.ownerUserId, character.id],
            );
          }
          // A finished draft stops being a draft. Deleting it is the one destructive step
          // in this store, and it is the user's own explicit "create this character".
          await tx.query('delete from character_drafts where id = $1', [draftId]);

          return toCharacter(row);
        }),
    },

    recents: {
      listForUser: async (userId: UserId, limit = 7) => {
        const rows = await db.query<RecentRow>(
          'select kind, entity_id, label, href, at from recents where user_id = $1 order by at desc limit $2',
          [userId, limit],
        );
        return rows.map((row): RecentItem => ({
          id: row.entity_id,
          kind: row.kind,
          label: row.label,
          href: row.href,
          at: iso(row.at) ?? new Date(0).toISOString(),
        }));
      },
    },

    activity: {
      listForUser: async (userId: UserId, limit = 4) => {
        const rows = await db.query<ActivityRow>(
          `select a.* from campaign_activity a
             join campaign_members m on m.campaign_id = a.campaign_id
            where m.user_id = $1
            order by a.at desc limit $2`,
          [userId, limit],
        );
        return rows.map((row): CampaignActivity => ({
          id: row.id,
          campaignId: id<'Campaign'>(row.campaign_id),
          kind: row.kind,
          summary: row.summary,
          detail: row.detail,
          ...(row.character_id ? { characterId: id<'Character'>(row.character_id) } : {}),
          at: iso(row.at) ?? new Date(0).toISOString(),
        }));
      },
    },
  };
}

/** Re-exported so the HTTP layer can name the branded ids it parses out of a path. */
export type {
  CampaignId,
  CharacterId,
  CharacterDraftId,
  CombatInstanceId,
  EncounterTemplateId,
  GameSystemId,
  MonsterId,
  ParticipantId,
  UserId,
};
