/**
 * What a DM does to a combatant.
 *
 * Damage, healing, targeting, conditions and death saves, as pure transforms of a
 * `CombatInstance`. Everything a rules system decides — how temporary hit points absorb a
 * hit, what a natural 20 on a death save does, whether concentration is a thing at all —
 * is asked of the ruleset rather than decided here.
 *
 * There is no approval step. The design is explicit that damage applies directly and that
 * correction comes through undo, so `applyHealth` returns what it changed and the screen
 * keeps the last one so it can be reversed by name.
 */
import type { ConditionDefinition, RollEvaluation, Ruleset } from '../../domain/ruleset/Ruleset.ts';
// The value import resolves at runtime, so it names the module rather than the directory:
// Node's ESM loader does not do directory resolution, and these transforms are tested.
import {
  id,
  type CombatInstance,
  type CombatParticipant,
  type Condition,
  type ParticipantId,
} from '../../domain/types.ts';

/** One reversible change, named so an undo can say what it will put back. */
export interface HealthChange {
  participantId: ParticipantId;
  name: string;
  delta: number;
  /** What the track read before, so undo restores rather than re-deriving. */
  before: CombatParticipant['health'];
  /** Death saves before, because dropping to zero clears them. */
  beforeSaves?: CombatParticipant['deathSaves'];
  beforeState: CombatParticipant['state'];
}

export interface HealthOutcome {
  combat: CombatInstance;
  change: HealthChange | null;
  /** Damage that landed on someone holding concentration, so the screen can prompt. */
  concentration: { participant: CombatParticipant; damage: number } | null;
}

function patch(
  combat: CombatInstance,
  participantId: ParticipantId,
  change: (participant: CombatParticipant) => CombatParticipant,
): CombatInstance {
  return {
    ...combat,
    participants: combat.participants.map((entry) =>
      entry.id === participantId ? change(entry) : entry,
    ),
  };
}

/**
 * The state a combatant is in once its hit points have moved.
 *
 * A character at zero is unconscious and starts rolling death saves; a creature at zero is
 * out of the fight. That distinction is the design's, and it is the reason the two states
 * look different on the row.
 */
function stateAfter(participant: CombatParticipant, health: CombatParticipant['health']) {
  if (health.current > 0) {
    return participant.state === 'unconscious' || participant.state === 'defeated'
      ? 'waiting'
      : participant.state;
  }
  return participant.entityType === 'player' ? 'unconscious' : 'defeated';
}

/** Positive heals, negative damages. The ruleset owns what temporary hit points absorb. */
export function applyHealth(
  combat: CombatInstance,
  participantId: ParticipantId,
  delta: number,
  rules: Ruleset,
): HealthOutcome {
  const participant = combat.participants.find((entry) => entry.id === participantId);
  if (!participant || delta === 0) return { combat, change: null, concentration: null };

  const health = rules.applyHealthDelta(participant.health, delta);
  const state = stateAfter(participant, health);

  const next = patch(combat, participantId, (entry) => ({
    ...entry,
    health,
    state,
    // Coming back up clears the tally; going down starts a fresh one.
    ...(health.current > 0
      ? { deathSaves: undefined }
      : state === 'unconscious' && !entry.deathSaves
        ? { deathSaves: { successes: 0, failures: 0 } }
        : {}),
  }));

  const taken = participant.health.current - health.current;
  const key = rules.concentrationKey();
  const holding =
    key !== null && taken > 0 && participant.conditions.some((entry) => entry.key === key);

  return {
    combat: next,
    change: {
      participantId,
      name: participant.name,
      delta,
      before: { ...participant.health },
      beforeSaves: participant.deathSaves ? { ...participant.deathSaves } : undefined,
      beforeState: participant.state,
    },
    concentration: holding ? { participant, damage: taken } : null,
  };
}

/** Puts a health track back exactly as it was. Undo restores, it does not recompute. */
export function revertHealth(combat: CombatInstance, change: HealthChange): CombatInstance {
  return patch(combat, change.participantId, (entry) => ({
    ...entry,
    health: { ...change.before },
    state: change.beforeState,
    deathSaves: change.beforeSaves ? { ...change.beforeSaves } : undefined,
  }));
}

/**
 * At most one combatant is targeted, because the target is what the next damage lands on
 * and "the next damage" is singular. Targeting the same one again clears it.
 */
export function setTargeted(
  combat: CombatInstance,
  participantId: ParticipantId | null,
): CombatInstance {
  return {
    ...combat,
    participants: combat.participants.map((entry) => {
      const wanted = entry.id === participantId && !entry.targeted;
      return wanted === Boolean(entry.targeted) ? entry : { ...entry, targeted: wanted };
    }),
  };
}

export function targetedParticipant(combat: CombatInstance): CombatParticipant | null {
  return combat.participants.find((entry) => entry.targeted) ?? null;
}

export function addCondition(
  combat: CombatInstance,
  participantId: ParticipantId,
  definition: ConditionDefinition,
  duration?: string,
): CombatInstance {
  return patch(combat, participantId, (entry) =>
    entry.conditions.some((condition) => condition.key === definition.key)
      ? entry
      : {
          ...entry,
          conditions: [
            ...entry.conditions,
            {
              id: id<'Condition'>(`c-${participantId}-${definition.key}`),
              key: definition.key,
              label: definition.label,
              tone: definition.tone,
              ...(duration ? { duration } : {}),
            } satisfies Condition,
          ],
        },
  );
}

export function removeCondition(
  combat: CombatInstance,
  participantId: ParticipantId,
  conditionKey: string,
): CombatInstance {
  return patch(combat, participantId, (entry) => ({
    ...entry,
    conditions: entry.conditions.filter((condition) => condition.key !== conditionKey),
  }));
}

export interface DeathSaveOutcome {
  combat: CombatInstance;
  outcome: 'stable' | 'dead' | 'pending';
  /** Set when the roll brought them back up, so the log can say so. */
  revived: boolean;
}

/**
 * One death save, resolved by the rules.
 *
 * The screen rolls and hands the evaluation over; what a natural 20 or a natural 1 means,
 * and when the tally is finished, are the system's to say.
 */
export function applyDeathSave(
  combat: CombatInstance,
  participantId: ParticipantId,
  roll: RollEvaluation,
  rules: Ruleset,
): DeathSaveOutcome {
  const participant = combat.participants.find((entry) => entry.id === participantId);
  if (!participant) return { combat, outcome: 'pending', revived: false };

  const result = rules.applyDeathSave(
    participant.deathSaves ?? { successes: 0, failures: 0 },
    roll,
  );

  const next = patch(combat, participantId, (entry) => ({
    ...entry,
    deathSaves: result.revivedAt === undefined ? result.saves : undefined,
    ...(result.revivedAt === undefined
      ? { state: result.outcome === 'dead' ? 'defeated' : entry.state }
      : {
          state: 'waiting',
          health: { ...entry.health, current: result.revivedAt },
        }),
  }));

  return { combat: next, outcome: result.outcome, revived: result.revivedAt !== undefined };
}
