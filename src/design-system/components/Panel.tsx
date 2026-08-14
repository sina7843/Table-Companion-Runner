import type { ReactNode } from 'react';
import { IconButton } from './Button';
import { cx } from './types';

export interface SidePanelProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  actions?: ReactNode;
  onClose?: () => void;
  /** 440px instead of 360px — the combat panel uses this to fit a full stat block. */
  wide?: boolean;
  children?: ReactNode;
  className?: string;
}

/**
 * The docked context panel — the desktop default, and the design's stated rule:
 * "a side panel is the default, a modal is the exception". It lives in the layout flow
 * in its own column, so opening a monster's stat block never closes the fight behind it.
 */
export function SidePanel({
  eyebrow,
  title,
  actions,
  onClose,
  wide,
  children,
  className,
}: SidePanelProps) {
  return (
    <aside
      className={cx('tc-sidepanel', className)}
      style={wide ? { width: 'var(--layout-context-panel-wide)' } : undefined}
      aria-label={typeof title === 'string' ? title : 'Context panel'}
    >
      <div className="tc-sidepanel__head">
        <span className="tc-sidepanel__title">
          {eyebrow && <span className="tc-sidepanel__eyebrow">{eyebrow}</span>}
          {title}
        </span>
        {actions}
        {onClose && <IconButton icon="x" label="Close panel" size="sm" onClick={onClose} />}
      </div>
      <div className="tc-sidepanel__body">{children}</div>
    </aside>
  );
}

export interface PanelProps {
  head?: ReactNode;
  elevated?: boolean;
  /** Removes body padding — use when the body is a list or table that rules its own edges. */
  flush?: boolean;
  children?: ReactNode;
  className?: string;
}

export function Panel({ head, elevated, flush, children, className }: PanelProps) {
  return (
    <div className={cx('tc-panel', elevated && 'tc-panel--elevated', className)}>
      {head && <div className="tc-panel__head">{head}</div>}
      <div className={cx('tc-panel__body', flush && 'tc-panel__body--flush')}>{children}</div>
    </div>
  );
}
