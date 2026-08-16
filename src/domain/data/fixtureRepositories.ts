/**
 * In-memory repository implementations backed by the fixtures.
 *
 * Deliberately dumb: filter, sort, resolve. No caching, no optimistic updates, no
 * subscription machinery — those belong with the real transport in TC-13, and building
 * them now would mean guessing at an API that does not exist yet.
 *
 * Every method returns a Promise, so no caller can depend on synchronous delivery.
 *
 * Writes mutate the module-level fixture arrays, which means they survive navigation but
 * not a page reload. That is the honest ceiling of a fixture layer: enough to make the
 * create-campaign and attach-character flows real to use, not a substitute for a store.
 * The `?scenario=` worlds are built by filtering these same arrays, so a write made in
 * one scenario is visible in another until the page reloads.
 */
import { listGameSystems, requireRuleset } from '../ruleset/registry.ts';
import { applyCommand, restoreParticipant, type ParticipantRestore } from '../combat/commands.ts';
import { id } from '../types.ts';
import type {
  Campaign,
  CampaignId,
  Character,
  CharacterDraft,
  CharacterDraftId,
  CharacterId,
  CombatInstance,
  CombatInstanceId,
  CombatParticipant,
  EncounterTemplate,
  EncounterTemplateId,
  Monster,
  MonsterId,
  Roll,
  User,
  UserId,
} from '../types.ts';
import {
  ACTIVITY as ALL_ACTIVITY,
  CAMPAIGNS as ALL_CAMPAIGNS,
  CHARACTERS as ALL_CHARACTERS,
  COMBATS as ALL_COMBATS,
  CURRENT_USER_ID,
  ENCOUNTERS as ALL_ENCOUNTERS,
  MONSTERS as ALL_MONSTERS,
  RECENTS as ALL_RECENTS,
  ROLLS,
  USERS,
} from './fixtures.ts';
import type {
  CombatCommandInput,
  CombatCommandOutcome,
  CreateCampaignInput,
  CreateDraftInput,
  MonsterQuery,
  Repositories,
} from './repositories.ts';

/**
 * The audit history, fixture-side.
 *
 * Module scope for the same reason the fixture arrays are: writes survive navigation and not a
 * reload. Undo and replay read it, so both behave the way they do against a real server.
 */
interface FixtureEvent {
  seq: number;
  commandId: string;
  undo: ParticipantRestore | null;
  summary: string;
  undoneBy?: number;
}
const fixtureCombatEvents: Record<string, FixtureEvent[]> = {};

/** Which ruleset a fight is run under. The campaign says; the fixtures have exactly one. */
function campaignSystemFor(combat: CombatInstance) {
  const campaign = ALL_CAMPAIGNS.find((entry) => entry.id === combat.campaignId);
  return campaign?.systemId ?? listGameSystems()[0]!.id;
}

/**
 * Which world the fixtures describe.
 *
 * The screens have to handle a first-time user, an empty library, a slow network and a
 * failed read. Those are real branches in the UI, and a branch nobody can reach is a
 * branch nobody has checked — so the fixture layer can present each of them on demand.
 * `RepositoryProvider` reads `?scenario=` from the URL to pick one.
 */
export type FixtureScenario =
  /** The design's own world: a live fight, four characters, two campaigns. */
  | 'populated'
  /** A brand-new account: no campaigns, no characters, nothing running. */
  | 'first-time'
  /** Signed up, but nothing created yet in an existing campaign. */
  | 'empty'
  /** Never resolves, so the loading state stays on screen. */
  | 'loading'
  /** Every read rejects, so the recoverable error path renders. */
  | 'error';

export interface FixtureOptions {
  scenario?: FixtureScenario;
  /** Artificial latency in milliseconds, for eyeballing the loading state. */
  delayMs?: number;
}

class FixtureReadError extends Error {
  constructor() {
    // Phrased the way the design phrases errors: what happened, what is still safe, what
    // to do next — and never a word about the transport.
    super('The connection dropped while loading. Nothing has been lost.');
    this.name = 'FixtureReadError';
  }
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `new-${idCounter}`;
}

/**
 * A template detached from the store.
 *
 * Every nested array is rebuilt, so nothing a caller does to what it was handed can reach
 * the fixture behind it. This is the guarantee that lets a combat instance be built from a
 * template without the fight ever writing back into the fight it was prepared as.
 */
/** A fight detached from the store, participants and their conditions included. */
function copyCombat(combat: CombatInstance): CombatInstance {
  return {
    ...combat,
    participants: combat.participants.map((participant) => ({
      ...participant,
      health: { ...participant.health },
      conditions: participant.conditions.map((condition) => ({ ...condition })),
      ...(participant.deathSaves ? { deathSaves: { ...participant.deathSaves } } : {}),
    })),
  };
}

function copyTemplate(template: EncounterTemplate): EncounterTemplate {
  return {
    ...template,
    entries: template.entries.map((entry) => ({ ...entry })),
    ...(template.absentCharacterIds
      ? { absentCharacterIds: [...template.absentCharacterIds] }
      : {}),
  };
}

/**
 * Drafts persist to localStorage rather than a module array.
 *
 * Autosave that vanishes on reload is not autosave. A half-built character is exactly the
 * thing a user expects to survive closing a tab, so the fixture layer keeps it in the one
 * store a browser gives us for free. TC-13 moves this to the server; the interface does
 * not change when it does.
 */
const DRAFT_KEY = 'table-companion.drafts';
let memoryDrafts: CharacterDraft[] = [];

function loadDrafts(): CharacterDraft[] {
  if (typeof localStorage === 'undefined') return memoryDrafts;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as CharacterDraft[]) : [];
  } catch {
    // Corrupt or unavailable storage must not take the builder down with it.
    return memoryDrafts;
  }
}

function writeDrafts(drafts: CharacterDraft[]): void {
  memoryDrafts = drafts;
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
  } catch {
    // Quota or private-mode failures leave the in-memory copy authoritative for the
    // session, which is still better than losing the answer the user just gave.
  }
}

/**
 * Invite codes read like the design's `CRAGMAW-7742`: a word from the campaign name and
 * four digits. Not unguessable — a real one is minted server-side in TC-13, and this
 * must not become the thing that guards a campaign.
 */
function makeInviteCode(name: string): string {
  const word = (name.split(/\s+/).find((part) => part.length > 3) ?? name)
    .replaceAll(/[^a-z]/gi, '')
    .toUpperCase()
    .slice(0, 8);
  const digits = String(1000 + ((idCounter * 1327) % 9000));
  return `${word || 'CAMPAIGN'}-${digits}`;
}

function matchesMonsterQuery(monster: Monster, query?: MonsterQuery): boolean {
  if (!query) return true;
  if (query.origin && monster.origin !== query.origin) return false;

  if (query.search) {
    const needle = query.search.trim().toLowerCase();
    // Name and subtitle both: a DM typing "goblinoid" is searching as legitimately as one
    // typing "goblin".
    const haystack = `${monster.name} ${monster.subtitle}`.toLowerCase();
    if (needle && !haystack.includes(needle)) return false;
  }

  if (typeof query.challengeMin === 'number' && monster.challengeRank < query.challengeMin) {
    return false;
  }
  if (typeof query.challengeMax === 'number' && monster.challengeRank > query.challengeMax) {
    return false;
  }

  // Values within a facet are OR-ed, facets are AND-ed: picking Dragon and Undead widens
  // the result, adding a size narrows it.
  for (const [facet, wanted] of Object.entries(query.facets ?? {})) {
    if (wanted.length === 0) continue;
    const held = monster.facets[facet] ?? [];
    if (!wanted.some((value) => held.includes(value))) return false;
  }

  return true;
}

function sortMonsters(monsters: Monster[], sort: MonsterQuery['sort']): Monster[] {
  if (sort === 'name') return monsters.toSorted((a, b) => a.name.localeCompare(b.name));
  if (sort === 'challenge-asc') {
    return monsters.toSorted(
      (a, b) => a.challengeRank - b.challengeRank || a.name.localeCompare(b.name),
    );
  }
  // Descending by difficulty is the design's default — a DM picking an opponent is
  // shopping downward from "too hard".
  return monsters.toSorted(
    (a, b) => b.challengeRank - a.challengeRank || a.name.localeCompare(b.name),
  );
}

export function createFixtureRepositories(options: FixtureOptions = {}): Repositories {
  const { scenario = 'populated', delayMs = 0 } = options;

  /** Resolves on a microtask, so callers cannot depend on synchronous delivery. */
  const resolve = <T>(value: T): Promise<T> => {
    if (scenario === 'error') return Promise.reject(new FixtureReadError());
    if (scenario === 'loading') return new Promise<T>(() => {});
    if (delayMs > 0) return new Promise((done) => setTimeout(() => done(value), delayMs));
    return Promise.resolve(value);
  };

  // 'first-time' and 'empty' differ in what survives: a first-time user has no campaigns
  // at all, while 'empty' keeps the campaign and strips what lives inside it.
  const bare = scenario === 'first-time' || scenario === 'empty';
  const CAMPAIGNS = scenario === 'first-time' ? [] : ALL_CAMPAIGNS;
  const CHARACTERS = bare ? [] : ALL_CHARACTERS;
  const COMBATS = bare ? [] : ALL_COMBATS;
  const ENCOUNTERS = bare ? [] : ALL_ENCOUNTERS;
  const MONSTERS = bare ? [] : ALL_MONSTERS;
  const RECENTS = bare ? [] : ALL_RECENTS;
  const ACTIVITY = bare ? [] : ALL_ACTIVITY;

  return {
    // Fixtures have no credentials and check none. This is a development mode: signing in
    // hands back the demo world's user so the entry screens are usable without a server, and
    // it is emphatically not an authentication implementation. The real one is server-side
    // and there is no client half of it to double as this.
    auth: {
      signIn: () =>
        resolve(
          USERS.find((user) => user.id === CURRENT_USER_ID) ??
            ({ id: CURRENT_USER_ID, displayName: 'Unknown' } satisfies User),
        ),
      signUp: (input: { displayName: string }) => {
        const created: User = { id: id<'User'>(`u-${nextId()}`), displayName: input.displayName };
        USERS.push(created);
        return resolve(created);
      },
      signOut: () => resolve(undefined),
    },

    users: {
      current: () =>
        resolve(
          USERS.find((user) => user.id === CURRENT_USER_ID) ??
            ({ id: CURRENT_USER_ID, displayName: 'Unknown' } satisfies User),
        ),
      byId: (userId: UserId) => resolve(USERS.find((user) => user.id === userId) ?? null),
      byIds: (userIds: UserId[]) => {
        const wanted = new Set<string>(userIds);
        return resolve(USERS.filter((user) => wanted.has(user.id)));
      },
      updateSelf: (input: { displayName: string }) => {
        const index = USERS.findIndex((user) => user.id === CURRENT_USER_ID);
        if (index < 0) return Promise.reject(new Error('Not signed in.'));
        const next: User = { ...USERS[index]!, displayName: input.displayName.trim() };
        USERS[index] = next;
        return resolve(next);
      },
    },

    gameSystems: {
      list: () => resolve(listGameSystems()),
    },

    campaigns: {
      listForUser: (userId: UserId) =>
        resolve(
          CAMPAIGNS.filter((campaign) =>
            campaign.members.some((member) => member.userId === userId),
          ),
        ),
      byId: (campaignId: CampaignId) =>
        resolve(CAMPAIGNS.find((campaign) => campaign.id === campaignId) ?? null),
      create: (input: CreateCampaignInput) => {
        const campaign: Campaign = {
          id: id<'Campaign'>(`c-${nextId()}`),
          name: input.name,
          systemId: input.systemId,
          dmUserId: input.dmUserId,
          inviteCode: makeInviteCode(input.name),
          members: [{ userId: input.dmUserId, role: 'dm' }],
          createdAt: new Date().toISOString(),
        };
        ALL_CAMPAIGNS.push(campaign);
        return resolve(campaign);
      },
      acceptInvite: (code: string) => {
        const wanted = code.trim().toUpperCase();
        const campaign = ALL_CAMPAIGNS.find((entry) => entry.inviteCode.toUpperCase() === wanted);
        if (!campaign) {
          return Promise.reject(new Error('That invite code does not match a campaign.'));
        }
        if (!campaign.members.some((member) => member.userId === CURRENT_USER_ID)) {
          campaign.members.push({ userId: CURRENT_USER_ID, role: 'player' });
        }
        return resolve(campaign);
      },
    },

    characters: {
      listForCampaign: (campaignId: CampaignId) =>
        resolve(CHARACTERS.filter((character) => character.campaignId === campaignId)),
      listForOwner: (userId: UserId) =>
        resolve(CHARACTERS.filter((character) => character.ownerUserId === userId)),
      listUnattached: (userId: UserId) =>
        resolve(
          CHARACTERS.filter(
            (character) => character.ownerUserId === userId && character.campaignId === undefined,
          ),
        ),
      byId: (characterId: CharacterId) =>
        resolve(CHARACTERS.find((character) => character.id === characterId) ?? null),
      attachToCampaign: (characterId: CharacterId, campaignId: CampaignId) => {
        const character = ALL_CHARACTERS.find((entry) => entry.id === characterId);
        if (!character) return Promise.reject(new Error('That character no longer exists.'));

        // A link, not a move: the character keeps its owner and its own history.
        character.campaignId = campaignId;

        const campaign = ALL_CAMPAIGNS.find((entry) => entry.id === campaignId);
        const member = campaign?.members.find((entry) => entry.userId === character.ownerUserId);
        if (member) member.characterId = characterId;
        else if (campaign && campaign.dmUserId !== character.ownerUserId) {
          campaign.members.push({ userId: character.ownerUserId, role: 'player', characterId });
        }

        return resolve(character);
      },
    },

    monsters: {
      list: (query?: MonsterQuery) => {
        const matched = sortMonsters(
          MONSTERS.filter((monster) => matchesMonsterQuery(monster, query)),
          query?.sort,
        );
        return resolve(query?.limit ? matched.slice(0, query.limit) : matched);
      },
      byId: (monsterId: MonsterId) =>
        resolve(MONSTERS.find((monster) => monster.id === monsterId) ?? null),
      count: (query?: MonsterQuery) =>
        resolve(MONSTERS.filter((monster) => matchesMonsterQuery(monster, query)).length),

      create: (monster: Monster) => {
        // Writes always produce homebrew. Library content is ingested reference data, and
        // a DM must not be able to change what the book says by accident.
        const created: Monster = { ...monster, origin: 'homebrew' };
        ALL_MONSTERS.push(created);
        return resolve(created);
      },

      save: (monster: Monster) => {
        const index = ALL_MONSTERS.findIndex((entry) => entry.id === monster.id);
        if (index < 0) return Promise.reject(new Error('That creature no longer exists.'));
        if (ALL_MONSTERS[index]?.origin === 'library') {
          return Promise.reject(new Error('Library creatures cannot be edited. Clone it first.'));
        }
        const saved: Monster = { ...monster, origin: 'homebrew' };
        ALL_MONSTERS[index] = saved;
        return resolve(saved);
      },

      remove: (monsterId: MonsterId) => {
        const index = ALL_MONSTERS.findIndex((entry) => entry.id === monsterId);
        if (index >= 0 && ALL_MONSTERS[index]?.origin === 'homebrew') {
          ALL_MONSTERS.splice(index, 1);
        }
        return resolve(undefined);
      },

      cloneFrom: (sourceId: MonsterId, ownerUserId: UserId, ownerName: string) => {
        const source = ALL_MONSTERS.find((entry) => entry.id === sourceId);
        if (!source) return Promise.reject(new Error('That creature no longer exists.'));

        // A deep-enough copy that editing the clone cannot reach back into the original.
        const clone: Monster = {
          ...source,
          id: id<'Monster'>(`m-${nextId()}`),
          name: `${source.name} (copy)`,
          origin: 'homebrew',
          ownerUserId,
          source: ownerName,
          clonedFrom: source.id,
          facets: Object.fromEntries(
            Object.entries(source.facets).map(([facet, values]) => [facet, [...values]]),
          ),
          attributes: source.attributes.map((attribute) => ({ ...attribute })),
          health: { ...source.health },
          derived: source.derived.map((value) => ({ ...value })),
          traits: source.traits.map((trait) => ({ ...trait })),
          actionGroups: source.actionGroups.map((group) => ({
            ...group,
            entries: group.entries.map((entry) => ({ ...entry })),
          })),
        };

        ALL_MONSTERS.push(clone);
        return resolve(clone);
      },
    },

    encounters: {
      // Reads hand out copies. A template is the one record a combat instance is built
      // from, and a screen that mutated what it was handed would silently rewrite a
      // prepared fight — the bug this repository exists to make impossible.
      listForCampaign: (campaignId: CampaignId) =>
        resolve(
          ENCOUNTERS.filter((encounter) => encounter.campaignId === campaignId).map(copyTemplate),
        ),
      byId: (encounterId: EncounterTemplateId) => {
        const found = ENCOUNTERS.find((encounter) => encounter.id === encounterId);
        return resolve(found ? copyTemplate(found) : null);
      },

      create: (input: { campaignId: CampaignId; name: string }) => {
        const created: EncounterTemplate = {
          id: id<'EncounterTemplate'>(`e-${nextId()}`),
          campaignId: input.campaignId,
          name: input.name,
          entries: [],
          updatedAt: new Date().toISOString(),
        };
        ALL_ENCOUNTERS.push(created);
        return resolve(copyTemplate(created));
      },

      save: (encounter: EncounterTemplate) => {
        const index = ALL_ENCOUNTERS.findIndex((entry) => entry.id === encounter.id);
        if (index < 0) return Promise.reject(new Error('That encounter no longer exists.'));
        const saved = copyTemplate({ ...encounter, updatedAt: new Date().toISOString() });
        ALL_ENCOUNTERS[index] = saved;
        return resolve(copyTemplate(saved));
      },

      remove: (encounterId: EncounterTemplateId) => {
        const index = ALL_ENCOUNTERS.findIndex((entry) => entry.id === encounterId);
        if (index >= 0) ALL_ENCOUNTERS.splice(index, 1);
        return resolve(undefined);
      },

      duplicate: (encounterId: EncounterTemplateId) => {
        const source = ALL_ENCOUNTERS.find((entry) => entry.id === encounterId);
        if (!source) return Promise.reject(new Error('That encounter no longer exists.'));

        // Entries and absences are copied, not shared: editing the duplicate must not
        // reach back into the encounter it came from.
        const copy = copyTemplate({
          ...source,
          id: id<'EncounterTemplate'>(`e-${nextId()}`),
          name: `${source.name} (copy)`,
          updatedAt: new Date().toISOString(),
          // A copy has not been run, whatever the original has done.
          lastRunAt: undefined,
        });
        ALL_ENCOUNTERS.push(copy);
        return resolve(copyTemplate(copy));
      },
    },

    combats: {
      // A fight is the record that changes most, so reads hand out copies for the same
      // reason encounters do: nothing a screen holds may write to the store behind it.
      liveForCampaign: (campaignId: CampaignId) => {
        const found = COMBATS.find(
          (combat) => combat.campaignId === campaignId && combat.status === 'live',
        );
        return resolve(found ? copyCombat(found) : null);
      },
      liveForUser: (userId: UserId) => {
        const mine = new Set(
          CAMPAIGNS.filter((campaign) =>
            campaign.members.some((member) => member.userId === userId),
          ).map((campaign) => campaign.id),
        );
        const found = COMBATS.find(
          (combat) => combat.status === 'live' && mine.has(combat.campaignId),
        );
        return resolve(found ? copyCombat(found) : null);
      },
      listForCampaign: (campaignId: CampaignId) =>
        resolve(COMBATS.filter((combat) => combat.campaignId === campaignId).map(copyCombat)),
      byId: (combatId: CombatInstanceId) => {
        const found = COMBATS.find((combat) => combat.id === combatId);
        return resolve(found ? copyCombat(found) : null);
      },

      /**
       * The same command reducer the server runs, over an array.
       *
       * Deliberately not a simpler stand-in: a fixture whose combat rules differ from the
       * server's is a fixture that teaches a screen the wrong thing. Version, replay and
       * stale-version behaviour are all real here too, so the screens exercise the same
       * paths with no server at all.
       *
       * Note what is absent: no write to `ALL_ENCOUNTERS`. Runtime state has no path back to
       * the template, which is the guarantee the whole feature rests on.
       */
      command: (input: CombatCommandInput) => {
        const index = ALL_COMBATS.findIndex((entry) => entry.id === input.combatId);
        const stored = ALL_COMBATS[index];
        if (index < 0 || !stored) {
          return Promise.reject(new Error('That combat no longer exists.'));
        }

        const history = (fixtureCombatEvents[input.combatId] ??= []);
        const already = history.find((entry) => entry.commandId === input.commandId);
        if (already)
          return resolve({ combat: copyCombat(stored), seq: already.seq, replayed: true });

        const version = stored.version ?? 0;
        if (input.expectedVersion !== version) {
          return Promise.reject(
            new Error('This fight has moved on since you last saw it. Refresh and try again.'),
          );
        }

        try {
          const seq = history.length + 1;
          let next: CombatInstance;
          let undo: ParticipantRestore | null = null;
          let summary: string;
          let extra: Partial<CombatCommandOutcome> = {};

          const intent = input.command;
          if (intent.kind === 'undo') {
            const target = history.find((entry) => entry.seq === intent.seq);
            if (!target?.undo) throw new Error('That change cannot be undone.');
            if (target.undoneBy !== undefined)
              throw new Error('That change has already been undone.');
            next = restoreParticipant(stored, target.undo);
            summary = `Undid: ${target.summary}`;
            target.undoneBy = seq;
          } else {
            const result = applyCommand(stored, intent, {
              rules: requireRuleset(campaignSystemFor(stored)),
              now: new Date().toISOString(),
              random: Math.random,
              attributesFor: () => [],
            });
            next = result.combat;
            undo = result.undo;
            summary = result.summary;
            extra = {
              ...(result.concentration ? { concentration: result.concentration } : {}),
              ...(result.deathSave ? { deathSave: result.deathSave } : {}),
            };
          }

          const saved = copyCombat({ ...next, version: version + 1 });
          ALL_COMBATS[index] = saved;
          history.push({ seq, commandId: input.commandId, undo, summary });
          return resolve({ combat: copyCombat(saved), seq, summary, ...extra });
        } catch (error) {
          return Promise.reject(error instanceof Error ? error : new Error(String(error)));
        }
      },

      startFromTemplate: (encounterId: EncounterTemplateId) => {
        const template = ALL_ENCOUNTERS.find((entry) => entry.id === encounterId);
        if (!template) return Promise.reject(new Error('That encounter no longer exists.'));

        // Everything below reads the template and writes a new instance. The template
        // itself is never assigned to, which is what makes running it twice safe.
        const participants: CombatParticipant[] = [];

        for (const entry of template.entries) {
          const monster = ALL_MONSTERS.find((creature) => creature.id === entry.monsterId);
          if (!monster) continue;

          // Identical creatures share a group key so the initiative list can collapse
          // them into one row, and are numbered so the DM can still name one of them.
          const grouped = entry.count > 1;
          for (let index = 1; index <= entry.count; index += 1) {
            participants.push({
              id: id<'CombatParticipant'>(`p-${nextId()}`),
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
        for (const character of ALL_CHARACTERS.filter(
          (entry) => entry.campaignId === template.campaignId && !absent.has(entry.id),
        )) {
          participants.push({
            id: id<'CombatParticipant'>(`p-${nextId()}`),
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

        const combat: CombatInstance = {
          id: id<'CombatInstance'>(`cb-${nextId()}`),
          campaignId: template.campaignId,
          encounterTemplateId: template.id,
          name: template.name,
          ...(template.location ? { location: template.location } : {}),
          status: 'preparing',
          round: 0,
          activeParticipantId: null,
          participants,
          startedAt: new Date().toISOString(),
        };

        ALL_COMBATS.push(combat);

        // The template records that it has been run. That is a note about the template,
        // not a change to the fight it describes — the roster is untouched.
        const index = ALL_ENCOUNTERS.findIndex((entry) => entry.id === encounterId);
        if (index >= 0) {
          ALL_ENCOUNTERS[index] = copyTemplate({ ...template, lastRunAt: combat.startedAt });
        }

        return resolve(combat);
      },
    },

    rolls: {
      listForCombat: (combatId: CombatInstanceId) =>
        resolve(
          ROLLS.filter((roll) => roll.combatId === combatId)
            .toSorted((a, b) => b.at.localeCompare(a.at))
            .map((roll) => ({ ...roll, dice: roll.dice.map((die) => ({ ...die })) })),
        ),

      // Append only. A correction is a new line, never an edit to the one it corrects.
      record: (roll: Roll) => {
        const recorded: Roll = { ...roll, dice: roll.dice.map((die) => ({ ...die })) };
        ROLLS.push(recorded);
        return resolve({ ...recorded, dice: recorded.dice.map((die) => ({ ...die })) });
      },
    },

    drafts: {
      listForOwner: (userId: UserId) =>
        resolve(loadDrafts().filter((draft) => draft.ownerUserId === userId)),
      byId: (draftId: CharacterDraftId) =>
        resolve(loadDrafts().find((draft) => draft.id === draftId) ?? null),
      create: (input: CreateDraftInput) => {
        const draft: CharacterDraft = {
          id: id<'CharacterDraft'>(`draft-${nextId()}`),
          systemId: input.systemId,
          ownerUserId: input.ownerUserId,
          campaignId: input.campaignId,
          name: input.name ?? '',
          choices: { ruleset: input.systemId },
          stepId: 'ruleset',
          updatedAt: new Date().toISOString(),
        };
        writeDrafts([...loadDrafts(), draft]);
        return resolve(draft);
      },
      save: (draft: CharacterDraft) => {
        const stored = loadDrafts().filter((entry) => entry.id !== draft.id);
        const saved = { ...draft, updatedAt: new Date().toISOString() };
        writeDrafts([...stored, saved]);
        return resolve(saved);
      },
      discard: (draftId: CharacterDraftId) => {
        writeDrafts(loadDrafts().filter((draft) => draft.id !== draftId));
        return resolve(undefined);
      },
      finalise: (draftId: CharacterDraftId, character: Character) => {
        ALL_CHARACTERS.push(character);
        if (character.campaignId) {
          const campaign = ALL_CAMPAIGNS.find((entry) => entry.id === character.campaignId);
          const member = campaign?.members.find((entry) => entry.userId === character.ownerUserId);
          if (member) member.characterId = character.id;
        }
        writeDrafts(loadDrafts().filter((draft) => draft.id !== draftId));
        return resolve(character);
      },
    },

    recents: {
      listForUser: (_userId: UserId, limit = 7) =>
        resolve(RECENTS.toSorted((a, b) => b.at.localeCompare(a.at)).slice(0, limit)),
    },

    activity: {
      listForUser: (userId: UserId, limit = 4) => {
        const mine = new Set(
          CAMPAIGNS.filter((campaign) =>
            campaign.members.some((member) => member.userId === userId),
          ).map((campaign) => campaign.id),
        );
        return resolve(
          ACTIVITY.filter((entry) => mine.has(entry.campaignId))
            .toSorted((a, b) => b.at.localeCompare(a.at))
            .slice(0, limit),
        );
      },
    },
  };
}

/** Exported types the fixture layer resolves to, for tests and typed consumers. */
export type { Campaign, Character, CombatInstance, EncounterTemplate, Monster, Roll, User };
