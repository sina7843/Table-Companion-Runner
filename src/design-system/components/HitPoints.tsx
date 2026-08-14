import { useState } from 'react';
import { Button, IconButton } from './Button';
import { TextInput } from './Input';
import { cx, hpBand, type HPDeltaKind } from './types';

export interface HPBarProps {
  current: number;
  max: number;
  /** Temporary hit points, drawn as a separate azure segment past the main fill. */
  temp?: number;
  /** Renders the "HP" unit beside the numbers. */
  showUnit?: boolean;
  /** Fires the one-pass realtime change flash. */
  delta?: Exclude<HPDeltaKind, 'temp'>;
  className?: string;
}

/**
 * The row/table variant of the one hit-point pattern. The design allows exactly three
 * variants of this pattern and no fourth control: HPBar here, HPControl in panels and
 * sheets, and a compact bar inside tables (this component at its narrow end).
 */
export function HPBar({ current, max, temp = 0, showUnit, delta, className }: HPBarProps) {
  const band = hpBand(current, max);
  const total = Math.max(max + temp, 1);
  const fillPercent = Math.max(0, Math.min(100, (current / total) * 100));
  const tempPercent = Math.max(0, Math.min(100 - fillPercent, (temp / total) * 100));

  return (
    <div className={cx('tc-hpbar', className)} data-band={band} data-delta={delta}>
      <span className="tc-hpbar__nums">
        <span className="tc-hpbar__cur">{current}</span>
        <span className="tc-hpbar__max">/ {max}</span>
        {showUnit && <span className="tc-hpbar__unit">HP</span>}
        {temp > 0 && <span className="tc-hpbar__temp">+{temp} temp</span>}
      </span>
      <div
        className="tc-hpbar__track"
        role="meter"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={max}
        // The meter carries a real spoken value, not just a coloured length.
        aria-label={`${current} of ${max} hit points${temp > 0 ? `, plus ${temp} temporary` : ''}`}
      >
        <div className="tc-hpbar__fill" style={{ width: `${fillPercent}%` }} />
        {temp > 0 && (
          <div
            className="tc-hpbar__tempfill"
            style={{ left: `${fillPercent}%`, width: `${tempPercent}%` }}
          />
        )}
      </div>
    </div>
  );
}

export interface HPDeltaProps {
  kind: HPDeltaKind;
  amount: number;
}

export function HPDelta({ kind, amount }: HPDeltaProps) {
  const sign = kind === 'damage' ? '−' : '+';
  return (
    <span className="tc-hpdelta" data-kind={kind}>
      {sign}
      {Math.abs(amount)}
    </span>
  );
}

const QUICK_AMOUNTS = [1, 5, 10] as const;

export interface HPControlProps {
  current: number;
  max: number;
  temp?: number;
  /** Positive heals, negative damages. The caller owns clamping and the undo log. */
  onApply: (delta: number) => void;
  className?: string;
}

/**
 * The panel/sheet variant of the hit-point pattern: the bar plus an amount entry and
 * quick-step buttons. Damage and healing apply directly, per the approved decisions —
 * the DM's edit/override/undo path lives above this component, not inside it.
 */
export function HPControl({ current, max, temp = 0, onApply, className }: HPControlProps) {
  const [amount, setAmount] = useState('');

  const apply = (direction: 1 | -1, value: number) => {
    if (!Number.isFinite(value) || value <= 0) return;
    onApply(direction * value);
    setAmount('');
  };

  const typed = Number.parseInt(amount, 10);

  return (
    <div className={cx('tc-hpcontrol', className)}>
      <HPBar current={current} max={max} temp={temp} showUnit />

      <div className="tc-hpcontrol__row">
        <TextInput
          inputMode="numeric"
          numeric
          placeholder="0"
          value={amount}
          aria-label="Hit point amount"
          onChange={(event) => setAmount(event.target.value)}
          onKeyDown={(event) => {
            // Enter damages, Shift+Enter heals — the DM's hands stay on the keyboard
            // during combat, and damage is by far the more common of the two.
            if (event.key !== 'Enter') return;
            event.preventDefault();
            apply(event.shiftKey ? 1 : -1, typed);
          }}
        />
        <IconButton
          icon="drop"
          label="Apply damage"
          variant="outlined"
          onClick={() => apply(-1, typed)}
        />
        <IconButton
          icon="heart"
          label="Apply healing"
          variant="outlined"
          onClick={() => apply(1, typed)}
        />
      </div>

      <div className="tc-hpcontrol__quick">
        {QUICK_AMOUNTS.map((value) => (
          <button
            key={`damage-${value}`}
            type="button"
            className="tc-hpquick"
            data-kind="damage"
            aria-label={`Damage ${value}`}
            onClick={() => apply(-1, value)}
          >
            −{value}
          </button>
        ))}
        {QUICK_AMOUNTS.map((value) => (
          <button
            key={`heal-${value}`}
            type="button"
            className="tc-hpquick"
            data-kind="healing"
            aria-label={`Heal ${value}`}
            onClick={() => apply(1, value)}
          >
            +{value}
          </button>
        ))}
        <Button size="sm" variant="tertiary" onClick={() => onApply(max - current)}>
          Full
        </Button>
      </div>
    </div>
  );
}
