import type { ReactNode } from 'react';
import { cx } from './types';

export interface StatProps {
  label: ReactNode;
  value: ReactNode;
  /** Ability modifier. Signed automatically; the sign drives its colour. */
  modifier?: number;
  size?: 'md' | 'lg';
  /** Label and value on one baseline, no box. */
  inline?: boolean;
  /** Keeps the box layout but drops the border and fill. */
  plain?: boolean;
  interactive?: boolean;
  /** Marks a value the DM has overridden away from the rules-calculated one. */
  overridden?: boolean;
  onClick?: () => void;
  className?: string;
}

export function Stat({
  label,
  value,
  modifier,
  size = 'md',
  inline,
  plain,
  interactive,
  overridden,
  onClick,
  className,
}: StatProps) {
  const classes = cx(
    'tc-stat',
    size === 'lg' && 'tc-stat--lg',
    inline && 'tc-stat--inline',
    plain && 'tc-stat--plain',
    className,
  );

  const content = (
    <>
      <span className="tc-stat__label">{label}</span>
      <span className="tc-stat__value">{value}</span>
      {modifier !== undefined && (
        <span
          className="tc-stat__mod"
          data-sign={modifier > 0 ? 'positive' : modifier < 0 ? 'negative' : undefined}
        >
          {modifier >= 0 ? `+${modifier}` : modifier}
        </span>
      )}
    </>
  );

  if (interactive || onClick) {
    return (
      <button
        type="button"
        className={classes}
        data-interactive="true"
        data-overridden={overridden ? 'true' : undefined}
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={classes} data-overridden={overridden ? 'true' : undefined}>
      {content}
    </div>
  );
}

export interface StatGridProps {
  /** Fixed column count. Omit to let the grid auto-fit. */
  columns?: number;
  children?: ReactNode;
  className?: string;
}

export function StatGrid({ columns, children, className }: StatGridProps) {
  return (
    <div
      className={cx('tc-statgrid', className)}
      style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
    >
      {children}
    </div>
  );
}
