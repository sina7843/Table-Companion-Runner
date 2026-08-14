import type { ButtonHTMLAttributes, ReactNode } from 'react';
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
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      // The label is swapped to transparent while loading, so the button keeps its
      // width and the layout does not jump. It must also stop accepting clicks.
      // `||` not `??`: an explicit `disabled={false}` must not re-enable a loading button.
      disabled={disabled || loading}
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
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName;
  /** Required: an icon-only control has no visible text to announce. */
  label: string;
  size?: ControlSize;
  variant?: 'plain' | 'outlined' | 'danger';
  active?: boolean;
}

export function IconButton({
  icon,
  label,
  size = 'md',
  variant = 'plain',
  active,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      {...rest}
      type={type}
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
    </button>
  );
}
