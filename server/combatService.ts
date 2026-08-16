/**
 * One combat command, executed authoritatively.
 *
 * Everything that makes a command safe happens in this file, inside one transaction:
 *
 *  1. The fight's row is locked, so two commands for the same fight serialise rather than
 *     interleave. Simultaneous damage from two devices is two commands, applied one after the
 *     other, and both land.
 *  2. A command id that has already been applied returns the current state and does nothing.
 *     A retry after a dropped response is therefore a no-op, not a second hit.
 *  3. The version the client was working from must be the version stored. If the fight has
 *     moved on, the command is refused — deterministically, with `conflict` — and the client
 *     re-reads. There is no merge and no last-write-wins.
 *  4. The new state is computed from the *stored* fight by `applyCommand`, never taken from
 *     the request. A client says "12 damage"; what 12 damage does to a track with temporary
 *     hit points on it is the ruleset's answer, worked out here.
 *  5. The fight, its participants and one audit row are written together. A fight and its
 *     history cannot disagree, because nothing can commit one without the other.
 *
 * Undo is resolved here rather than in the reducer, because it is a question about the history:
 * only an event that recorded what to restore may be undone, only once, and undoing appends a
 * new event rather than removing the old one.
 */
import { randomUUID } from 'node:crypto';
import { requireRuleset } from '../src/domain/ruleset/registry.ts';
import {
  applyCommand,
  CommandRefused,
  restoreParticipant,
  type CombatCommand,
  type ParticipantRestore,
} from '../src/domain/combat/commands.ts';
import type {
  Attribute,
  CombatInstance,
  CombatParticipant,
  GameSystemId,
  UserId,
} from '../src/domain/types.ts';
import type { CombatCommandInput, CombatCommandOutcome } from '../src/domain/data/repositories.ts';
import type { Db } from './db.ts';
import { StoreError } from './store.ts';

/** What the service needs from the store to read and write a fight. */
export interface CombatPort {
  load(tx: Db, combatId: string): Promise<{ combat: CombatInstance; version: number } | null>;
  writeParticipants(tx: Db, combatId: string, participants: readonly CombatParticipant[]): Promise<void>;
  systemIdFor(tx: Db, campaignId: string): Promise<GameSystemId | null>;
  attributesFor(tx: Db, participants: readonly CombatParticipant[]): Promise<Map<string, Attribute[]>>;
}

export interface ExecuteOptions {
  /** Who issued it. Recorded on the audit row; authorization happened above this. */
  actorUserId: UserId | null;
  /** Injected so a test can decide what the dice did. */
  random?: () => number;
  now?: () => string;
}

interface EventRow {
  seq: number;
  kind: string;
  undo_restore: ParticipantRestore | null;
  undone_by_seq: number | null;
  summary: string | null;
}

const conflict = (message: string) => new StoreError(409, message, 'conflict');

export async function executeCombatCommand(
  db: Db,
  port: CombatPort,
  input: CombatCommandInput,
  options: ExecuteOptions,
): Promise<CombatCommandOutcome> {
  const random = options.random ?? Math.random;
  const now = options.now ?? (() => new Date().toISOString());

  return db.tx(async (tx) => {
    // `for update` on the fight itself. Every command for one combat queues behind this, so
    // two devices damaging the same goblin apply in some order rather than racing.
    const [locked] = await tx.query<{ version: number }>(
      'select version from combats where id = $1 for update',
      [input.combatId],
    );
    if (!locked) throw new StoreError(404, 'That combat no longer exists.', 'not_found');

    // A retried command carries the id the first attempt did. Answer with where the fight
    // actually is rather than applying it again.
    const [already] = await tx.query<{ seq: number }>(
      'select seq from combat_events where combat_id = $1 and command_id = $2',
      [input.combatId, input.commandId],
    );
    if (already) {
      const current = await port.load(tx, input.combatId);
      if (!current) throw new StoreError(404, 'That combat no longer exists.', 'not_found');
      return { combat: withVersion(current.combat, current.version), seq: already.seq, replayed: true };
    }

    if (input.expectedVersion !== locked.version) {
      throw conflict(
        `This fight has moved on since you last saw it (you have ${input.expectedVersion}, it is at ${locked.version}). Refresh and try again.`,
      );
    }

    const loaded = await port.load(tx, input.combatId);
    if (!loaded) throw new StoreError(404, 'That combat no longer exists.', 'not_found');

    const systemId = await port.systemIdFor(tx, loaded.combat.campaignId);
    if (!systemId) throw new StoreError(404, 'That campaign no longer exists.', 'not_found');

    const outcome =
      input.command.kind === 'undo'
        ? await undoEvent(tx, loaded.combat, input.command.seq)
        : await runCommand(tx, port, loaded.combat, input.command, systemId, { random, now });

    const version = locked.version + 1;
    await tx.query(
      `update combats set status = $2, round = $3, active_participant_id = $4,
         started_at = $5, ended_at = $6, version = $7, updated_at = now()
       where id = $1`,
      [
        input.combatId,
        outcome.combat.status,
        outcome.combat.round,
        outcome.combat.activeParticipantId,
        outcome.combat.startedAt ?? null,
        outcome.combat.endedAt ?? null,
        version,
      ],
    );
    await port.writeParticipants(tx, input.combatId, outcome.combat.participants);

    const seq = await appendEvent(tx, {
      combatId: input.combatId,
      commandId: input.commandId,
      kind: input.command.kind,
      actorUserId: options.actorUserId,
      payload: input.command,
      undoRestore: outcome.undo,
      undoesSeq: outcome.undoesSeq ?? null,
      summary: outcome.summary,
      version,
    });

    if (outcome.undoesSeq !== undefined) {
      // The original stays exactly where it is; it is marked, not removed.
      await tx.query(
        'update combat_events set undone_by_seq = $3 where combat_id = $1 and seq = $2',
        [input.combatId, outcome.undoesSeq, seq],
      );
    }

    return {
      combat: withVersion(outcome.combat, version),
      seq,
      summary: outcome.summary,
      ...(outcome.concentration ? { concentration: outcome.concentration } : {}),
      ...(outcome.deathSave ? { deathSave: outcome.deathSave } : {}),
    };
  });
}

const withVersion = (combat: CombatInstance, version: number): CombatInstance => ({
  ...combat,
  version,
});

interface Applied {
  combat: CombatInstance;
  undo: ParticipantRestore | null;
  summary: string;
  undoesSeq?: number;
  concentration?: CombatCommandOutcome['concentration'];
  deathSave?: CombatCommandOutcome['deathSave'];
}

async function runCommand(
  tx: Db,
  port: CombatPort,
  combat: CombatInstance,
  command: CombatCommand,
  systemId: GameSystemId,
  clock: { random: () => number; now: () => string },
): Promise<Applied> {
  // Attributes are only needed for an initiative roll, and resolving them is a read per
  // participant — so it happens for the one command that uses them and no other.
  const attributes =
    command.kind === 'initiative.roll'
      ? await port.attributesFor(tx, combat.participants)
      : new Map<string, Attribute[]>();

  try {
    const result = applyCommand(combat, command, {
      rules: requireRuleset(systemId),
      now: clock.now(),
      random: clock.random,
      attributesFor: (participant) => attributes.get(participant.id) ?? [],
    });
    return {
      combat: result.combat,
      undo: result.undo,
      summary: result.summary,
      ...(result.concentration ? { concentration: result.concentration } : {}),
      ...(result.deathSave ? { deathSave: result.deathSave } : {}),
    };
  } catch (error) {
    // A command the current state cannot accept is the caller's problem, not a fault.
    if (error instanceof CommandRefused) throw conflict(error.message);
    throw error;
  }
}

async function undoEvent(tx: Db, combat: CombatInstance, seq: number): Promise<Applied> {
  const [event] = await tx.query<EventRow>(
    'select seq, kind, undo_restore, undone_by_seq, summary from combat_events where combat_id = $1 and seq = $2',
    [combat.id, seq],
  );
  if (!event) throw new StoreError(404, 'There is no such change to undo.', 'not_found');
  if (!event.undo_restore) throw conflict('That change cannot be undone.');
  if (event.undone_by_seq !== null) throw conflict('That change has already been undone.');

  return {
    // Restores rather than recomputes, and touches only the participant the original event
    // touched — so undoing a hit from three rounds ago does not discard what happened since.
    combat: restoreParticipant(combat, event.undo_restore),
    undo: null,
    undoesSeq: seq,
    summary: `Undid: ${event.summary ?? event.kind}`,
  };
}

async function appendEvent(
  tx: Db,
  entry: {
    combatId: string;
    commandId: string;
    kind: string;
    actorUserId: UserId | null;
    payload: unknown;
    undoRestore: ParticipantRestore | null;
    undoesSeq: number | null;
    summary: string;
    version: number;
  },
): Promise<number> {
  const [row] = await tx.query<{ seq: number }>(
    `insert into combat_events
       (combat_id, seq, kind, actor_user_id, payload, command_id, undo_restore, undoes_seq, summary, version)
     select $1, coalesce(max(seq), 0) + 1, $2, $3, $4::jsonb, $5, $6::jsonb, $7, $8, $9
       from combat_events where combat_id = $1
     returning seq`,
    [
      entry.combatId,
      entry.kind,
      entry.actorUserId,
      JSON.stringify(entry.payload),
      entry.commandId,
      entry.undoRestore ? JSON.stringify(entry.undoRestore) : null,
      entry.undoesSeq,
      entry.summary,
      entry.version,
    ],
  );
  if (!row) throw new StoreError(500, 'The change could not be recorded.');
  return row.seq;
}

/** A command id, for a caller that does not have one. Clients generate their own. */
export const newCommandId = (): string => randomUUID();
