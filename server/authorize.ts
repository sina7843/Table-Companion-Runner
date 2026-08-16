/**
 * Server-side authorization: one wrapper, every rule, no exceptions.
 *
 * `createAuthorizedRepositories` decorates the PostgreSQL store with the identity of whoever
 * made the request. Route handlers stay exactly as they were and cannot forget a check,
 * because there is nowhere for them to forget it — the only `Repositories` they are ever
 * handed is a wrapped one. This is the same shape as `withRealtime.ts` on the client, applied
 * to a different concern.
 *
 * Three properties worth stating plainly:
 *
 * 1. **A role is read from the database, never from the request.** `roleIn` resolves a
 *    campaign's DM and members from stored rows. Nothing a client sends can claim a role.
 * 2. **Refusal shape follows the contract.** Where a method is typed `T | null`, a record the
 *    caller may not have reads as `null` — indistinguishable from one that does not exist, so
 *    probing ids tells an attacker nothing. Everywhere else it is a 403.
 * 3. **The visibility rules are the ones the client already has.** `visibleParticipants`,
 *    `visibleRolls` and `canSeeCharacterSection` come from `src/domain/permissions.ts`, so
 *    the DM's screen and the player's device cannot disagree with the server about what a
 *    secret roll is. The difference is that here they are *enforced*: the data is removed
 *    before it is serialised, not after it arrives.
 */
import {
  canSeeCharacterSection,
  viewerFor,
  visibleParticipants,
  visibleRolls,
  type Viewer,
} from '../src/domain/permissions.ts';
import type {
  Campaign,
  CampaignId,
  Character,
  CharacterDraft,
  CharacterDraftId,
  CharacterId,
  CharacterSectionKey,
  CombatInstance,
  CombatInstanceId,
  EncounterTemplateId,
  Monster,
  MonsterId,
  Roll,
  UserId,
} from '../src/domain/types.ts';
import type {
  CreateCampaignInput,
  CreateDraftInput,
  MonsterQuery,
  Repositories,
} from '../src/domain/data/repositories.ts';
import { StoreError } from './store.ts';
import { canPlayerIssue } from '../src/domain/combat/commands.ts';

const denied = (what: string) => new StoreError(403, `You do not have access to ${what}.`);

/**
 * A fight as one viewer is allowed to receive it.
 *
 * An unrevealed creature is absent from a player's payload, not dimmed in it. The predicate
 * is the one the player's own screen uses, applied before serialisation rather than after.
 */
function filterCombat(combat: CombatInstance, viewer: Viewer): CombatInstance {
  if (viewer.role === 'dm') return combat;
  return { ...combat, participants: visibleParticipants(viewer, combat.participants) };
}

/** Sections whose data the core can attribute to a field without asking the ruleset. */
const RULESET_SECTIONS: CharacterSectionKey[] = ['actions', 'inventory', 'features', 'background'];

/**
 * What a viewer who is neither the owner nor the DM is allowed to receive.
 *
 * `sectionVisibility` decides which *tabs* a sheet renders, but the data behind the hidden
 * ones lives in `systemData`, which is a ruleset-owned bag the core deliberately cannot read.
 * So the redaction is coarse: hide one ruleset-backed section and the whole bag goes, leaving
 * the always-shared block — who this is, how hurt they are, what is on them.
 *
 * ponytail: coarse on purpose. Per-section redaction of `systemData` needs a
 * `Ruleset.redactCharacter(character, hidden)` seam, because only the adapter knows which
 * keys feed which section. Add it if a screen ever needs a party-mate's partially-hidden
 * sheet; until then over-redacting is the safe direction to be wrong in, and the only cost is
 * that a character who hides anything shows co-players their always-shared block alone.
 */
function redactCharacter(character: Character, viewer: Viewer): Character {
  if (viewer.role === 'dm' || character.ownerUserId === viewer.userId) return character;

  const visible = (section: CharacterSectionKey) =>
    canSeeCharacterSection(viewer, character, section);

  const redacted: Character = { ...character };
  if (!visible('abilities')) redacted.attributes = [];
  if (!RULESET_SECTIONS.every(visible)) {
    redacted.resources = [];
    redacted.systemData = {};
  }
  // A draft is a half-built character and nobody else's business.
  delete redacted.draft;
  return redacted;
}

export interface Actor {
  userId: UserId;
}

/**
 * What a signed-out caller can reach: nothing but the routes that exist to sign them in.
 *
 * Built as a proxy rather than as a hand-written object of refusals, so a repository added
 * later is refused by having said nothing — the same default-closed shape as `Route.anonymous`.
 */
const denySignedOut = () => Promise.reject(new StoreError(401, 'You are not signed in.'));

function anonymousRepositories(auth: Repositories['auth']): Repositories {
  const refuseEverything = new Proxy({}, { get: () => denySignedOut });
  return new Proxy({} as Repositories, {
    get: (_target, property) => (property === 'auth' ? auth : refuseEverything),
  });
}

export function createAuthorizedRepositories(
  repos: Repositories,
  actor: Actor | null,
): Repositories {
  if (!actor) return anonymousRepositories(repos.auth);
  const me = actor.userId;

  // One request, one cache. Membership is read from stored rows and asked for repeatedly by
  // the filters below; re-reading a campaign per participant would be the obvious way to
  // make this correct and slow.
  const campaignCache = new Map<string, Promise<Campaign | null>>();
  const campaignOf = (campaignId: CampaignId): Promise<Campaign | null> => {
    const cached = campaignCache.get(campaignId);
    if (cached) return cached;
    const read = repos.campaigns.byId(campaignId);
    campaignCache.set(campaignId, read);
    return read;
  };

  /** The viewer's role in a campaign, or null when they are not in it at all. */
  async function roleIn(campaignId: CampaignId): Promise<Viewer | null> {
    const campaign = await campaignOf(campaignId);
    if (!campaign) return null;
    if (campaign.dmUserId === me) return { userId: me, role: 'dm' };
    return campaign.members.some((member) => member.userId === me) ? viewerFor(campaign, me) : null;
  }

  async function requireMember(campaignId: CampaignId, what: string): Promise<Viewer> {
    const viewer = await roleIn(campaignId);
    if (!viewer) throw denied(what);
    return viewer;
  }

  async function requireDm(campaignId: CampaignId, what: string): Promise<Viewer> {
    const viewer = await requireMember(campaignId, what);
    if (viewer.role !== 'dm') throw denied(what);
    return viewer;
  }

  const mine = (userId: UserId, what: string): void => {
    if (userId !== me) throw denied(what);
  };

  /** Everyone the viewer shares a campaign with, plus themselves. The user directory is not public. */
  async function visibleUserIds(): Promise<Set<string>> {
    const campaigns = await repos.campaigns.listForUser(me);
    const ids = new Set<string>([me]);
    for (const campaign of campaigns) {
      ids.add(campaign.dmUserId);
      for (const member of campaign.members) ids.add(member.userId);
    }
    return ids;
  }

  /** A monster is readable when it is library content or the viewer's own homebrew. */
  const readableMonster = (monster: Monster): boolean =>
    monster.origin === 'library' || monster.ownerUserId === me;

  async function ownedMonster(monsterId: MonsterId, what: string): Promise<Monster> {
    const monster = await repos.monsters.byId(monsterId);
    if (!monster) throw new StoreError(404, 'That creature no longer exists.');
    if (monster.origin === 'library' || monster.ownerUserId !== me) throw denied(what);
    return monster;
  }

  async function readableCombat(combatId: CombatInstanceId): Promise<CombatInstance | null> {
    const combat = await repos.combats.byId(combatId);
    if (!combat) return null;
    const viewer = await roleIn(combat.campaignId);
    return viewer ? filterCombat(combat, viewer) : null;
  }

  /** Participant ids in this fight that are played by a character the viewer owns. */
  async function ownedParticipantIds(combat: CombatInstance): Promise<Set<string>> {
    const owned = new Set<string>();
    for (const participant of combat.participants) {
      if (participant.source.kind !== 'character') continue;
      const character = await repos.characters.byId(participant.source.characterId);
      if (character?.ownerUserId === me) owned.add(participant.id);
    }
    return owned;
  }

  return {
    // Handled at the HTTP boundary, before this wrapper exists. Passed through so the shape
    // of `Repositories` is satisfied by exactly one object.
    auth: repos.auth,

    users: {
      current: () => repos.users.current(),
      byId: async (userId: UserId) => {
        if (userId !== me && !(await visibleUserIds()).has(userId)) return null;
        return repos.users.byId(userId);
      },
      byIds: async (userIds: UserId[]) => {
        const allowed = await visibleUserIds();
        return repos.users.byIds(userIds.filter((userId) => allowed.has(userId)));
      },
    },

    gameSystems: repos.gameSystems,

    campaigns: {
      listForUser: (userId: UserId) => {
        mine(userId, "another account's campaigns");
        return repos.campaigns.listForUser(userId);
      },
      byId: async (campaignId: CampaignId) =>
        (await roleIn(campaignId)) ? campaignOf(campaignId) : null,
      // The creator is the DM, and the creator is whoever is signed in. A `dmUserId` in the
      // body is ignored rather than trusted.
      create: (input: CreateCampaignInput) => repos.campaigns.create({ ...input, dmUserId: me }),
      // Any signed-in account may redeem a code; whether the code means anything is the
      // store's question, and it answers the same way for a wrong one and a spent one.
      acceptInvite: (code: string) => repos.campaigns.acceptInvite(code),
    },

    characters: {
      listForCampaign: async (campaignId: CampaignId) => {
        const viewer = await requireMember(campaignId, 'that campaign');
        const roster = await repos.characters.listForCampaign(campaignId);
        return roster.map((character) => redactCharacter(character, viewer));
      },
      listForOwner: (userId: UserId) => {
        mine(userId, "another account's characters");
        return repos.characters.listForOwner(userId);
      },
      listUnattached: (userId: UserId) => {
        mine(userId, "another account's characters");
        return repos.characters.listUnattached(userId);
      },
      byId: async (characterId: CharacterId) => {
        const character = await repos.characters.byId(characterId);
        if (!character) return null;
        if (character.ownerUserId === me) return character;

        // Someone else's character is readable only through a campaign you are both in, and
        // only as much of it as they share.
        if (!character.campaignId) return null;
        const viewer = await roleIn(character.campaignId);
        return viewer ? redactCharacter(character, viewer) : null;
      },
      attachToCampaign: async (characterId: CharacterId, campaignId: CampaignId) => {
        const character = await repos.characters.byId(characterId);
        if (!character) throw new StoreError(404, 'That character no longer exists.');
        if (character.ownerUserId !== me) throw denied('that character');
        await requireMember(campaignId, 'that campaign');
        return repos.characters.attachToCampaign(characterId, campaignId);
      },
    },

    monsters: {
      // Library content is shared; homebrew is not. Filtering after the read rather than
      // pushing an owner scope into `MonsterQuery` keeps the client contract unchanged.
      // ponytail: fine at library scale — revisit when the library is not fifty rows.
      list: async (query?: MonsterQuery) =>
        (await repos.monsters.list(query)).filter(readableMonster),
      count: async (query?: MonsterQuery) =>
        (await repos.monsters.list({ ...query, limit: undefined })).filter(readableMonster).length,
      byId: async (monsterId: MonsterId) => {
        const monster = await repos.monsters.byId(monsterId);
        return monster && readableMonster(monster) ? monster : null;
      },
      // Ownership is assigned, not accepted: a body claiming someone else's id is overwritten.
      create: (monster: Monster) => repos.monsters.create({ ...monster, ownerUserId: me }),
      save: async (monster: Monster) => {
        await ownedMonster(monster.id, 'that creature');
        return repos.monsters.save({ ...monster, ownerUserId: me });
      },
      remove: async (monsterId: MonsterId) => {
        await ownedMonster(monsterId, 'that creature');
        return repos.monsters.remove(monsterId);
      },
      cloneFrom: async (sourceId: MonsterId, _ownerUserId: UserId, ownerName: string) => {
        const source = await repos.monsters.byId(sourceId);
        if (!source || !readableMonster(source)) {
          throw new StoreError(404, 'That creature no longer exists.');
        }
        return repos.monsters.cloneFrom(sourceId, me, ownerName);
      },
    },

    // Encounters are a DM surface end to end: the template carries `notes`, which the domain
    // documents as "DM-only setup notes, never sent to a player device". A player therefore
    // receives no encounter at all rather than a stripped one.
    encounters: {
      listForCampaign: async (campaignId: CampaignId) => {
        await requireDm(campaignId, "that campaign's encounters");
        return repos.encounters.listForCampaign(campaignId);
      },
      byId: async (encounterId: EncounterTemplateId) => {
        const encounter = await repos.encounters.byId(encounterId);
        if (!encounter) return null;
        const viewer = await roleIn(encounter.campaignId);
        return viewer?.role === 'dm' ? encounter : null;
      },
      create: async (input: { campaignId: CampaignId; name: string }) => {
        await requireDm(input.campaignId, "that campaign's encounters");
        return repos.encounters.create(input);
      },
      save: async (encounter) => {
        const stored = await repos.encounters.byId(encounter.id);
        if (!stored) throw new StoreError(404, 'That encounter no longer exists.');
        await requireDm(stored.campaignId, 'that encounter');
        // The campaign an encounter belongs to is not something a body may move.
        return repos.encounters.save({ ...encounter, campaignId: stored.campaignId });
      },
      remove: async (encounterId: EncounterTemplateId) => {
        const stored = await repos.encounters.byId(encounterId);
        if (!stored) return;
        await requireDm(stored.campaignId, 'that encounter');
        return repos.encounters.remove(encounterId);
      },
      duplicate: async (encounterId: EncounterTemplateId) => {
        const stored = await repos.encounters.byId(encounterId);
        if (!stored) throw new StoreError(404, 'That encounter no longer exists.');
        await requireDm(stored.campaignId, 'that encounter');
        return repos.encounters.duplicate(encounterId);
      },
    },

    combats: {
      liveForCampaign: async (campaignId: CampaignId) => {
        const viewer = await roleIn(campaignId);
        if (!viewer) return null;
        const combat = await repos.combats.liveForCampaign(campaignId);
        return combat ? filterCombat(combat, viewer) : null;
      },
      liveForUser: async (userId: UserId) => {
        mine(userId, "another account's combat");
        const combat = await repos.combats.liveForUser(userId);
        if (!combat) return null;
        const viewer = await roleIn(combat.campaignId);
        return viewer ? filterCombat(combat, viewer) : null;
      },
      listForCampaign: async (campaignId: CampaignId) => {
        const viewer = await requireMember(campaignId, "that campaign's combats");
        const combats = await repos.combats.listForCampaign(campaignId);
        return combats.map((combat) => filterCombat(combat, viewer));
      },
      byId: (combatId: CombatInstanceId) => readableCombat(combatId),

      startFromTemplate: async (encounterId: EncounterTemplateId) => {
        const encounter = await repos.encounters.byId(encounterId);
        if (!encounter) throw new StoreError(404, 'That encounter no longer exists.');
        await requireDm(encounter.campaignId, 'that encounter');
        return repos.combats.startFromTemplate(encounterId);
      },

      /**
       * A command, checked against who is asking before the authority applies it.
       *
       * TC-P02 had to compare the fight a client sent against the one it was shown, because a
       * whole-record write does not say what it meant. A command does, so the check is a
       * question about the intent — `canPlayerIssue` — rather than a diff of the result. It is
       * shorter, and it cannot be fooled by a change nobody looked for.
       */
      command: async (input) => {
        const stored = await repos.combats.byId(input.combatId);
        if (!stored) throw new StoreError(404, 'That combat no longer exists.', 'not_found');
        const viewer = await requireMember(stored.campaignId, 'that combat');

        if (viewer.role !== 'dm') {
          const verdict = canPlayerIssue(
            input.command,
            stored,
            await ownedParticipantIds(stored),
          );
          if (!verdict.allowed) {
            throw new StoreError(403, 'That change is the DM to make, not yours.', 'forbidden');
          }
        }

        const outcome = await repos.combats.command(input);
        // The fight comes back filtered the same way a read is: a player is told what their
        // own command did to the part of the fight they can see, and nothing more.
        return { ...outcome, combat: filterCombat(outcome.combat, viewer) };
      },
    },

    rolls: {
      listForCombat: async (combatId: CombatInstanceId) => {
        const combat = await repos.combats.byId(combatId);
        if (!combat) return [];
        const viewer = await roleIn(combat.campaignId);
        if (!viewer) throw denied('that combat');
        // A secret roll is removed here, not hidden on arrival.
        return visibleRolls(viewer, await repos.rolls.listForCombat(combatId));
      },
      record: async (roll: Roll) => {
        if (!roll.combatId) throw new StoreError(400, 'A roll must belong to a combat.');
        const combat = await repos.combats.byId(roll.combatId);
        if (!combat) throw new StoreError(404, 'That combat no longer exists.');
        const viewer = await requireMember(combat.campaignId, 'that combat');

        // Rolling in secret is a DM privilege the design gives them explicitly. A player's
        // roll happened at the table whatever their device claims.
        const visibility = viewer.role === 'dm' ? roll.visibility : 'party';
        return repos.rolls.record({ ...roll, visibility });
      },
    },

    drafts: {
      listForOwner: (userId: UserId) => {
        mine(userId, "another account's drafts");
        return repos.drafts.listForOwner(userId);
      },
      byId: async (draftId: CharacterDraftId) => {
        const draft = await repos.drafts.byId(draftId);
        return draft?.ownerUserId === me ? draft : null;
      },
      create: (input: CreateDraftInput) => repos.drafts.create({ ...input, ownerUserId: me }),
      save: async (draft: CharacterDraft) => {
        const stored = await repos.drafts.byId(draft.id);
        if (stored && stored.ownerUserId !== me) throw denied('that draft');
        return repos.drafts.save({ ...draft, ownerUserId: me });
      },
      discard: async (draftId: CharacterDraftId) => {
        const stored = await repos.drafts.byId(draftId);
        if (stored && stored.ownerUserId !== me) throw denied('that draft');
        return repos.drafts.discard(draftId);
      },
      finalise: async (draftId: CharacterDraftId, character: Character) => {
        const stored = await repos.drafts.byId(draftId);
        if (!stored) throw new StoreError(404, 'That draft no longer exists.');
        if (stored.ownerUserId !== me) throw denied('that draft');
        return repos.drafts.finalise(draftId, { ...character, ownerUserId: me });
      },
    },

    recents: {
      listForUser: (userId: UserId, limit?: number) => {
        mine(userId, "another account's history");
        return repos.recents.listForUser(userId, limit);
      },
    },

    activity: {
      listForUser: (userId: UserId, limit?: number) => {
        mine(userId, "another account's activity");
        return repos.activity.listForUser(userId, limit);
      },
    },
  };
}
