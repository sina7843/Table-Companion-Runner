import type { ElementType, ReactNode } from 'react';
import { Icon } from './Icon';
import { cx, type IconName } from './types';

export interface SectionHeaderProps {
  title: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  /** A glyph before the title. The design uses one where a section names a kind of thing. */
  icon?: IconName;
  /** Sub-sections drop to the sans face and a single hairline rule. */
  sub?: boolean;
  className?: string;
}

/**
 * Hierarchy without a container. The design system uses this far more often than a
 * card — a rule, a section head and spacing, which is what stops a dashboard reading
 * as five unrelated products.
 */
export function SectionHeader({
  title,
  eyebrow,
  actions,
  icon,
  sub,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cx('tc-section', sub && 'tc-section--sub', className)}>
      <span className="tc-section__title">
        {icon && <Icon name={icon} />}
        {eyebrow && <span className="tc-section__eyebrow">{eyebrow}</span>}
        {title}
      </span>
      {actions && <span className="tc-section__actions">{actions}</span>}
    </div>
  );
}

export interface ListRowProps {
  title: ReactNode;
  meta?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  /** Non-interactive row — renders as a div, not a button. */
  static?: boolean;
  /** Element to render. Pass a router link when the row navigates. */
  as?: ElementType;
  className?: string;
  /** Forwarded to the rendered element (`to`, `href`, …) when `as` is set. */
  [key: string]: unknown;
}

export function ListRow({
  title,
  meta,
  leading,
  trailing,
  selected,
  onClick,
  static: isStatic,
  as: Component,
  className,
  ...rest
}: ListRowProps) {
  const content = (
    <>
      {leading}
      <span className="tc-row__main">
        <span className="tc-row__title">{title}</span>
        {meta && <span className="tc-row__meta">{meta}</span>}
      </span>
      {trailing && <span className="tc-row__trail">{trailing}</span>}
    </>
  );

  if (Component) {
    return (
      <Component {...rest} className={cx('tc-row', className)} aria-selected={selected}>
        {content}
      </Component>
    );
  }

  if (isStatic || !onClick) {
    return (
      <div className={cx('tc-row', 'tc-row--static', className)} aria-selected={selected}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={cx('tc-row', className)}
      aria-selected={selected}
      onClick={onClick}
    >
      {content}
    </button>
  );
}

export interface TableColumn<Row> {
  key: string;
  label: string;
  /** Right-aligned with tabular figures. */
  numeric?: boolean;
  /** Rendered in primary ink at semibold — one column per table. */
  primary?: boolean;
  width?: number;
  render?: (row: Row) => ReactNode;
}

export interface TableProps<Row> {
  columns: TableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /** Accessible name, e.g. "Party". */
  label: string;
  selectedKey?: string;
  onRowClick?: (row: Row) => void;
  className?: string;
}

export function Table<Row extends Record<string, unknown>>({
  columns,
  rows,
  rowKey,
  label,
  selectedKey,
  onRowClick,
  className,
}: TableProps<Row>) {
  return (
    <table className={cx('tc-table', className)}>
      <caption className="tc-visually-hidden">{label}</caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              scope="col"
              style={column.width ? { width: `${column.width}px` } : undefined}
              className={cx(column.numeric && 'tc-table__num')}
            >
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const key = rowKey(row);
          return (
            <tr
              key={key}
              aria-selected={selectedKey === key || undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cx(
                    column.numeric && 'tc-table__num',
                    column.primary && 'tc-table__primary',
                  )}
                >
                  {column.render ? column.render(row) : String(row[column.key] ?? '')}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
