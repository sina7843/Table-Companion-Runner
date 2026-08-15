/**
 * What the player's turn offers, and what it may see.
 *
 * Pure, so the two rules that matter most can be checked without a phone: a player never
 * sees a combatant the DM has not revealed, and the actions on the thumb are the
 * character's own — asked of the ruleset, not assembled here.
 */
import type { Ruleset } from '../../domain/ruleset/Ruleset.ts';
import type { Character, CombatInstance, CombatParticipant } from '../../domain/types.ts';
import { visibleParticipants, type Viewer } from '../../domain/permissions.ts';

/** Four targets is what a thumb reaches without the order below scrolling away. */
export const ACTIONS_ON_THE_THUMB = 4;

export interface QuickAction {
  key: string;
  /** The action's own name — "Longsword", not "Longsword attack". */
  name: string;
  label: string;
  expression: string;
  /** Which rollable entry it came from, so the damage roll can be found again. */
  entryKey: string;
}

/**
 * The character's rollable actions, flattened to one button each.
 *
 * Damage rolls are excluded: they follow their attack automatically, and a separate
 * button for one is how a player rolls damage for an attack that missed.
 */
export function quickActions(rules: Ruleset, character: Character): QuickAction[] {
  return (rules.sheetContent(character, 'actions').rollables ?? [])
    .flatMap((entry) =>
      (entry.rolls ?? []).map((roll) => ({
        key: `${entry.key}-${roll.label}`,
        name: entry.name,
        label: roll.label,
        expression: roll.expression,
        entryKey: entry.key,
      })),
    )
    .filter((entry) => entry.label !== 'Damage');
}

/** The damage that follows an attack, or null when the action does none. */
export function damageRollFor(
  rules: Ruleset,
  character: Character,
  entryKey: string,
): { label: string; expression: string } | null {
  return (
    (rules.sheetContent(character, 'actions').rollables ?? [])
      .find((entry) => entry.key === entryKey)
      ?.rolls?.find((roll) => roll.label === 'Damage') ?? null
  );
}

/**
 * The order as this device may know it.
 *
 * Absent, not hidden: a creature the DM has not revealed does not appear as a greyed row,
 * a count, or a gap — nothing on the screen may hint that a row was removed.
 */
export function playerOrder(combat: CombatInstance, viewer: Viewer): CombatParticipant[] {
  return visibleParticipants(viewer, combat.participants);
}

/** The participant this character is playing, if they are in this fight at all. */
export function ownParticipant(
  combat: CombatInstance,
  character: Character | null,
): CombatParticipant | null {
  if (!character) return null;
  return (
    combat.participants.find(
      (entry) => entry.source.kind === 'character' && entry.source.characterId === character.id,
    ) ?? null
  );
}

/** Below this share of the track, the screen says so rather than leaving it to be read. */
export const LOW_HEALTH_SHARE = 0.25;

export function isLowHealth(participant: CombatParticipant | null): boolean {
  if (!participant || participant.health.max <= 0) return false;
  return (
    participant.health.current > 0 &&
    participant.health.current <= participant.health.max * LOW_HEALTH_SHARE
  );
}

/** The auditable arithmetic behind a total, with a dropped die left out of the sum. */
export function breakdownOf(
  dice: { value: number; dropped?: boolean }[],
  modifier: number,
): string {
  const kept = dice.filter((die) => !die.dropped).map((die) => die.value);
  const sum = kept.join(' + ');
  if (modifier === 0) return sum;
  return `${sum} ${modifier > 0 ? '+' : '−'} ${Math.abs(modifier)}`;
}
