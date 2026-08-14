import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { cx, type IconName, type Tone } from './types';

export interface BadgeProps {
  tone?: Tone;
  icon?: IconName;
  /** Solid brass fill. Reserved for the one genuinely loud thing on a screen. */
  solid?: boolean;
  /** Pill-shaped numeric count. */
  count?: boolean;
  children?: ReactNode;
  className?: string;
}

export function Badge({ tone = 'neutral', icon, solid, count, children, className }: BadgeProps) {
  return (
    <span
      className={cx(
        'tc-badge',
        `tc-badge--${tone}`,
        solid && 'tc-badge--solid',
        count && 'tc-badge--count',
        className,
      )}
    >
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}

export interface TagProps {
  icon?: IconName;
  children?: ReactNode;
  className?: string;
}

export function Tag({ icon, children, className }: TagProps) {
  return (
    <span className={cx('tc-tag', className)}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}

export interface ChipProps {
  icon?: IconName;
  /** Toggle state. Omit entirely for a chip that is not a toggle. */
  pressed?: boolean;
  onClick?: () => void;
  onDismiss?: () => void;
  /** Non-interactive chip — renders as a span, not a button. */
  static?: boolean;
  children?: ReactNode;
  className?: string;
}

export function Chip({
  icon,
  pressed,
  onClick,
  onDismiss,
  static: isStatic,
  children,
  className,
}: ChipProps) {
  const content = (
    <>
      {icon && <Icon name={icon} />}
      {children}
      {onDismiss && (
        <button
          type="button"
          className="tc-chip__dismiss"
          aria-label="Remove"
          onClick={(event) => {
            // The dismiss control sits inside the chip; without this the chip's own
            // click handler fires too and the caller sees a toggle plus a removal.
            event.stopPropagation();
            onDismiss();
          }}
        >
          <Icon name="x" size={11} />
        </button>
      )}
    </>
  );

  if (isStatic) {
    return <span className={cx('tc-chip', 'tc-chip--static', className)}>{content}</span>;
  }

  // `tc-chip--static` carries two things in the source CSS: `cursor:default` and the
  // right padding a chip needs when it has no dismiss button sitting in that space.
  // A clickable chip without a dismiss affordance needs the padding but not the cursor,
  // so adapters.css restores the pointer for `button.tc-chip--static`.
  return (
    <button
      type="button"
      className={cx('tc-chip', !onDismiss && 'tc-chip--static', className)}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {content}
    </button>
  );
}
