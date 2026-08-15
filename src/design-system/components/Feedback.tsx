import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { cx, type ConnectionState, type IconName, type Tone } from './types';

export interface SkeletonProps {
  /** Number of bars. Each occupies the exact height of the row it stands in for. */
  count?: number;
  height?: number;
  gap?: number;
  width?: string;
  className?: string;
}

/**
 * Placeholder bars. The design's rule: a skeleton occupies the exact height of the
 * content it replaces so nothing shifts when data lands, and section headers render
 * immediately because they are not data. The shimmer stops under reduced motion —
 * that is handled in feedback.css, not here.
 */
export function Skeleton({ count = 1, height = 16, gap = 8, width, className }: SkeletonProps) {
  if (count === 1) {
    return (
      <span
        className={cx('tc-skeleton', className)}
        style={{ height: `${height}px`, width: width ?? '100%' }}
        aria-hidden="true"
      />
    );
  }

  return (
    <span
      style={{ display: 'flex', flexDirection: 'column', gap: `${gap}px` }}
      aria-hidden="true"
      className={className}
    >
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className="tc-skeleton"
          style={{ height: `${height}px`, width: width ?? '100%' }}
        />
      ))}
    </span>
  );
}

const TONE_ICON: Record<Tone, IconName> = {
  neutral: 'info',
  accent: 'info',
  info: 'info',
  success: 'check-circle',
  warning: 'warning',
  danger: 'warning-circle',
};

export interface AlertProps {
  tone?: Extract<Tone, 'info' | 'success' | 'warning' | 'danger'>;
  title?: ReactNode;
  icon?: IconName;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function Alert({ tone = 'info', title, icon, actions, children, className }: AlertProps) {
  return (
    <div
      className={cx('tc-alert', `tc-alert--${tone}`, className)}
      // Danger and warning alerts announce themselves; info and success do not interrupt.
      role={tone === 'danger' || tone === 'warning' ? 'alert' : undefined}
    >
      <Icon name={icon ?? TONE_ICON[tone]} />
      <div className="tc-alert__body">
        {title && <span className="tc-alert__title">{title}</span>}
        {children}
        {actions && <div className="tc-alert__actions">{actions}</div>}
      </div>
    </div>
  );
}

export interface ToastProps {
  tone?: Extract<Tone, 'info' | 'success' | 'warning' | 'danger'>;
  title?: ReactNode;
  icon?: IconName;
  children?: ReactNode;
  className?: string;
}

export function Toast({ tone = 'info', title, icon, children, className }: ToastProps) {
  return (
    <div className={cx('tc-toast', `tc-toast--${tone}`, className)}>
      <Icon name={icon ?? TONE_ICON[tone]} />
      <div className="tc-toast__body">
        {title && <span className="tc-toast__title">{title}</span>}
        {children}
      </div>
    </div>
  );
}

export interface ToastViewportProps {
  children?: ReactNode;
}

/**
 * Fixed stack for toasts. `role="status"` with a polite live region so a toast is
 * announced without interrupting whatever the user is doing mid-combat.
 *
 * ponytail: no queueing, timers or dismiss policy here — that is application state,
 * and it belongs with the app shell in TC-02 rather than in a presentational primitive.
 */
export function ToastViewport({ children }: ToastViewportProps) {
  return (
    <div className="tc-toastviewport" role="status" aria-live="polite">
      {children}
    </div>
  );
}

export interface ConnectionStatusProps {
  state: ConnectionState;
  className?: string;
}

const CONNECTION_LABEL: Record<ConnectionState, string> = {
  live: 'Live',
  reconnecting: 'Reconnecting',
  offline: 'Offline',
};

/** Always a word plus a dot. The design forbids conveying this by colour alone. */
export function ConnectionStatus({ state, className }: ConnectionStatusProps) {
  return (
    <span className={cx('tc-connection', className)} data-state={state}>
      <span className="tc-connection__dot" />
      {CONNECTION_LABEL[state]}
    </span>
  );
}

export interface EmptyStateProps {
  icon?: IconName;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/**
 * An empty route says what is missing and offers the way out of it. The design's empty
 * states never show a disabled future feature as a teaser — if there is nothing to do
 * here yet, say so plainly.
 */
export function EmptyState({ icon, title, description, actions, className }: EmptyStateProps) {
  return (
    <div className={cx('tc-empty', className)}>
      {icon && <Icon name={icon} />}
      <span className="tc-empty__title">{title}</span>
      {description && <span className="tc-empty__desc">{description}</span>}
      {actions && <div className="tc-empty__actions">{actions}</div>}
    </div>
  );
}

export interface BannerProps {
  tone?: 'neutral' | 'info' | 'warning' | 'danger';
  icon?: IconName;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/**
 * A full-width strip pinned under a header.
 *
 * Distinct from `Alert`, which sits in content and can be dismissed: a banner is a state
 * the whole screen is in — reconnecting, read-only, a fight that has ended — and it stays
 * until that state does.
 */
export function Banner({ tone = 'neutral', icon, actions, children, className }: BannerProps) {
  return (
    <div className={cx('tc-banner', tone !== 'neutral' && `tc-banner--${tone}`, className)}>
      {icon && <Icon name={icon} />}
      <span>{children}</span>
      {actions && (
        <>
          <span className="tc-banner__spacer" />
          {actions}
        </>
      )}
    </div>
  );
}
