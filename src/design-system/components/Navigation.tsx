import type { ElementType, ReactNode } from 'react';
import { Icon } from './Icon';
import { cx, type IconName } from './types';

export interface SidebarProps {
  brand?: ReactNode;
  footer?: ReactNode;
  collapsed?: boolean;
  /** Accessible name, e.g. "Main". */
  label: string;
  children?: ReactNode;
  className?: string;
}

/**
 * The DM's navigation column. 232px, or the 56px icon rail when collapsed — the design
 * collapses it below 1280px rather than hiding it, so the DM never loses their place.
 */
export function Sidebar({ brand, footer, collapsed, label, children, className }: SidebarProps) {
  return (
    <nav
      className={cx('tc-sidebar', className)}
      data-collapsed={collapsed ? 'true' : undefined}
      aria-label={label}
    >
      {brand && <div className="tc-sidebar__head">{brand}</div>}
      <div className="tc-sidebar__body">{children}</div>
      {footer && <div className="tc-sidebar__foot">{footer}</div>}
    </nav>
  );
}

export interface SidebarGroupProps {
  /** Omitted when the sidebar is collapsed — the rail has no room for a group label. */
  label?: string;
  children?: ReactNode;
}

/**
 * Sidebar items are grouped, not flat. The design's reason: Phase 2 (Lore, NPCs, Locations,
 * Quests, Factions, Notes) lands inside Campaign and Phase 3 (Maps) inside Session, without
 * moving anything the DM has already learned.
 */
export function SidebarGroup({ label, children }: SidebarGroupProps) {
  return (
    <div className="tc-navgroup" role="group" aria-label={label}>
      {label && <div className="tc-navgroup__label">{label}</div>}
      {children}
    </div>
  );
}

export interface NavItemProps {
  icon: IconName;
  label: string;
  count?: number;
  active?: boolean;
  collapsed?: boolean;
  /**
   * Element to render. Defaults to `button`; pass a router link component to make the
   * item navigate. The design system stays router-agnostic — the app supplies the link.
   */
  as?: ElementType;
  className?: string;
  /** Forwarded to the rendered element (`to`, `href`, `onClick`, …). */
  [key: string]: unknown;
}

export function NavItem({
  icon,
  label,
  count,
  active,
  collapsed,
  as: Component = 'button',
  className,
  ...rest
}: NavItemProps) {
  return (
    <Component
      {...rest}
      className={cx('tc-navitem', className)}
      data-active={active ? 'true' : undefined}
      aria-current={active ? 'page' : undefined}
      // Collapsed to the icon rail, the label is the only accessible name left.
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      {...(Component === 'button' ? { type: 'button' } : {})}
    >
      <Icon name={icon} />
      {!collapsed && <span className="tc-navitem__label">{label}</span>}
      {!collapsed && count !== undefined && <span className="tc-navitem__count">{count}</span>}
    </Component>
  );
}

export interface BottomNavItemSpec {
  id: string;
  icon: IconName;
  label: string;
  /** Numeric badge. The design uses it on Combat when it is the player's turn. */
  badge?: number;
}

export interface BottomNavProps {
  items: BottomNavItemSpec[];
  value: string;
  /** Element to render each item as. Defaults to `button`. */
  as?: ElementType;
  /** Builds the props for one item's element, e.g. `(item) => ({ to: paths[item.id] })`. */
  itemProps?: (item: BottomNavItemSpec) => Record<string, unknown>;
  onSelect?: (id: string) => void;
  label?: string;
  className?: string;
}

/**
 * The player's primary navigation. Ordered by frequency during a session, not by product
 * hierarchy. Sits above the safe-area inset and clears the 44px touch floor.
 */
export function BottomNav({
  items,
  value,
  as: Component = 'button',
  itemProps,
  onSelect,
  label = 'Primary',
  className,
}: BottomNavProps) {
  return (
    <nav className={cx('tc-bottomnav', className)} aria-label={label}>
      {items.map((item) => {
        const active = item.id === value;
        return (
          <Component
            key={item.id}
            {...(itemProps ? itemProps(item) : {})}
            {...(Component === 'button' ? { type: 'button' } : {})}
            className="tc-bottomnav__item"
            data-active={active ? 'true' : undefined}
            aria-current={active ? 'page' : undefined}
            onClick={onSelect ? () => onSelect(item.id) : undefined}
          >
            <Icon name={item.icon} weight={active ? 'fill' : 'regular'} />
            {item.label}
            {item.badge !== undefined && item.badge > 0 && (
              <span className="tc-bottomnav__badge">
                {item.badge}
                <span className="tc-visually-hidden"> notifications</span>
              </span>
            )}
          </Component>
        );
      })}
    </nav>
  );
}
