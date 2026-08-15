import type { ReactNode } from 'react';
import { cx, type EntityType } from './types';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

export interface AvatarProps {
  name: string;
  entity?: EntityType;
  size?: AvatarSize;
  src?: string;
  /** Grayscale treatment for a defeated combatant. Never opacity — see the CSS note. */
  defeated?: boolean;
  /** A connection or status dot, e.g. `var(--color-connection-live)`. */
  status?: string;
  className?: string;
}

/**
 * Initials by default: no portrait art ships with the design system, so the initials are
 * the normal case rather than a fallback. The entity type colours the border and squares
 * off a monster — always paired with a word elsewhere in the row, never colour alone.
 */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function Avatar({
  name,
  entity,
  size = 'md',
  src,
  defeated,
  status,
  className,
}: AvatarProps) {
  return (
    <span
      className={cx('tc-avatar', size !== 'md' && `tc-avatar--${size}`, className)}
      data-entity={entity}
      data-state={defeated ? 'defeated' : undefined}
      // The name is on the row beside it, so the avatar itself is decorative.
      aria-hidden="true"
    >
      {src ? <img src={src} alt="" /> : initials(name)}
      {status && <span className="tc-avatar__status" style={{ background: status }} />}
    </span>
  );
}

export interface AvatarGroupProps {
  /** Describes the group for assistive tech, e.g. "4 of 4 players connected". */
  label: string;
  children?: ReactNode;
  className?: string;
}

export function AvatarGroup({ label, children, className }: AvatarGroupProps) {
  return (
    <span className={cx('tc-avatargroup', className)} role="img" aria-label={label}>
      {children}
    </span>
  );
}
