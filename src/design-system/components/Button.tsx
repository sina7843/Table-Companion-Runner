import type { ButtonHTMLAttributes, ElementType, ReactNode } from 'react';
import { Icon } from './Icon';
import { cx, type ControlSize, type IconName } from './types';

export type ButtonVariant =
  'primary' | 'secondary' | 'tertiary' | 'destructive' | 'destructive-quiet' | 'accent-quiet';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant;
  size?: ControlSize;
  icon?: IconName;
  iconRight?: IconName;
  block?: boolean;
  loading?: boolean;
  children?: ReactNode;
  /**
   * Element to render. Defaults to `button`; pass a router link component when the
   * control navigates, so it is a real link — middle-click, open-in-new-tab and the
   * "link" role all keep working. The design system stays router-agnostic.
   */
  as?: ElementType;
  /** Forwarded to the rendered element (`to`, `href`, …) when `as` is set. */
  [key: string]: unknown;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  block,
  loading,
  disabled,
  className,
  children,
  as: Component = 'button',
  type,
  ...rest
}: ButtonProps) {
  const isButton = Component === 'button';

  return (
    <Component
      {...rest}
      {...(isButton
        ? {
            type: type ?? 'button',
            // The label is swapped to transparent while loading, so the button keeps its
            // width and the layout does not jump. It must also stop accepting clicks.
            // `||` not `??`: `disabled={false}` must not re-enable a loading button.
            disabled: disabled || loading,
          }
        : // A link cannot be `disabled`; the equivalent is removing it from the tab order
          // and telling assistive tech, which is what aria-disabled does.
          { 'aria-disabled': disabled || loading || undefined })}
      data-loading={loading ? 'true' : undefined}
      aria-busy={loading || undefined}
      className={cx(
        'tc-btn',
        `tc-btn--${variant}`,
        size !== 'md' && `tc-btn--${size}`,
        block && 'tc-btn--block',
        className,
      )}
    >
      {icon && <Icon name={icon} />}
      {children}
      {iconRight && <Icon name={iconRight} />}
      {loading && (
        <span className="tc-btn__spinner">
          <span className="tc-spinner" />
        </span>
      )}
    </Component>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName;
  /** Required: an icon-only control has no visible text to announce. */
  label: string;
  size?: ControlSize;
  variant?: 'plain' | 'outlined' | 'danger';
  active?: boolean;
  /** Element to render. Pass a router link when the control navigates. */
  as?: ElementType;
  /** Forwarded to the rendered element (`to`, `href`, …) when `as` is set. */
  [key: string]: unknown;
}

export function IconButton({
  icon,
  label,
  size = 'md',
  variant = 'plain',
  active,
  className,
  as: Component = 'button',
  type,
  ...rest
}: IconButtonProps) {
  const isButton = Component === 'button';

  return (
    <Component
      {...rest}
      {...(isButton ? { type: type ?? 'button' } : {})}
      aria-label={label}
      title={label}
      data-active={active ? 'true' : undefined}
      className={cx(
        'tc-iconbtn',
        size !== 'md' && `tc-iconbtn--${size}`,
        variant !== 'plain' && `tc-iconbtn--${variant}`,
        className,
      )}
    >
      <Icon name={icon} />
    </Component>
  );
}
