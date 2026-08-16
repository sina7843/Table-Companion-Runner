/**
 * Combat as commands rather than as a document.
 *
 * Until TC-P04 a client sent the whole fight back and the server stored it, which meant every
 * device was trusted to do the arithmetic and the last one to write won. This file is the
 * replacement: a client says *what it is trying to do*, and the server works out what that
 * means. Hit points, turn order, death saves and conditions are computed here, from the stored
 * fight, by the same pure transforms the screens have always used.
 *
 * Three properties the rest of the system leans on:
 *
 * 1. **Nothing here names a game system.** Every rules question — what temporary hit points
 *    absorb, what a natural 20 on a death save does, what order initiative sorts in, which
 *    conditions exist — goes to the `Ruleset`. A command says "damage 12"; the adapter says
 *    what 12 damage does.
 * 2. **A command is pure.** `applyCommand` takes a fight and returns a fight. The database
 *    transaction, the version check and the audit row are the store's business, and this
 *    module is testable without any of them.
 * 3. **Dice that move state are rolled here**, from an injected `RandomSource`, so a client
 *    cannot report its own initiative or its own death save. Free-form log rolls are not in
 *    this file — they change no authoritative state, and the note at the end says so.
 */
import { id } from '../types.ts';
import type {
  Attribute,
  CombatInstance,
  CombatParticipant,
  Condition,
  DeathSaves,
  HealthTrack,
  ParticipantId,
  ParticipantState,
  Visibility,
} from '../types.ts';
import type { RandomSource, Ruleset } from '../ruleset/Ruleset.ts';
import {
  addCondition,
  applyDeathSave,
  applyHealth,
  overrideHealth,
  overrideState,
  removeCondition,
  reopenCombat,
  setTargeted,
} from './actions.ts';
import {
  beginCombat,
  removeParticipants,
  renameParticipant,
  rollInitiative,
  setInitiative,
  setVisibility,
} from './setup.ts';
import {
  endCombat,
  jumpToTurn,
  moveParticipant,
  nextTurn,
  previousTurn,
  resortByInitiative,
  setInitiativeDuringCombat,
} from './turns.ts';

/* ── The command surface ────────────────────────────────────────────────────── */

export type CombatCommand =
  /* Lifecycle — the DM's alone. */
  | { kind: 'combat.begin' }
  | { kind: 'combat.end' }
  | { kind: 'combat.reopen' }

  /* Turn order. */
  | { kind: 'turn.next' }
  | { kind: 'turn.previous' }
  | { kind: 'turn.jump'; participantId: ParticipantId }
  | { kind: 'turn.move'; participantId: ParticipantId; direction: 'earlier' | 'later' }
  | { kind: 'turn.resort' }

  /* Initiative. `initiative.roll` rolls on the server; a client never reports one. */
  | { kind: 'initiative.set'; participantIds: ParticipantId[]; value: number | null }
  | { kind: 'initiative.roll'; onlyMissing: boolean }

  /* Health. The amount is stated; what it does to the track is the ruleset's. */
  | { kind: 'health.damage'; participantId: ParticipantId; amount: number }
  | { kind: 'health.heal'; participantId: ParticipantId; amount: number }
  | { kind: 'health.override'; participantId: ParticipantId; current: number }
  | { kind: 'state.override'; participantId: ParticipantId; state: ParticipantState }

  /* Conditions, by the ruleset's own key. */
  | { kind: 'condition.add'; participantId: ParticipantId; key: string; duration?: string }
  | { kind: 'condition.remove'; participantId: ParticipantId; key: string }

  | { kind: 'target.set'; participantId: ParticipantId }

  /* Death saves. Rolled here, so a phone cannot decide it rolled a 20. */
  | { kind: 'deathSave.roll'; participantId: ParticipantId }

  /* Roster, before the fight starts. */
  | { kind: 'participant.rename'; participantId: ParticipantId; name: string }
  | { kind: 'participant.visibility'; participantIds: ParticipantId[]; visibility: Visibility }
  | { kind: 'participant.remove'; participantIds: ParticipantId[] }

  /* Undo. Resolved against the audit history, so the store owns it, not the reducer. */
  | { kind: 'undo'; seq: number };

export type CombatCommandKind = CombatCommand['kind'];

/** Every kind, for validation and for the tests that walk the surface. */
export const COMMAND_KINDS = [
  'combat.begin',
  'combat.end',
  'combat.reopen',
  'turn.next',
  'turn.previous',
  'turn.jump',
  'turn.move',
  'turn.resort',
  'initiative.set',
  'initiative.roll',
  'health.damage',
  'health.heal',
  'health.override',
  'state.override',
  'condition.add',
  'condition.remove',
  'target.set',
  'deathSave.roll',
  'participant.rename',
  'participant.visibility',
  'participant.remove',
  'undo',
] as const;

/* ── Undo ───────────────────────────────────────────────────────────────────── */

/**
 * Exactly what one participant looked like before a command touched them.
 *
 * Undo restores rather than recomputes — the same guarantee TC-11c's targeted undo gave, kept
 * because it is the only one that survives later changes. Restoring a whole-fight snapshot
 * would silently discard everything that happened after the event being undone.
 *
 * An event with no restore is not reversible, and the store refuses to undo it.
 */
export interface ParticipantRestore {
  participantId: ParticipantId;
  health: HealthTrack;
  state: ParticipantState;
  deathSaves?: DeathSaves;
  conditions: Condition[];
}

function snapshot(participant: CombatParticipant): ParticipantRestore {
  return {
    participantId: participant.id,
    health: { ...participant.health },
    state: participant.state,
    ...(participant.deathSaves ? { deathSaves: { ...participant.deathSaves } } : {}),
    conditions: participant.conditions.map((condition) => ({ ...condition })),
  };
}

/** Puts one participant back exactly as they were. The rest of the fight is untouched. */
export function restoreParticipant(
  combat: CombatInstance,
  restore: ParticipantRestore,
): CombatInstance {
  return {
    ...combat,
    participants: combat.participants.map((entry) => {
      if (entry.id !== restore.participantId) return entry;
      // The key is dropped rather than set to undefined, so a restored participant is the
      // same shape as one that never had a tally.
      const { deathSaves: _discarded, ...rest } = entry;
      return {
        ...rest,
        health: { ...restore.health },
        state: restore.state,
        conditions: restore.conditions.map((condition) => ({ ...condition })),
        ...(restore.deathSaves ? { deathSaves: { ...restore.deathSaves } } : {}),
      };
    }),
  };
}

/* ── Applying one ───────────────────────────────────────────────────────────── */

export interface CommandContext {
  rules: Ruleset;
  /** ISO-8601. Passed in rather than read, so a command is reproducible. */
  now: string;
  /** Injected, so the server rolls and a test can decide what came up. */
  random: RandomSource;
  /**
   * The attributes behind a participant, for an initiative roll. The server resolves these
   * from the character or creature; the reducer never reads a repository.
   */
  attributesFor: (participant: CombatParticipant) => Attribute[];
}

export interface CommandResult {
  combat: CombatInstance;
  /** What to restore to undo this, or null when it is not reversible. */
  undo: ParticipantRestore | null;
  /** One line, for the audit row and the combat log. Never a rules judgement of its own. */
  summary: string;
  /** Damage landed on someone concentrating; the screen may prompt. Advisory, not state. */
  concentration?: { participantId: ParticipantId; damage: number };
  /** How a death save came out, so the log can say. */
  deathSave?: { outcome: 'stable' | 'dead' | 'pending'; revived: boolean; total: number };
}

/** A command the current state cannot accept — an empty fight, a participant that left. */
export class CommandRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandRefused';
  }
}

const find = (combat: CombatInstance, participantId: ParticipantId): CombatParticipant => {
  const participant = combat.participants.find((entry) => entry.id === participantId);
  if (!participant) throw new CommandRefused('That combatant is no longer in this fight.');
  return participant;
};

const nameOf = (combat: CombatInstance, participantId: ParticipantId): string =>
  combat.participants.find((entry) => entry.id === participantId)?.name ?? 'a combatant';

/** Commands that only mean something once the fight is running. */
const LIVE_ONLY = new Set<CombatCommandKind>([
  'turn.next',
  'turn.previous',
  'turn.jump',
  'turn.resort',
  'deathSave.roll',
]);

/** Commands that only mean something before it starts. */
const PREPARING_ONLY = new Set<CombatCommandKind>([
  'combat.begin',
  'initiative.roll',
  'turn.move',
  'participant.rename',
  'participant.visibility',
  'participant.remove',
]);

/**
 * Applies one command to a fight.
 *
 * Throws `CommandRefused` when the fight's current state cannot accept it — an ended combat
 * cannot advance a turn, a preparing one has no turn to advance. That check lives here rather
 * than at the boundary because it is a question about the fight, not about the request.
 */
export function applyCommand(
  combat: CombatInstance,
  command: CombatCommand,
  context: CommandContext,
): CommandResult {
  if (combat.status === 'ended' && command.kind !== 'combat.reopen') {
    throw new CommandRefused('This fight has ended. Reopen it first.');
  }
  if (LIVE_ONLY.has(command.kind) && combat.status !== 'live') {
    throw new CommandRefused('This fight has not started yet.');
  }
  if (PREPARING_ONLY.has(command.kind) && combat.status !== 'preparing') {
    throw new CommandRefused('That can only be done before the fight begins.');
  }

  const { rules } = context;
  const plain = (next: CombatInstance, summary: string): CommandResult => ({
    combat: next,
    undo: null,
    summary,
  });

  switch (command.kind) {
    /* ── Lifecycle ────────────────────────────────────────────────────────── */
    case 'combat.begin': {
      if (combat.participants.length === 0) {
        throw new CommandRefused('There is nobody in this fight yet.');
      }
      return plain(beginCombat(combat, rules, context.now), 'Combat began');
    }
    case 'combat.end':
      return plain(endCombat(combat, context.now), 'Combat ended');
    case 'combat.reopen':
      return plain(reopenCombat(combat), 'Combat reopened');

    /* ── Turn order ───────────────────────────────────────────────────────── */
    case 'turn.next': {
      const next = nextTurn(combat);
      return plain(next, `Turn passed to ${nameOf(next, next.activeParticipantId ?? ('' as ParticipantId))}`);
    }
    case 'turn.previous':
      return plain(previousTurn(combat), 'Turn stepped back');
    case 'turn.jump': {
      find(combat, command.participantId);
      return plain(
        jumpToTurn(combat, command.participantId),
        `Turn given to ${nameOf(combat, command.participantId)}`,
      );
    }
    case 'turn.move': {
      find(combat, command.participantId);
      return plain(
        moveParticipant(combat, command.participantId, command.direction === 'earlier' ? -1 : 1),
        `${nameOf(combat, command.participantId)} moved ${command.direction}`,
      );
    }
    case 'turn.resort':
      return plain(resortByInitiative(combat, rules), 'Order re-sorted by initiative');

    /* ── Initiative ───────────────────────────────────────────────────────── */
    case 'initiative.set': {
      for (const participantId of command.participantIds) find(combat, participantId);
      // During a fight the number changes but the order does not, until the DM asks for a
      // re-sort. Before it starts, the number *is* the order.
      const next =
        combat.status === 'live'
          ? setInitiativeDuringCombat(combat, command.participantIds, command.value)
          : setInitiative(combat, command.participantIds, command.value);
      return plain(next, `Initiative set to ${command.value ?? 'none'}`);
    }
    case 'initiative.roll':
      return plain(
        rollInitiative(combat, rules, context.attributesFor, context.random, command.onlyMissing),
        command.onlyMissing ? 'Rolled the missing initiatives' : 'Re-rolled every initiative',
      );

    /* ── Health ───────────────────────────────────────────────────────────── */
    case 'health.damage':
    case 'health.heal': {
      const participant = find(combat, command.participantId);
      if (!Number.isInteger(command.amount) || command.amount <= 0) {
        throw new CommandRefused('That amount is not a number of hit points.');
      }
      const delta = command.kind === 'health.damage' ? -command.amount : command.amount;
      const before = snapshot(participant);
      const outcome = applyHealth(combat, command.participantId, delta, rules);

      return {
        combat: outcome.combat,
        undo: outcome.change ? before : null,
        summary: `${command.amount} ${command.kind === 'health.damage' ? 'damage to' : 'healing to'} ${participant.name}`,
        ...(outcome.concentration
          ? {
              concentration: {
                participantId: outcome.concentration.participant.id,
                damage: outcome.concentration.damage,
              },
            }
          : {}),
      };
    }
    case 'health.override': {
      const participant = find(combat, command.participantId);
      const before = snapshot(participant);
      return {
        combat: overrideHealth(combat, command.participantId, command.current).combat,
        undo: before,
        summary: `${participant.name}'s hit points set to ${command.current}`,
      };
    }
    case 'state.override': {
      const participant = find(combat, command.participantId);
      const before = snapshot(participant);
      return {
        combat: overrideState(combat, command.participantId, command.state),
        undo: before,
        summary: `${participant.name} set to ${command.state}`,
      };
    }

    /* ── Conditions ───────────────────────────────────────────────────────── */
    case 'condition.add': {
      const participant = find(combat, command.participantId);
      // The ruleset owns which conditions exist. A key it does not know is refused rather
      // than invented, which is what keeps this file free of any system's vocabulary.
      const definition = rules.conditions.find((entry) => entry.key === command.key);
      if (!definition) throw new CommandRefused('This game system has no such condition.');
      return {
        combat: addCondition(combat, command.participantId, definition, command.duration),
        undo: snapshot(participant),
        summary: `${definition.label} on ${participant.name}`,
      };
    }
    case 'condition.remove': {
      const participant = find(combat, command.participantId);
      return {
        combat: removeCondition(combat, command.participantId, command.key),
        undo: snapshot(participant),
        summary: `Condition cleared from ${participant.name}`,
      };
    }

    case 'target.set': {
      find(combat, command.participantId);
      return plain(
        setTargeted(combat, command.participantId),
        `Targeted ${nameOf(combat, command.participantId)}`,
      );
    }

    /* ── Death saves ──────────────────────────────────────────────────────── */
    case 'deathSave.roll': {
      const participant = find(combat, command.participantId);
      const request = rules.deathSaveRequest();
      if (!request) throw new CommandRefused('This game system has no death saves.');

      const before = snapshot(participant);
      const rolled = rules.evaluateRoll(request, 0, context.random);
      const outcome = applyDeathSave(combat, command.participantId, rolled, rules);

      return {
        combat: outcome.combat,
        undo: before,
        summary: `${participant.name} rolled ${rolled.total} on a death save`,
        deathSave: { outcome: outcome.outcome, revived: outcome.revived, total: rolled.total },
      };
    }

    /* ── Roster ───────────────────────────────────────────────────────────── */
    case 'participant.rename': {
      find(combat, command.participantId);
      const name = command.name.trim();
      if (!name) throw new CommandRefused('A combatant needs a name.');
      return plain(
        renameParticipant(combat, command.participantId, name),
        `Renamed to ${name}`,
      );
    }
    case 'participant.visibility': {
      for (const participantId of command.participantIds) find(combat, participantId);
      return plain(
        setVisibility(combat, command.participantIds, command.visibility),
        `${command.participantIds.length} set to ${command.visibility}`,
      );
    }
    case 'participant.remove': {
      if (command.participantIds.length === 0) throw new CommandRefused('Nobody was named.');
      return plain(
        removeParticipants(combat, command.participantIds),
        `${command.participantIds.length} removed from the fight`,
      );
    }

    case 'undo':
      // Resolved against the audit history, which the reducer cannot see. The store handles
      // it and never reaches this branch; the case exists so the switch stays exhaustive.
      throw new CommandRefused('Undo is resolved against the combat history.');
  }
}

/* ── Who may issue what ─────────────────────────────────────────────────────── */

export interface Permission {
  allowed: boolean;
  /** Why not, phrased for a log rather than for a player. */
  reason?: string;
}

const ALLOWED: Permission = { allowed: true };
const refuse = (reason: string): Permission => ({ allowed: false, reason });

/** Commands a player device issues in the course of taking its own turn. */
const PLAYER_KINDS = new Set<CombatCommandKind>([
  'health.damage',
  'health.heal',
  'condition.add',
  'condition.remove',
  'target.set',
  'deathSave.roll',
  'turn.next',
]);

/**
 * What a player may do, as a question about the command rather than a diff of the result.
 *
 * The rule is the same one the design states: a player acts for their own character and
 * against creatures. Everything about the fight itself — who is in it, what order they act in,
 * whether it is running, what another character's hit points are — is the DM's.
 *
 * `ownedIds` are the participants played by a character this account owns, resolved from
 * stored rows by the caller. Nothing in the request decides it.
 */
export function canPlayerIssue(
  command: CombatCommand,
  combat: CombatInstance,
  ownedIds: ReadonlySet<string>,
): Permission {
  if (!PLAYER_KINDS.has(command.kind)) {
    return refuse(`${command.kind} is the DM's to issue`);
  }

  if (command.kind === 'turn.next') {
    // You may hand on your own turn and nobody else's.
    return combat.activeParticipantId && ownedIds.has(combat.activeParticipantId)
      ? ALLOWED
      : refuse('a player may only end their own turn');
  }

  if (!('participantId' in command)) return ALLOWED;

  const target = combat.participants.find((entry) => entry.id === command.participantId);
  if (!target) return refuse('that combatant is not in this fight');

  // Targeting is a note about what the next damage lands on and costs nobody anything.
  if (command.kind === 'target.set') return ALLOWED;

  if (ownedIds.has(target.id)) return ALLOWED;

  // Someone else's row. A creature is fair game — attacking one is the whole screen — but
  // another player's character is not, and a death save is nobody's but its owner's.
  if (command.kind === 'deathSave.roll') return refuse('a death save belongs to its own character');
  if (target.entityType === 'player') {
    return refuse("a player may not change another character's state");
  }
  if (command.kind === 'condition.add' || command.kind === 'condition.remove') {
    return refuse('conditions on a creature are the DM to set');
  }
  return ALLOWED;
}

/**
 * Not in this file, on purpose: the free-form log roll.
 *
 * `rolls.record` appends a line to the combat log and changes no authoritative state — hit
 * points move only through `health.damage`, which the server computes from the stored fight.
 * So a client still chooses how much damage its own attack did, and that is the honest
 * remaining gap: what a die came up as is not yet the server's to say for an attack, only for
 * the two rolls that move state on their own, initiative and death saves.
 *
 * Closing it needs the ruleset to resolve an action end to end — an action id, a target, and
 * the adapter deciding the damage — which is a change to the `Ruleset` seam rather than to
 * this command set. It is written down here rather than left to be rediscovered.
 */
export const CLIENT_ROLLED_DAMAGE_IS_A_KNOWN_GAP = true;

/** Re-exported so a caller can build a condition id the same way the transforms do. */
export const conditionId = (participantId: ParticipantId, key: string) =>
  id<'Condition'>(`c-${participantId}-${key}`);
