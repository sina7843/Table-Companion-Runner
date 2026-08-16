/**
 * The combat log.
 *
 * Every roll in a fight goes through here, so actor, expression, natural dice, modifier,
 * total and visibility are recorded once and the same way. The arithmetic itself is the
 * shared `evaluate` from the roll primitive — this owns who rolled, who may see it, and
 * the order it happened in.
 *
 * Secret rolls carry `visibility: 'dm-only'` and are kept in their own list. Nothing in
 * this file writes a secret roll into the list a player device would read; the separation
 * is by field and by array, not by a filter a caller might forget.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { evaluate } from '../../app/useRoller';
import {
  id,
  isPlayerVisibleRoll,
  useRepositories,
  type CombatInstanceId,
  type GameSystemId,
  type Roll,
  type RollEvaluation,
  type RollId,
  type RollMode,
} from '../../domain';

export interface LoggedRoll extends Roll {
  raw?: RollEvaluation;
}

export interface CombatLog {
  /** Rolls the party can see, most recent first. */
  party: Roll[];
  /** Rolls only the DM can see, most recent first. Never merged into `party`. */
  secret: Roll[];
  /**
   * Rolls, records and returns the evaluation so a caller can act on the result —
   * applying damage, resolving a death save — without rolling twice.
   */
  roll: (input: {
    actor: string;
    title: string;
    expression: string;
    mode?: RollMode;
    secret?: boolean;
  }) => RollEvaluation;
  /**
   * Writes a line that is not a roll: damage applied, an undo, a condition. Returns the
   * id it wrote, so a caller can hang a targeted undo off that exact line.
   */
  note: (input: { actor: string; title: string; secret?: boolean }) => RollId;
  reload: () => void;
}

let sequence = 0;

export function useCombatLog(combatId: CombatInstanceId, systemId: GameSystemId): CombatLog {
  const { rolls } = useRepositories();
  const [entries, setEntries] = useState<Roll[]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void rolls.listForCombat(combatId).then((loaded) => {
      if (!cancelled) setEntries(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [rolls, combatId, version]);

  const append = useCallback(
    (entry: Roll) => {
      // Optimistic, because a roll at the table is not something to wait for. The write
      // is append-only, so a failure loses a log line rather than corrupting the fight.
      setEntries((current) => [entry, ...current]);
      void rolls.record(entry);
    },
    [rolls],
  );

  const roll = useCallback<CombatLog['roll']>(
    ({ actor, title, expression, mode = 'normal', secret }) => {
      const result = evaluate(systemId, title, expression, mode);
      sequence += 1;

      append({
        id: id<'Roll'>(`r-live-${sequence}`),
        combatId,
        actor,
        title,
        expression,
        mode,
        dice: result.raw.dice.map((die) => ({ ...die })),
        modifier: result.modifier,
        total: result.total,
        outcome: result.outcome,
        visibility: secret ? 'dm-only' : 'party',
        at: new Date().toISOString(),
      });

      return result.raw;
    },
    [append, combatId, systemId],
  );

  const note = useCallback<CombatLog['note']>(
    ({ actor, title, secret }) => {
      sequence += 1;
      const noteId = id<'Roll'>(`r-note-${sequence}`);
      append({
        id: noteId,
        combatId,
        actor,
        title,
        // A note is not a roll: no dice, no modifier, and a total of zero the shell knows
        // to render as a plain line rather than a number.
        expression: '',
        mode: 'normal',
        dice: [],
        modifier: 0,
        total: 0,
        outcome: 'normal',
        visibility: secret ? 'dm-only' : 'party',
        at: new Date().toISOString(),
      });
      return noteId;
    },
    [append, combatId],
  );

  // Split on the same predicate a player device would apply, not on a list of its own.
  // Two rules for one question is how a secret roll eventually shows up in the wrong list.
  //
  // Memoised because a combat screen re-renders on every hit point, and both halves would
  // otherwise be rebuilt over the whole log each time — along with two new array
  // identities that defeat any memo a consumer puts downstream of them.
  const [party, secret] = useMemo(() => {
    const visible: Roll[] = [];
    const hidden: Roll[] = [];
    for (const entry of entries) (isPlayerVisibleRoll(entry) ? visible : hidden).push(entry);
    return [visible, hidden] as const;
  }, [entries]);

  const reload = useCallback(() => setVersion((current) => current + 1), []);

  return useMemo(
    () => ({ party, secret, roll, note, reload }),
    [party, secret, roll, note, reload],
  );
}
