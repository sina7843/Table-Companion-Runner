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
import { listGameSystems } from '../ruleset/registry.ts';
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
  CreateCampaignInput,
  CreateDraftInput,
  MonsterQuery,
  Repositories,
} from './repositories.ts';

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
    if (needle && !monster.name.toLowerCase().includes(needle)) return false;
  }
  return true;
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
        const matched = MONSTERS.filter((monster) => matchesMonsterQuery(monster, query)).toSorted(
          (a, b) => a.name.localeCompare(b.name),
        );
        return resolve(query?.limit ? matched.slice(0, query.limit) : matched);
      },
      byId: (monsterId: MonsterId) =>
        resolve(MONSTERS.find((monster) => monster.id === monsterId) ?? null),
      count: (query?: MonsterQuery) =>
        resolve(MONSTERS.filter((monster) => matchesMonsterQuery(monster, query)).length),
    },

    encounters: {
      listForCampaign: (campaignId: CampaignId) =>
        resolve(ENCOUNTERS.filter((encounter) => encounter.campaignId === campaignId)),
      byId: (encounterId: EncounterTemplateId) =>
        resolve(ENCOUNTERS.find((encounter) => encounter.id === encounterId) ?? null),
    },

    combats: {
      liveForCampaign: (campaignId: CampaignId) =>
        resolve(
          COMBATS.find((combat) => combat.campaignId === campaignId && combat.status === 'live') ??
            null,
        ),
      liveForUser: (userId: UserId) => {
        const mine = new Set(
          CAMPAIGNS.filter((campaign) =>
            campaign.members.some((member) => member.userId === userId),
          ).map((campaign) => campaign.id),
        );
        return resolve(
          COMBATS.find((combat) => combat.status === 'live' && mine.has(combat.campaignId)) ?? null,
        );
      },
      listForCampaign: (campaignId: CampaignId) =>
        resolve(COMBATS.filter((combat) => combat.campaignId === campaignId)),
      byId: (combatId: CombatInstanceId) =>
        resolve(COMBATS.find((combat) => combat.id === combatId) ?? null),
    },

    rolls: {
      listForCombat: (combatId: CombatInstanceId) =>
        resolve(
          ROLLS.filter((roll) => roll.combatId === combatId).toSorted((a, b) =>
            b.at.localeCompare(a.at),
          ),
        ),
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
