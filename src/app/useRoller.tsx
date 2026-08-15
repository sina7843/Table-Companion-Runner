/**
 * The shared roll primitive.
 *
 * Every screen that rolls — a character sheet, a monster panel, a combat row — goes
 * through this, so the arithmetic, the dropped-die handling and the result presentation
 * are written once. Before this existed the character sheet had its own copy, which is
 * exactly how two screens end up disagreeing about what a critical is.
 *
 * The roll itself belongs to the ruleset: `evaluateRoll` knows what a natural 20 means and
 * whether advantage exists. This owns the plumbing and the last result, nothing more.
 *
 * ponytail: no shared log and no broadcast. TC-11 owns the combat log and who sees a
 * secret roll; wiring a transport here would be guessing at it.
 */
import { useCallback, useState } from 'react';
import { IconButton, RollResult } from '../design-system';
import {
  requireRuleset,
  type GameSystemId,
  type RollEvaluation,
  type RollMode,
  type RollOutcome,
} from '../domain';

export interface RolledResult {
  title: string;
  expression: string;
  total: number;
  /** The dice as rolled, so the arithmetic stays checkable. */
  dice: { value: number; dropped?: boolean }[];
  modifier: number;
  outcome: RollOutcome;
}

export interface Roller {
  last: RolledResult | null;
  roll: (title: string, expression: string, mode?: RollMode) => void;
  clear: () => void;
}

/**
 * One roll, evaluated.
 *
 * Exported because the combat log needs the same arithmetic without the hook's state —
 * two copies of this mapping is exactly how two screens end up disagreeing about what a
 * dropped die is.
 */
export function evaluate(
  systemId: GameSystemId,
  title: string,
  expression: string,
  mode: RollMode = 'normal',
  random: () => number = Math.random,
): RolledResult & { raw: RollEvaluation } {
  const ruleset = requireRuleset(systemId);
  const raw = ruleset.evaluateRoll({ expression, mode, title }, 0, random);
  return {
    title,
    expression,
    total: raw.total,
    dice: raw.dice.map((die) => ({ value: die.value, dropped: die.dropped })),
    modifier: raw.modifier,
    outcome: raw.outcome,
    raw,
  };
}

export function useRoller(systemId: GameSystemId): Roller {
  const [last, setLast] = useState<RolledResult | null>(null);

  const roll = useCallback(
    (title: string, expression: string, mode: RollMode = 'normal') => {
      setLast(evaluate(systemId, title, expression, mode));
    },
    [systemId],
  );

  const clear = useCallback(() => setLast(null), []);

  return { last, roll, clear };
}

/**
 * Renders the last roll.
 *
 * The breakdown shows the natural dice separately from the modifier, and a die dropped by
 * advantage is struck through rather than removed — it is still part of the arithmetic the
 * table may want to check.
 */
export function RollReadout({ roller }: { roller: Roller }) {
  if (!roller.last) return null;
  const { title, expression, total, dice, modifier, outcome } = roller.last;

  return (
    <RollResult
      total={total}
      title={title}
      outcome={outcome}
      breakdown={
        <>
          {expression} ·{' '}
          {dice.map((die, index) => (
            <span key={index}>
              {index > 0 && ' + '}
              {die.dropped ? <s>{die.value}</s> : <b>{die.value}</b>}
            </span>
          ))}
          {modifier !== 0 && ` ${modifier > 0 ? '+' : '−'} ${Math.abs(modifier)}`}
        </>
      }
      flags={<IconButton icon="x" label="Dismiss roll" size="sm" onClick={roller.clear} />}
    />
  );
}
