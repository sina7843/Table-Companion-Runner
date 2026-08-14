import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from './types';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  /** Accessible name for the tab list, e.g. "Campaign sections". */
  label: string;
  className?: string;
}

/**
 * Tab strip with the roving-tabindex keyboard behaviour the pattern requires:
 * arrows move between tabs, Home/End jump to the ends, and only the selected tab
 * is in the tab order. Disabled tabs are skipped rather than trapped on.
 */
export function Tabs({ items, value, onChange, label, className }: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const focusTab = (index: number) => {
    const tabs = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs?.[index]?.focus();
  };

  const step = (from: number, delta: number) => {
    // Skip disabled tabs, wrapping around. Bounded by items.length so a list of
    // entirely disabled tabs terminates instead of spinning.
    for (let i = 1; i <= items.length; i++) {
      const next = (from + delta * i + items.length * items.length) % items.length;
      if (!items[next]?.disabled) return next;
    }
    return from;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = items.findIndex((item) => item.id === value);
    if (current < 0) return;

    let next: number | null = null;
    if (event.key === 'ArrowRight') next = step(current, 1);
    else if (event.key === 'ArrowLeft') next = step(current, -1);
    else if (event.key === 'Home') next = step(-1, 1);
    else if (event.key === 'End') next = step(items.length, -1);
    if (next === null) return;

    event.preventDefault();
    const item = items[next];
    if (!item) return;
    onChange(item.id);
    focusTab(next);
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      className={cx('tc-tabs', className)}
      onKeyDown={onKeyDown}
    >
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={selected}
            aria-controls={`tabpanel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
            className="tc-tab"
          >
            {item.label}
            {item.count !== undefined && <span className="tc-tab__count">{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export interface TabPanelProps {
  /** Must match the `id` of the tab that controls this panel. */
  tabId: string;
  children: ReactNode;
  className?: string;
}

export function TabPanel({ tabId, children, className }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      id={`tabpanel-${tabId}`}
      aria-labelledby={`tab-${tabId}`}
      tabIndex={0}
      className={className}
    >
      {children}
    </div>
  );
}
