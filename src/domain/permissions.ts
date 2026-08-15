/**
 * Who may see and do what.
 *
 * These are UI-layer guards: they decide what a screen renders, and they keep the
 * "hidden from the party" and "secret roll" rules in one place instead of scattered
 * through components. They are NOT a security boundary. When TC-13 introduces a real
 * server, the same rules have to be enforced there as well — a client that decides its
 * own permissions is a client that can be asked not to.
 */
import {
  id,
  type Campaign,
  type CampaignRole,
  type Character,
  type CharacterSectionKey,
  type CombatParticipant,
  type Roll,
  type UserId,
  type Visibility,
} from './types.ts';

export interface Viewer {
  userId: UserId;
  role: CampaignRole;
}

export function viewerFor(campaign: Campaign, userId: UserId): Viewer {
  return { userId, role: campaign.dmUserId === userId ? 'dm' : 'player' };
}

/** Default when a character section has no explicit setting. */
const DEFAULT_SECTION_VISIBILITY: Visibility = 'party';

/**
 * The single visibility test everything else is built from.
 *
 * `isOwner` matters because 'private' means "hidden from the other players", not
 * "hidden from me" — a player can always read their own hidden inventory.
 */
export function canSee(viewer: Viewer, visibility: Visibility, isOwner: boolean): boolean {
  // The DM retains full access to everything in their campaign. Phase 2's Personal Notes
  // are the one exception, and they are not modelled here precisely because they must be
  // inaccessible to the DM — they cannot be a Visibility value on this scale.
  if (viewer.role === 'dm') return true;

  switch (visibility) {
    case 'public':
    case 'party':
      return true;
    case 'private':
      return isOwner;
    case 'dm-only':
    case 'secret':
      return false;
  }
}

/** Whether a player may read one section of someone's character sheet. */
export function canSeeCharacterSection(
  viewer: Viewer,
  character: Character,
  section: CharacterSectionKey,
): boolean {
  const visibility = character.sectionVisibility[section] ?? DEFAULT_SECTION_VISIBILITY;
  return canSee(viewer, visibility, character.ownerUserId === viewer.userId);
}

/** Only the owning player and the DM may edit a character. */
export function canEditCharacter(viewer: Viewer, character: Character): boolean {
  return viewer.role === 'dm' || character.ownerUserId === viewer.userId;
}

/**
 * Whether a participant appears in this viewer's initiative order at all. An unrevealed
 * monster exists in the DM's order and is absent from every player device — not greyed
 * out, not hinted at.
 */
export function canSeeParticipant(viewer: Viewer, participant: CombatParticipant): boolean {
  return canSee(viewer, participant.visibility, false);
}

/** A secret roll reaches the DM only. A failed roll is never silently swallowed. */
export function canSeeRoll(viewer: Viewer, roll: Roll): boolean {
  return canSee(viewer, roll.visibility, false);
}

/** Turn order, damage, healing and combat lifecycle are the DM's. */
export function canControlCombat(viewer: Viewer): boolean {
  return viewer.role === 'dm';
}

/** A player may end their own turn; the DM may end anyone's. */
export function canEndTurn(
  viewer: Viewer,
  participant: CombatParticipant,
  owned: boolean,
): boolean {
  if (viewer.role === 'dm') return true;
  return owned && participant.state !== 'defeated';
}

/** Filters an initiative order down to what this viewer is allowed to know exists. */
export function visibleParticipants(
  viewer: Viewer,
  participants: CombatParticipant[],
): CombatParticipant[] {
  return participants.filter((participant) => canSeeParticipant(viewer, participant));
}

/**
 * Would a player device receive this roll?
 *
 * The DM's own log splits on exactly this test rather than on a list of its own, so the
 * rolls shown under "sent to the party" are literally the ones a player can see. A second
 * predicate here is how a secret roll eventually leaks: one of the two gets a new case.
 */
export function isPlayerVisibleRoll(roll: Roll): boolean {
  // A roll has no owner, so any player answers the same: only the role and the visibility
  // matter, which is what makes one shared predicate correct for every player device.
  return canSee(SOME_PLAYER, roll.visibility, false);
}

const SOME_PLAYER: Viewer = { role: 'player', userId: id<'User'>('any-player') };

/** Filters a roll log down to what this viewer is allowed to read. */
export function visibleRolls(viewer: Viewer, rolls: Roll[]): Roll[] {
  return rolls.filter((roll) => canSeeRoll(viewer, roll));
}
