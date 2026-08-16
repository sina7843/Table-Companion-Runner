/**
 * Running the turn order.
 *
 * `combat.participants` is the order. It is sorted once when the fight begins and from
 * then on it is the record of who acts when — a DM who moves someone up has made a ruling,
 * and re-deriving the order from initiative every render would silently undo it. Changing
 * a number therefore does not reorder anything until `resortByInitiative` is asked for.
 *
 * Every function is a pure transform of a `CombatInstance`. None of them can name an
 * `EncounterTemplate`, which is what keeps a running fight off the encounter it came from.
 */
import type { CombatInstance, CombatParticipant, ParticipantId, Ruleset } from '../index.ts';

/** Where the turn is, or -1 when nobody is on it. */
export function turnIndex(combat: CombatInstance): number {
  return combat.participants.findIndex(
    (participant) => participant.id === combat.activeParticipantId,
  );
}

export function activeParticipant(combat: CombatInstance): CombatParticipant | null {
  return combat.participants.find((entry) => entry.id === combat.activeParticipantId) ?? null;
}

/**
 * Who acts next, stated in words so a DM can queue what they say while still resolving
 * this turn. Defeated combatants are skipped; an unconscious one still has death saves.
 */
export function nextParticipant(combat: CombatInstance): CombatParticipant | null {
  const from = turnIndex(combat);
  if (from < 0 || combat.participants.length === 0) return combat.participants[0] ?? null;

  for (let step = 1; step <= combat.participants.length; step += 1) {
    const candidate = combat.participants[(from + step) % combat.participants.length];
    if (candidate && candidate.state !== 'defeated') return candidate;
  }
  return null;
}

function withTurnOn(
  combat: CombatInstance,
  participant: CombatParticipant | null,
  round: number,
): CombatInstance {
  return {
    ...combat,
    round,
    activeParticipantId: participant?.id ?? null,
    participants: combat.participants.map((entry) =>
      entry.state === 'defeated' || entry.state === 'unconscious'
        ? entry
        : { ...entry, state: entry.id === participant?.id ? 'active' : 'waiting' },
    ),
  };
}

/**
 * The next turn, and the next round when the order wraps.
 *
 * A defeated combatant is stepped over rather than given a turn to pass on. If every
 * survivor is defeated the fight stays where it is instead of looping forever.
 */
export function nextTurn(combat: CombatInstance): CombatInstance {
  if (combat.participants.length === 0) return combat;

  const from = turnIndex(combat);
  if (from < 0)
    return withTurnOn(combat, combat.participants[0] ?? null, Math.max(1, combat.round));

  for (let step = 1; step <= combat.participants.length; step += 1) {
    const index = (from + step) % combat.participants.length;
    const candidate = combat.participants[index];
    if (!candidate || candidate.state === 'defeated') continue;
    // Passing position 0 is a new round, which is the only place the round moves forward.
    const wrapped = from + step >= combat.participants.length;
    return withTurnOn(combat, candidate, wrapped ? combat.round + 1 : combat.round);
  }

  return combat;
}

/**
 * The turn before this one. Correcting a misclick, not rewinding the fight — the round
 * never goes below 1, so stepping back from the top of round 1 stays put.
 */
export function previousTurn(combat: CombatInstance): CombatInstance {
  if (combat.participants.length === 0) return combat;

  const from = turnIndex(combat);
  if (from < 0) return combat;

  const size = combat.participants.length;
  for (let step = 1; step <= size; step += 1) {
    const raw = from - step;
    const candidate = combat.participants[((raw % size) + size) % size];
    if (!candidate || candidate.state === 'defeated') continue;

    const wrapped = raw < 0;
    if (wrapped && combat.round <= 1) return combat;
    return withTurnOn(combat, candidate, wrapped ? combat.round - 1 : combat.round);
  }

  return combat;
}

/** Puts the turn on a specific combatant, for a DM who says "actually, you first". */
export function jumpToTurn(combat: CombatInstance, participantId: ParticipantId): CombatInstance {
  const target = combat.participants.find((entry) => entry.id === participantId);
  return target ? withTurnOn(combat, target, Math.max(1, combat.round)) : combat;
}

/**
 * Moves a combatant one place through the order.
 *
 * The DM's ruling wins: this changes where someone acts without touching what they rolled,
 * because "you readied, go after them" is not a new initiative.
 */
export function moveParticipant(
  combat: CombatInstance,
  participantId: ParticipantId,
  delta: -1 | 1,
): CombatInstance {
  const from = combat.participants.findIndex((entry) => entry.id === participantId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= combat.participants.length) return combat;

  const participants = [...combat.participants];
  const [moved] = participants.splice(from, 1);
  if (!moved) return combat;
  participants.splice(to, 0, moved);

  return { ...combat, participants };
}

/** Re-derives the order from the numbers. Explicit, because it discards manual moves. */
export function resortByInitiative(combat: CombatInstance, rules: Ruleset): CombatInstance {
  return { ...combat, participants: rules.initiativeOrder(combat.participants) };
}

export function setInitiativeDuringCombat(
  combat: CombatInstance,
  participantIds: ParticipantId[],
  value: number | null,
): CombatInstance {
  const ids = new Set<string>(participantIds);
  return {
    ...combat,
    participants: combat.participants.map((entry) =>
      ids.has(entry.id) ? { ...entry, initiative: value } : entry,
    ),
  };
}

/** True when the order no longer matches the numbers, so the DM can be offered a re-sort. */
export function orderDiffersFromInitiative(combat: CombatInstance, rules: Ruleset): boolean {
  const sorted = rules.initiativeOrder(combat.participants);
  return sorted.some((entry, index) => entry.id !== combat.participants[index]?.id);
}

/** Ends the fight. Kept here so no screen has to know what an ended combat looks like. */
export function endCombat(combat: CombatInstance, endedAt: string): CombatInstance {
  return {
    ...combat,
    status: 'ended',
    activeParticipantId: null,
    participants: combat.participants.map((entry) =>
      entry.state === 'active' ? { ...entry, state: 'waiting' } : entry,
    ),
    endedAt,
  };
}
