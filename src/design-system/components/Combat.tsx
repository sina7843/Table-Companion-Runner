import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { HPBar } from './HitPoints';
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

export interface InitiativeRowProps {
  name: string;
  /** The identity line under the name: class and player, or challenge and armour. */
  sub?: ReactNode;
  entity: 'player' | 'monster' | 'npc' | 'ally';
  /** Null reads as a dash: an unrolled participant is never a slow one. */
  initiative: number | null;
  current: number;
  max: number;
  temp?: number;
  /** Absent means waiting — the ordinary state, which needs no treatment of its own. */
  state?: 'active' | 'unconscious' | 'defeated';
  /** What the context panel is showing. Deliberately quieter than the turn. */
  selected?: boolean;
  /** Will receive the next damage. A dashed marker, distinct in shape from selected. */
  targeted?: boolean;
  /** Present in the DM's order, absent from every player device. */
  dmOnly?: boolean;
  deathSaves?: { successes: number; failures: number };
  /** `ConditionChip`s. Four fit before the row wraps. */
  conditions?: ReactNode;
  /** Row controls. Hidden by the design's own container query below 560px. */
  actions?: ReactNode;
  /** Opens this participant in the context panel. */
  onOpen?: () => void;
  className?: string;
}

/** The word and glyph that carry a state when colour cannot. */
const STATE_FLAG: Record<string, { icon: IconName; label: string }> = {
  active: { icon: 'caret-right', label: 'Turn' },
  unconscious: { icon: 'heartbeat', label: 'Down' },
  defeated: { icon: 'skull', label: 'Out' },
};

/**
 * The most reused component in the product: one row, eight states.
 *
 * Every state pairs its colour with a marker, a glyph and a word, because a DM running a
 * fight in a dim room, or one who does not separate red from green, still has to know
 * whose turn it is at a glance.
 *
 * The row is a div rather than a button even though the design's CSS resets it like one:
 * it carries damage, heal and target controls, and a control inside a control is invalid
 * markup whose inner control never reaches the keyboard. The name is the button instead,
 * so the keyboard path is real; the whole row stays clickable for a pointer.
 */
export function InitiativeRow({
  name,
  sub,
  entity,
  initiative,
  current,
  max,
  temp,
  state,
  selected,
  targeted,
  dmOnly,
  deathSaves,
  conditions,
  actions,
  onOpen,
  className,
}: InitiativeRowProps) {
  const flag = state ? STATE_FLAG[state] : undefined;

  return (
    <div
      className={cx('tc-init', className)}
      data-state={state}
      data-selected={selected ? 'true' : undefined}
      data-targeted={targeted ? 'true' : undefined}
      data-dm-only={dmOnly ? 'true' : undefined}
      // A pointer gets the whole row; the keyboard gets the name button below, which is
      // why this carries no role and no tabindex of its own.
      onClick={onOpen}
    >
      <span className="tc-init__marker" />

      <span className="tc-init__init">{initiative ?? '—'}</span>

      <span className="tc-init__main">
        <span className="tc-init__name">
          <span className="tc-init__type" data-entity={entity} />
          {onOpen ? (
            <button
              type="button"
              // The design's own `.tc-init` rule resets a button to inherit; the row is a
              // div now, so the same reset moves here rather than into the vendored CSS.
              style={{
                background: 'none',
                border: 0,
                padding: 0,
                font: 'inherit',
                color: 'inherit',
                textAlign: 'left',
                cursor: 'pointer',
              }}
              onClick={(event) => {
                event.stopPropagation();
                onOpen();
              }}
            >
              {name}
            </button>
          ) : (
            name
          )}
          {flag && (
            <span className="tc-init__flag">
              <Icon name={flag.icon} size={11} />
              {flag.label}
            </span>
          )}
          {dmOnly && (
            <span className="tc-init__flag">
              <Icon name="eye-slash" size={11} />
              DM only
            </span>
          )}
        </span>

        <span className="tc-init__sub">
          {sub}
          {conditions}
          {deathSaves && (
            <span className="tc-init__deaths">
              <span>
                <Icon name="check" size={10} />
                <DeathPips kind="success" filled={deathSaves.successes} />
              </span>
              <span>
                <Icon name="x" size={10} />
                <DeathPips kind="failure" filled={deathSaves.failures} />
              </span>
            </span>
          )}
        </span>
      </span>

      <span className="tc-init__trail">
        <HPBar current={current} max={max} temp={temp} />
        {actions && (
          <span
            className="tc-init__actions"
            // The row opens the panel; a control on it does its own job instead.
            onClick={(event) => event.stopPropagation()}
          >
            {actions}
          </span>
        )}
      </span>
    </div>
  );
}

function DeathPips({ kind, filled }: { kind: 'success' | 'failure'; filled: number }) {
  return (
    <span className="tc-init__deathpips">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="tc-init__deathpip"
          data-kind={kind}
          data-filled={index < filled ? 'true' : undefined}
        />
      ))}
    </span>
  );
}
