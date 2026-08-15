/**
 * Turning a prepared encounter into a running fight.
 *
 * Every function here transforms a `CombatInstance` and returns a new one. None of them
 * takes an `EncounterTemplate`, which is the point: once a fight exists there is no path
 * from the runtime back to the thing it was prepared as, and that is enforced by the type
 * signatures rather than by remembering.
 */
import type {
  Attribute,
  CombatInstance,
  CombatParticipant,
  ParticipantId,
  RandomSource,
  Ruleset,
  Visibility,
} from '../../domain';

/** One row of the setup list. Identical creatures share a row and a turn. */
export interface ParticipantGroup {
  /** Stable across renders: the shared group key, or the participant's own id. */
  key: string;
  name: string;
  members: CombatParticipant[];
  /** The shared initiative, or null when the members disagree or none has rolled. */
  initiative: number | null;
}

export function groupParticipants(combat: CombatInstance): ParticipantGroup[] {
  const groups: ParticipantGroup[] = [];

  for (const participant of combat.participants) {
    const key = participant.groupKey ?? participant.id;
    const held = groups.find((group) => group.key === key);
    if (held) held.members.push(participant);
    else groups.push({ key, name: participant.name, members: [participant], initiative: null });
  }

  for (const group of groups) {
    const values = new Set(group.members.map((member) => member.initiative));
    group.initiative = values.size === 1 ? (group.members[0]?.initiative ?? null) : null;

    // A grouped row is named for what it contains, not for its first member.
    if (group.members.length > 1) {
      const base = group.members[0]?.name.replace(/\s+#\d+$/, '') ?? group.name;
      group.name = `${base} ×${group.members.length}`;
    }
  }

  return groups;
}

function patch(
  combat: CombatInstance,
  ids: Set<string>,
  change: (participant: CombatParticipant) => CombatParticipant,
): CombatInstance {
  return {
    ...combat,
    participants: combat.participants.map((participant) =>
      ids.has(participant.id) ? change(participant) : participant,
    ),
  };
}

/**
 * Initiative for a whole row at once.
 *
 * Identical creatures take one group turn, so they hold one number. Setting it per member
 * is what expanding the row is for.
 */
export function setInitiative(
  combat: CombatInstance,
  participantIds: ParticipantId[],
  value: number | null,
): CombatInstance {
  return patch(combat, new Set<string>(participantIds), (participant) => ({
    ...participant,
    initiative: value,
  }));
}

export function renameParticipant(
  combat: CombatInstance,
  participantId: ParticipantId,
  name: string,
): CombatInstance {
  return patch(combat, new Set<string>([participantId]), (participant) => ({
    ...participant,
    name,
  }));
}

export function setVisibility(
  combat: CombatInstance,
  participantIds: ParticipantId[],
  visibility: Visibility,
): CombatInstance {
  return patch(combat, new Set<string>(participantIds), (participant) => ({
    ...participant,
    visibility,
  }));
}

/** Takes combatants out of this fight. The template still has them. */
export function removeParticipants(
  combat: CombatInstance,
  participantIds: ParticipantId[],
): CombatInstance {
  const ids = new Set<string>(participantIds);
  return {
    ...combat,
    participants: combat.participants.filter((participant) => !ids.has(participant.id)),
    activeParticipantId: ids.has(combat.activeParticipantId ?? '')
      ? null
      : combat.activeParticipantId,
  };
}

/**
 * Rolls for every row that has not got a number yet.
 *
 * One roll per row, not per creature: eight goblins acting on eight separate counts is
 * the thing grouping exists to prevent. `onlyMissing` is false when the DM asks to
 * re-roll the lot.
 */
export function rollInitiative(
  combat: CombatInstance,
  rules: Ruleset,
  attributesFor: (participant: CombatParticipant) => Attribute[],
  random: RandomSource,
  onlyMissing = true,
): CombatInstance {
  let next = combat;

  for (const group of groupParticipants(combat)) {
    if (onlyMissing && group.initiative !== null) continue;

    const first = group.members[0];
    if (!first) continue;

    const request = rules.initiativeRequest(first, attributesFor(first));
    // A system without initiative rolls leaves the number to the DM rather than
    // inventing one.
    if (!request) continue;

    const rolled = rules.evaluateRoll(request, 0, random);
    next = setInitiative(
      next,
      group.members.map((member) => member.id),
      rolled.total,
    );
  }

  return next;
}

/** What the DM should know before starting. Nothing here blocks except an empty fight. */
export interface SetupIssue {
  severity: 'blocking' | 'warning';
  message: string;
}

export function setupIssues(combat: CombatInstance): SetupIssue[] {
  const issues: SetupIssue[] = [];

  if (combat.participants.length === 0) {
    issues.push({ severity: 'blocking', message: 'Nobody is in this fight' });
    return issues;
  }

  const unrolled = groupParticipants(combat).filter((group) => group.initiative === null);
  if (unrolled.length > 0) {
    issues.push({
      severity: 'warning',
      message: `${unrolled.length} ${unrolled.length === 1 ? 'row has' : 'rows have'} no initiative yet and will act last`,
    });
  }

  if (!combat.participants.some((participant) => participant.entityType === 'player')) {
    issues.push({ severity: 'warning', message: 'No characters are in this fight' });
  }

  return issues;
}

/**
 * Round 1.
 *
 * Minimal ceremony by design: sort into the order the ruleset decides, put the first
 * combatant on turn, and go. No dialog — the DM already pressed the button that said
 * this, and a fight that started by accident is one click from being left.
 */
export function beginCombat(
  combat: CombatInstance,
  rules: Ruleset,
  startedAt: string,
): CombatInstance {
  const ordered = rules.initiativeOrder(combat.participants);
  const first = ordered.find((participant) => participant.state !== 'defeated') ?? ordered[0];

  return {
    ...combat,
    status: 'live',
    round: 1,
    participants: ordered.map((participant) => ({
      ...participant,
      state: participant.id === first?.id ? 'active' : 'waiting',
    })),
    activeParticipantId: first?.id ?? null,
    startedAt,
  };
}
