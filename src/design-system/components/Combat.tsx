import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { cx, type Advantage, type IconName, type RollOutcome } from './types';

export type ConditionTone = 'neutral' | 'buff' | 'debuff' | 'concentration' | 'danger';

export interface ConditionChipProps {
  label: string;
  tone?: ConditionTone;
  icon?: IconName;
  /** Remaining duration, e.g. `2r` for two rounds. Set in the mono face. */
  duration?: string;
  onRemove?: () => void;
  onClick?: () => void;
  className?: string;
}

/**
 * One condition chip serves every context. Tone is carried by a token-guaranteed
 * background, never by a translucent mix over whatever row happens to sit behind it.
 */
export function ConditionChip({
  label,
  tone = 'neutral',
  icon,
  duration,
  onRemove,
  onClick,
  className,
}: ConditionChipProps) {
  return (
    <span
      className={cx('tc-cond', tone !== 'neutral' && `tc-cond--${tone}`, className)}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {icon && <Icon name={icon} />}
      {label}
      {duration && <span className="tc-cond__dur">{duration}</span>}
      {onRemove && (
        <button
          type="button"
          className="tc-cond__x"
          aria-label={`Remove ${label}`}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        >
          <Icon name="x" size={10} />
        </button>
      )}
    </span>
  );
}

export interface DiceButtonProps {
  /** Dice expression, e.g. `1d20+5`. */
  expression: string;
  label?: ReactNode;
  advantage?: Advantage;
  primary?: boolean;
  onClick?: () => void;
  className?: string;
}

export function DiceButton({
  expression,
  label,
  advantage = 'none',
  primary,
  onClick,
  className,
}: DiceButtonProps) {
  return (
    <button
      type="button"
      className={cx('tc-dice', primary && 'tc-dice--primary', className)}
      data-adv={advantage !== 'none' ? advantage : undefined}
      onClick={onClick}
    >
      <Icon name="dice-six" />
      <span className="tc-dice__expr">{expression}</span>
      {label && <span className="tc-dice__label">{label}</span>}
    </button>
  );
}

export interface RollResultProps {
  total: number;
  title: ReactNode;
  /**
   * The auditable dice math, e.g. `1d20 (17) + 5`. Pass a node so a die dropped by
   * advantage can be marked with `<s>` — struck through, not faded, because it is
   * still part of the arithmetic the table may want to check.
   */
  breakdown: ReactNode;
  outcome?: RollOutcome;
  /** Caption under the total, e.g. `TOTAL` or `ATTACK`. */
  totalLabel?: string;
  flags?: ReactNode;
  className?: string;
}

/**
 * The shell for a resolved roll. The design's rule is that a failed roll is never
 * silently swallowed, so this always renders the arithmetic that produced the total.
 */
export function RollResult({
  total,
  title,
  breakdown,
  outcome = 'normal',
  totalLabel = 'Total',
  flags,
  className,
}: RollResultProps) {
  return (
    <div
      className={cx('tc-roll', className)}
      data-outcome={outcome !== 'normal' ? outcome : undefined}
    >
      <span className="tc-roll__total">
        <b>{total}</b>
        <span>{totalLabel}</span>
      </span>
      <span className="tc-roll__main">
        <span className="tc-roll__title">{title}</span>
        <span className="tc-roll__breakdown">{breakdown}</span>
      </span>
      {flags && <span className="tc-roll__flags">{flags}</span>}
    </div>
  );
}

export interface TurnIndicatorProps {
  state?: 'active' | 'quiet' | 'next';
  children?: ReactNode;
}

export function TurnIndicator({ state = 'active', children = 'Current turn' }: TurnIndicatorProps) {
  return (
    <span className={cx('tc-turn', state !== 'active' && `tc-turn--${state}`)}>
      <Icon name="caret-right" size={11} />
      <span className="tc-turn__text">{children}</span>
    </span>
  );
}

export interface RoundCounterProps {
  round: number;
  turn?: number;
  of?: number;
}

export function RoundCounter({ round, turn, of }: RoundCounterProps) {
  return (
    <span className="tc-roundcounter">
      Round <b>{round}</b>
      {turn !== undefined && of !== undefined && (
        <>
          · turn <b>{turn}</b> of <b>{of}</b>
        </>
      )}
    </span>
  );
}
