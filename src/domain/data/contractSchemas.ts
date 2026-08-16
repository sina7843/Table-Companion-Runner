/**
 * Every shape that crosses the wire, as a runtime schema.
 *
 * One declaration per domain type, built twice: **strict** for anything arriving from a
 * client, where an unrecognised key is an over-post rather than a courtesy, and **lenient**
 * for anything arriving from the server, where an unknown key means the deployment is ahead
 * of this build and is dropped rather than turned into a failure a user cannot act on.
 *
 * The bounds here are not cosmetic. Every string has a maximum and every array has a ceiling,
 * because "a JSON body under a megabyte" is not a constraint on a fight with fifty thousand
 * conditions on one goblin. They are set generously — the largest real value the design draws,
 * with room — and a request that exceeds one is refused by name rather than truncated.
 *
 * `systemData`, `choices` and the ruleset-owned bags are `unknownValue()` on purpose. The core
 * does not interpret them and must not start here; their contents are the adapter's business,
 * and the size limit on the request body is what bounds them.
 */
import {
  arrayOf,
  boolean,
  id,
  lazy,
  number,
  object,
  oneOf,
  optional,
  nullable,
  recordOf,
  string,
  taggedUnion,
  timestamp,
  unknownValue,
  type Result,
  type Schema,
} from './schema.ts';
import type {
  Attribute,
  CampaignId,
  CharacterId,
  CharacterDraftId,
  CombatInstanceId,
  ConditionId,
  EncounterTemplateId,
  GameSystemId,
  MonsterId,
  ParticipantId,
  RollId,
  UserId,
  Campaign,
  CampaignActivity,
  CampaignMember,
  Character,
  CharacterDraft,
  CombatInstance,
  CombatParticipant,
  Condition,
  DeathSaves,
  DerivedValue,
  EncounterEntry,
  EncounterTemplate,
  GameSystem,
  HealthTrack,
  Monster,
  MonsterAction,
  MonsterActionGroup,
  RecentItem,
  ResourcePool,
  Roll,
  RolledDie,
  User,
} from '../types.ts';
import type { CreateCampaignInput, CreateDraftInput } from './repositories.ts';

/* ── Shared bounds ──────────────────────────────────────────────────────────── */

/** A name, a label, a title. Long enough for anything a person types on purpose. */
const NAME = 200;
/** Prose: a description, an explanation, DM notes. */
const TEXT = 20_000;
/** A short token: a key, a tag, an expression. */
const TOKEN = 120;

const MAX = {
  attributes: 64,
  resources: 128,
  conditions: 64,
  traits: 128,
  actionGroups: 32,
  actions: 256,
  rolls: 32,
  tags: 32,
  facetValues: 64,
  entries: 512,
  participants: 512,
  absent: 512,
  members: 64,
  dice: 128,
  sections: 32,
} as const;

const text = (max: number) => string({ max });
const label = () => string({ nonEmpty: true, max: NAME });

/** `number | string`, which is what a ruleset-derived value is allowed to be. */
function numberOrText(): Schema<number | string> {
  const asText = text(NAME);
  return {
    check: (value, path): Result<number | string> =>
      typeof value === 'number' ? number().check(value, path) : asText.check(value, path),
  };
}

const VISIBILITY = ['public', 'party', 'private', 'dm-only', 'secret'] as const;
/* ── Leaf shapes ────────────────────────────────────────────────────────────── */

const healthTrack = (strict: boolean): Schema<HealthTrack> =>
  object(
    {
      current: number({ int: true, min: -100_000, max: 100_000 }),
      max: number({ int: true, min: 0, max: 100_000 }),
      temporary: number({ int: true, min: 0, max: 100_000 }),
    },
    { strict },
  );

const attribute = (strict: boolean): Schema<Attribute> =>
  object(
    {
      key: string({ nonEmpty: true, max: TOKEN }),
      label: label(),
      value: number({ min: -1000, max: 1000 }),
      modifier: optional(number({ min: -1000, max: 1000 })),
    },
    { strict },
  );

const derivedValue = (strict: boolean): Schema<DerivedValue> =>
  object(
    {
      key: string({ nonEmpty: true, max: TOKEN }),
      label: label(),
      value: numberOrText(),
      explanation: optional(text(TEXT)),
      overridden: optional(boolean()),
    },
    { strict },
  );

const resourcePool = (strict: boolean): Schema<ResourcePool> =>
  object(
    {
      key: string({ nonEmpty: true, max: TOKEN }),
      label: label(),
      max: number({ int: true, min: 0, max: 10_000 }),
      used: number({ int: true, min: 0, max: 10_000 }),
      tier: optional(text(TOKEN)),
    },
    { strict },
  );

const condition = (strict: boolean): Schema<Condition> =>
  object(
    {
      id: id<ConditionId>(),
      key: string({ nonEmpty: true, max: TOKEN }),
      label: label(),
      tone: oneOf(['neutral', 'buff', 'debuff', 'concentration', 'danger']),
      duration: optional(text(TOKEN)),
      source: optional(text(NAME)),
    },
    { strict },
  );

const deathSaves = (strict: boolean): Schema<DeathSaves> =>
  object(
    {
      successes: number({ int: true, min: 0, max: 10 }),
      failures: number({ int: true, min: 0, max: 10 }),
    },
    { strict },
  );

/* ── People and campaigns ───────────────────────────────────────────────────── */

export const userSchema = (strict: boolean): Schema<User> =>
  object({ id: id<UserId>(), displayName: label() }, { strict });

export const gameSystemSchema = (strict: boolean): Schema<GameSystem> =>
  object(
    {
      id: id<GameSystemId>(),
      name: label(),
      summary: text(TEXT),
      status: oneOf(['ready', 'unavailable']),
      unavailableReason: optional(text(TEXT)),
    },
    { strict },
  );

const campaignMember = (strict: boolean): Schema<CampaignMember> =>
  object(
    {
      userId: id<UserId>(),
      role: oneOf(['dm', 'player']),
      characterId: optional(id<CharacterId>()),
    },
    { strict },
  );

export const campaignSchema = (strict: boolean): Schema<Campaign> =>
  object(
    {
      id: id<CampaignId>(),
      name: label(),
      systemId: id<GameSystemId>(),
      dmUserId: id<UserId>(),
      inviteCode: string({ nonEmpty: true, max: TOKEN }),
      members: arrayOf(campaignMember(strict), { max: MAX.members }),
      createdAt: timestamp(),
    },
    { strict },
  );

/* ── Characters ─────────────────────────────────────────────────────────────── */

export const characterSchema = (strict: boolean): Schema<Character> =>
  object(
    {
      id: id<CharacterId>(),
      systemId: id<GameSystemId>(),
      campaignId: optional(id<CampaignId>()),
      ownerUserId: id<UserId>(),
      name: label(),
      subtitle: text(NAME),
      archetype: optional(text(NAME)),
      level: number({ int: true, min: 0, max: 1000 }),
      attributes: arrayOf(attribute(strict), { max: MAX.attributes }),
      resources: arrayOf(resourcePool(strict), { max: MAX.resources }),
      health: healthTrack(strict),
      conditions: arrayOf(condition(strict), { max: MAX.conditions }),
      sectionVisibility: recordOf(oneOf(VISIBILITY)),
      draft: optional(
        object(
          {
            step: number({ int: true, min: 0, max: 1000 }),
            totalSteps: number({ int: true, min: 0, max: 1000 }),
          },
          { strict },
        ),
      ),
      pendingLevelUp: optional(boolean()),
      systemData: recordOf(unknownValue()),
    },
    { strict },
  );

export const characterDraftSchema = (strict: boolean): Schema<CharacterDraft> =>
  object(
    {
      id: id<CharacterDraftId>(),
      systemId: id<GameSystemId>(),
      ownerUserId: id<UserId>(),
      campaignId: optional(id<CampaignId>()),
      name: text(NAME),
      choices: recordOf(unknownValue()),
      stepId: string({ nonEmpty: true, max: TOKEN }),
      updatedAt: timestamp(),
    },
    { strict },
  );

/* ── Monsters ───────────────────────────────────────────────────────────────── */

const monsterAction = (strict: boolean): Schema<MonsterAction> =>
  object(
    {
      name: label(),
      description: text(TEXT),
      attackBonus: optional(text(TOKEN)),
      damage: optional(text(TOKEN)),
      rolls: optional(
        arrayOf(
          object(
            { label: label(), expression: string({ nonEmpty: true, max: TOKEN }) },
            { strict },
          ),
          { max: MAX.rolls },
        ),
      ),
      tags: optional(arrayOf(text(TOKEN), { max: MAX.tags })),
      tier: optional(text(TOKEN)),
    },
    { strict },
  );

const monsterActionGroup = (strict: boolean): Schema<MonsterActionGroup> =>
  object(
    {
      key: string({ nonEmpty: true, max: TOKEN }),
      label: label(),
      note: optional(text(NAME)),
      entries: arrayOf(monsterAction(strict), { max: MAX.actions }),
    },
    { strict },
  );

export const monsterSchema = (strict: boolean): Schema<Monster> =>
  object(
    {
      id: id<MonsterId>(),
      systemId: id<GameSystemId>(),
      name: label(),
      subtitle: text(NAME),
      // Not coerced and not defaulted: `origin` decides whether a record is ingested
      // reference content or a user's own, and the server overrides it on every write.
      origin: oneOf(['library', 'homebrew']),
      ownerUserId: optional(id<UserId>()),
      clonedFrom: optional(id<MonsterId>()),
      challengeLabel: text(TOKEN),
      challengeRank: number({ min: 0, max: 1000 }),
      source: text(NAME),
      facets: recordOf(arrayOf(text(TOKEN), { max: MAX.facetValues })),
      attributes: arrayOf(attribute(strict), { max: MAX.attributes }),
      health: healthTrack(strict),
      derived: arrayOf(derivedValue(strict), { max: MAX.attributes }),
      traits: arrayOf(monsterAction(strict), { max: MAX.traits }),
      actionGroups: arrayOf(monsterActionGroup(strict), { max: MAX.actionGroups }),
      systemData: recordOf(unknownValue()),
    },
    { strict },
  );

/* ── Encounters and combat ──────────────────────────────────────────────────── */

const encounterEntry = (strict: boolean): Schema<EncounterEntry> =>
  object(
    {
      id: id(),
      monsterId: id<MonsterId>(),
      count: number({ int: true, min: 0, max: 1000 }),
      hidden: optional(boolean()),
    },
    { strict },
  );

export const encounterSchema = (strict: boolean): Schema<EncounterTemplate> =>
  object(
    {
      id: id<EncounterTemplateId>(),
      campaignId: id<CampaignId>(),
      name: text(NAME),
      location: optional(text(NAME)),
      entries: arrayOf(encounterEntry(strict), { max: MAX.entries }),
      absentCharacterIds: optional(arrayOf(id<CharacterId>(), { max: MAX.absent })),
      notes: optional(text(TEXT)),
      updatedAt: optional(timestamp()),
      lastRunAt: optional(timestamp()),
    },
    { strict },
  );

const participantSource = (strict: boolean): Schema<CombatParticipant['source']> => {
  const asCharacter = object(
    { kind: oneOf(['character']), characterId: id<CharacterId>() },
    { strict },
  );
  const asMonster = object({ kind: oneOf(['monster']), monsterId: id<MonsterId>() }, { strict });
  return {
    check: (value, path): Result<CombatParticipant['source']> => {
      const kind = (value as { kind?: unknown } | null)?.kind;
      if (kind === 'character')
        return asCharacter.check(value, path) as Result<CombatParticipant['source']>;
      if (kind === 'monster')
        return asMonster.check(value, path) as Result<CombatParticipant['source']>;
      return {
        ok: false,
        issues: [{ path: `${path}.kind`, message: 'must be character or monster' }],
      };
    },
  };
};

const combatParticipant = (strict: boolean): Schema<CombatParticipant> =>
  object(
    {
      id: id<ParticipantId>(),
      name: label(),
      subtitle: text(NAME),
      entityType: oneOf(['player', 'monster', 'npc', 'ally']),
      initiative: nullable(number({ int: true, min: -1000, max: 1000 })),
      health: healthTrack(strict),
      conditions: arrayOf(condition(strict), { max: MAX.conditions }),
      state: oneOf(['active', 'waiting', 'unconscious', 'defeated']),
      deathSaves: optional(deathSaves(strict)),
      // Never coerced and never defaulted: this is what decides whether a player's device
      // is told a creature exists.
      visibility: oneOf(VISIBILITY),
      targeted: optional(boolean()),
      groupKey: optional(text(TOKEN)),
      source: participantSource(strict),
    },
    { strict },
  );

export const combatSchema = (strict: boolean): Schema<CombatInstance> =>
  object(
    {
      id: id<CombatInstanceId>(),
      campaignId: id<CampaignId>(),
      encounterTemplateId: optional(id<EncounterTemplateId>()),
      name: text(NAME),
      location: optional(text(NAME)),
      status: oneOf(['preparing', 'live', 'ended']),
      round: number({ int: true, min: 0, max: 100_000 }),
      activeParticipantId: nullable(id<ParticipantId>()),
      participants: arrayOf(combatParticipant(strict), { max: MAX.participants }),
      startedAt: optional(timestamp()),
      endedAt: optional(timestamp()),
      /*
       * The optimistic-concurrency version.
       *
       * Absent here until TC-P08, and a response schema drops what it does not declare — so
       * every combat the browser parsed came back without one, `expectedVersion: version ?? 0`
       * sent 0 every time, and the *second* command of any session was refused as stale
       * forever. Every server-side test passed throughout: they never went through this
       * schema. It took two browsers driving a real fight to see it.
       *
       * Optional because `CombatInstance` types it optional — a fixture-built fight has no
       * version and does not need one.
       */
      version: optional(number({ int: true, min: 0, max: 2_000_000_000 })),
    },
    { strict },
  );

/* ── Dice ───────────────────────────────────────────────────────────────────── */

const rolledDie = (strict: boolean): Schema<RolledDie> =>
  object(
    {
      sides: number({ int: true, min: 1, max: 1000 }),
      value: number({ int: true, min: -1000, max: 1000 }),
      dropped: optional(boolean()),
    },
    { strict },
  );

export const rollSchema = (strict: boolean): Schema<Roll> =>
  object(
    {
      id: id<RollId>(),
      combatId: optional(id<CombatInstanceId>()),
      actor: text(NAME),
      title: text(NAME),
      expression: text(TOKEN),
      mode: oneOf(['normal', 'advantage', 'disadvantage']),
      dice: arrayOf(rolledDie(strict), { max: MAX.dice }),
      modifier: number({ int: true, min: -10_000, max: 10_000 }),
      total: number({ int: true, min: -1_000_000, max: 1_000_000 }),
      outcome: oneOf(['normal', 'critical', 'fumble']),
      // A player claiming `dm-only` is a valid request that the authorization layer answers
      // by recording it as `party`. Validation says the value is a visibility; it does not
      // say the caller may use it.
      visibility: oneOf(VISIBILITY),
      at: timestamp(),
    },
    { strict },
  );

/* ── Home feeds ─────────────────────────────────────────────────────────────── */

export const recentSchema = (strict: boolean): Schema<RecentItem> =>
  object(
    {
      id: id(),
      kind: oneOf(['campaign', 'character', 'monster', 'encounter', 'combat', 'spell']),
      label: label(),
      href: string({ nonEmpty: true, max: NAME }),
      at: timestamp(),
    },
    { strict },
  );

export const activitySchema = (strict: boolean): Schema<CampaignActivity> =>
  object(
    {
      id: id(),
      campaignId: id<CampaignId>(),
      kind: oneOf([
        'levelled',
        'level-up-pending',
        'privacy-changed',
        'character-edited',
        'character-created',
      ]),
      summary: text(NAME),
      detail: text(NAME),
      characterId: optional(id<CharacterId>()),
      at: timestamp(),
    },
    { strict },
  );

/* ── Request bodies ─────────────────────────────────────────────────────────── */

/**
 * Credentials.
 *
 * A password is bounded but never trimmed, lower-cased or otherwise touched: the only safe
 * transformation of a secret is none. The ceiling is there so a request cannot make the
 * server do unbounded scrypt work, not because a long password is suspicious.
 */
export const signInSchema = object(
  {
    email: string({ nonEmpty: true, max: 320 }),
    password: string({ nonEmpty: true, max: 1024 }),
  },
  { strict: true },
);

export const signUpSchema = object(
  {
    email: string({ nonEmpty: true, max: 320 }),
    password: string({ nonEmpty: true, max: 1024 }),
    displayName: string({ nonEmpty: true, max: 80 }),
  },
  { strict: true },
);

/** A body that must be present and must be empty — a POST that carries only its path. */
/**
 * What an account holder may change about themselves.
 *
 * Deliberately one field. An email change is a re-verification flow and a password change is
 * a credential flow; neither is Phase 1, and neither should arrive as an over-post on this
 * route — `strict` is what refuses them rather than a silent drop.
 */
export const updateSelfSchema = object(
  { displayName: string({ nonEmpty: true, max: 80 }) },
  { strict: true },
);

export const emptyBodySchema = object({}, { strict: true });

export const createCampaignSchema: Schema<CreateCampaignInput> = object(
  {
    name: string({ nonEmpty: true, max: NAME }),
    systemId: id<GameSystemId>(),
    // Accepted so the existing client body validates, and then ignored: the server assigns
    // the signed-in account as the DM. Documented in `authorize.ts`.
    dmUserId: id<UserId>(),
  },
  { strict: true },
);

export const attachCharacterSchema = object({ campaignId: id<CampaignId>() }, { strict: true });

export const cloneMonsterSchema = object(
  { ownerUserId: id<UserId>(), ownerName: string({ nonEmpty: true, max: NAME }) },
  { strict: true },
);

export const createEncounterSchema = object(
  { campaignId: id<CampaignId>(), name: string({ nonEmpty: true, max: NAME }) },
  { strict: true },
);

export const createDraftSchema: Schema<CreateDraftInput> = object(
  {
    systemId: id<GameSystemId>(),
    ownerUserId: id<UserId>(),
    campaignId: optional(id<CampaignId>()),
    name: optional(text(NAME)),
  },
  { strict: true },
);

/* ── Response shapes, by route ──────────────────────────────────────────────── */

/**
 * Lenient, because a response comes from a deployment that may be ahead of this build.
 * `lazy` so the module can be imported from either side without paying to construct every
 * schema up front — a player's phone loading their combat screen builds two of these.
 */
export const RESPONSE = {
  user: lazy(() => userSchema(false)),
  users: lazy(() => arrayOf(userSchema(false), { max: 1000 })),
  gameSystems: lazy(() => arrayOf(gameSystemSchema(false), { max: 100 })),
  campaign: lazy(() => campaignSchema(false)),
  campaigns: lazy(() => arrayOf(campaignSchema(false), { max: 1000 })),
  character: lazy(() => characterSchema(false)),
  characters: lazy(() => arrayOf(characterSchema(false), { max: 1000 })),
  monster: lazy(() => monsterSchema(false)),
  monsters: lazy(() => arrayOf(monsterSchema(false), { max: 5000 })),
  count: lazy(() => number({ int: true, min: 0 })),
  encounter: lazy(() => encounterSchema(false)),
  encounters: lazy(() => arrayOf(encounterSchema(false), { max: 1000 })),
  combat: lazy(() => combatSchema(false)),
  combatOutcome: lazy(() => combatOutcomeSchema),
  combats: lazy(() => arrayOf(combatSchema(false), { max: 1000 })),
  roll: lazy(() => rollSchema(false)),
  rolls: lazy(() => arrayOf(rollSchema(false), { max: 5000 })),
  draft: lazy(() => characterDraftSchema(false)),
  drafts: lazy(() => arrayOf(characterDraftSchema(false), { max: 1000 })),
  recents: lazy(() => arrayOf(recentSchema(false), { max: 1000 })),
  activity: lazy(() => arrayOf(activitySchema(false), { max: 1000 })),
} as const;

/** Wraps a response schema so a `null` answer — a record that is absent — stays valid. */
export function maybe<T>(schema: Schema<T>): Schema<T | null> {
  return {
    check: (value, path) =>
      value === null ? { ok: true, value: null } : schema.check(value, path),
  };
}

/* ── Combat commands ────────────────────────────────────────────────────────── */

/**
 * The command union, validated by its `kind`.
 *
 * Strict, like every request shape: a command carrying a field its kind does not name is an
 * over-post and is refused. Nothing here is coerced — an amount that is not a whole positive
 * number is a refusal, not a rounding, because it becomes hit points.
 */
const PARTICIPANT_LIST = 512;

const commandShapes: Record<string, Schema<unknown>> = {
  'combat.begin': object({ kind: oneOf(['combat.begin']) }, { strict: true }),
  'combat.end': object({ kind: oneOf(['combat.end']) }, { strict: true }),
  'combat.reopen': object({ kind: oneOf(['combat.reopen']) }, { strict: true }),

  'turn.next': object({ kind: oneOf(['turn.next']) }, { strict: true }),
  'turn.previous': object({ kind: oneOf(['turn.previous']) }, { strict: true }),
  'turn.resort': object({ kind: oneOf(['turn.resort']) }, { strict: true }),
  'turn.jump': object(
    { kind: oneOf(['turn.jump']), participantId: id<ParticipantId>() },
    { strict: true },
  ),
  'turn.move': object(
    {
      kind: oneOf(['turn.move']),
      participantId: id<ParticipantId>(),
      direction: oneOf(['earlier', 'later']),
    },
    { strict: true },
  ),

  'initiative.set': object(
    {
      kind: oneOf(['initiative.set']),
      participantIds: arrayOf(id<ParticipantId>(), { max: PARTICIPANT_LIST }),
      value: nullable(number({ int: true, min: -1000, max: 1000 })),
    },
    { strict: true },
  ),
  'initiative.roll': object(
    { kind: oneOf(['initiative.roll']), onlyMissing: boolean() },
    { strict: true },
  ),

  'health.damage': object(
    {
      kind: oneOf(['health.damage']),
      participantId: id<ParticipantId>(),
      amount: number({ int: true, min: 1, max: 100_000 }),
    },
    { strict: true },
  ),
  'health.heal': object(
    {
      kind: oneOf(['health.heal']),
      participantId: id<ParticipantId>(),
      amount: number({ int: true, min: 1, max: 100_000 }),
    },
    { strict: true },
  ),
  'health.override': object(
    {
      kind: oneOf(['health.override']),
      participantId: id<ParticipantId>(),
      current: number({ int: true, min: 0, max: 100_000 }),
    },
    { strict: true },
  ),
  'state.override': object(
    {
      kind: oneOf(['state.override']),
      participantId: id<ParticipantId>(),
      state: oneOf(['active', 'waiting', 'unconscious', 'defeated']),
    },
    { strict: true },
  ),

  'condition.add': object(
    {
      kind: oneOf(['condition.add']),
      participantId: id<ParticipantId>(),
      key: string({ nonEmpty: true, max: TOKEN }),
      duration: optional(text(TOKEN)),
    },
    { strict: true },
  ),
  'condition.remove': object(
    {
      kind: oneOf(['condition.remove']),
      participantId: id<ParticipantId>(),
      key: string({ nonEmpty: true, max: TOKEN }),
    },
    { strict: true },
  ),

  'target.set': object(
    { kind: oneOf(['target.set']), participantId: id<ParticipantId>() },
    { strict: true },
  ),
  'deathSave.roll': object(
    { kind: oneOf(['deathSave.roll']), participantId: id<ParticipantId>() },
    { strict: true },
  ),

  'participant.rename': object(
    {
      kind: oneOf(['participant.rename']),
      participantId: id<ParticipantId>(),
      name: string({ nonEmpty: true, max: NAME }),
    },
    { strict: true },
  ),
  'participant.visibility': object(
    {
      kind: oneOf(['participant.visibility']),
      participantIds: arrayOf(id<ParticipantId>(), { max: PARTICIPANT_LIST }),
      visibility: oneOf(VISIBILITY),
    },
    { strict: true },
  ),
  'participant.remove': object(
    {
      kind: oneOf(['participant.remove']),
      participantIds: arrayOf(id<ParticipantId>(), { max: PARTICIPANT_LIST }),
    },
    { strict: true },
  ),

  undo: object(
    { kind: oneOf(['undo']), seq: number({ int: true, min: 1, max: 1_000_000 }) },
    { strict: true },
  ),
};

export const combatCommandSchema = object(
  {
    /** The caller's id for this attempt. A retry carries the same one. */
    commandId: string({ nonEmpty: true, max: 128 }),
    /** The revision the caller was working from. A stale one is refused, never merged. */
    expectedVersion: number({ int: true, min: 0, max: 1_000_000_000 }),
    command: taggedUnion('kind', commandShapes),
  },
  { strict: true },
);

/** What a command answers with: the authoritative fight, and what it did. */
export const combatOutcomeSchema = object(
  {
    combat: combatSchema(false),
    seq: number({ int: true, min: 0 }),
    summary: optional(text(NAME)),
    replayed: optional(boolean()),
    concentration: optional(
      object(
        { participantId: id<ParticipantId>(), damage: number({ int: true }) },
        { strict: false },
      ),
    ),
    deathSave: optional(
      object(
        {
          outcome: oneOf(['stable', 'dead', 'pending']),
          revived: boolean(),
          total: number({ int: true }),
        },
        { strict: false },
      ),
    ),
  },
  { strict: false },
);
