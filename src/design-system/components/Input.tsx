import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type TextareaHTMLAttributes,
} from 'react';
import { Icon } from './Icon';
import { cx, type IconName } from './types';

export interface FieldProps {
  label: ReactNode;
  /** Helper text below the control. Hidden while `error` is showing. */
  help?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  optional?: boolean;
  horizontal?: boolean;
  className?: string;
  /** Receives the generated id so the control and its label stay wired together. */
  children: (ids: { id: string; describedBy: string | undefined }) => ReactNode;
}

/**
 * Label + help + error wrapper. Owns the id wiring so no caller has to hand-roll
 * `aria-describedby`, which is the part that silently rots.
 */
export function Field({
  label,
  help,
  error,
  required,
  optional,
  horizontal,
  className,
  children,
}: FieldProps) {
  const id = useId();
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const describedBy = error ? errorId : help ? helpId : undefined;

  return (
    <div className={cx('tc-field', horizontal && 'tc-field--horizontal', className)}>
      <label className="tc-field__label" htmlFor={id}>
        {label}
        {required && (
          <span className="tc-field__req" aria-hidden="true">
            *
          </span>
        )}
        {optional && <span className="tc-field__optional">optional</span>}
      </label>
      {children({ id, describedBy })}
      {error ? (
        <span className="tc-field__error" id={errorId} role="alert">
          <Icon name="warning-circle" size={12} />
          {error}
        </span>
      ) : (
        help && (
          <span className="tc-field__help" id={helpId}>
            {help}
          </span>
        )
      )}
    </div>
  );
}

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  invalid?: boolean;
  icon?: IconName;
  suffix?: ReactNode;
  mono?: boolean;
  numeric?: boolean;
  /** Forwarded to the input, so a screen can focus it from a keyboard shortcut. */
  ref?: Ref<HTMLInputElement>;
}

export function TextInput({
  invalid,
  icon,
  suffix,
  mono,
  numeric,
  className,
  type = 'text',
  ref,
  ...rest
}: TextInputProps) {
  const input = (
    <input
      {...rest}
      ref={ref}
      type={type}
      data-invalid={invalid ? 'true' : undefined}
      aria-invalid={invalid || undefined}
      className={cx(
        'tc-input',
        mono && 'tc-input--mono',
        numeric && 'tc-input--numeric',
        className,
      )}
    />
  );

  if (!icon && !suffix) return input;

  return (
    <span className="tc-inputwrap">
      {icon && (
        <span className="tc-inputwrap__icon">
          <Icon name={icon} />
        </span>
      )}
      {input}
      {suffix && <span className="tc-inputwrap__suffix">{suffix}</span>}
    </span>
  );
}

// TextareaHTMLAttributes, not InputHTMLAttributes: the two differ (`rows`, `cols`, `wrap`),
// and the wrong one silently rejects valid textarea props.
export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export function Textarea({ invalid, className, ...rest }: TextareaProps) {
  return (
    <textarea
      {...rest}
      data-invalid={invalid ? 'true' : undefined}
      aria-invalid={invalid || undefined}
      className={cx('tc-input', 'tc-input--textarea', className)}
    />
  );
}

export interface NumberInputProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Required: the control is a bare number with no visible label of its own. */
  ariaLabel: string;
  /** Overrides the CSS default of 56px, which is wide for a count of goblins. */
  width?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * A number with its own steppers.
 *
 * Typing is the fast path and the buttons are the accurate one; both are reachable by
 * keyboard, and the value is clamped in one place so no caller has to remember the range.
 */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  ariaLabel,
  width,
  disabled,
  className,
}: NumberInputProps) {
  const clamp = (next: number) =>
    Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, next));

  return (
    <span className={cx('tc-number', className)}>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled || (min !== undefined && value <= min)}
        onClick={() => onChange(clamp(value - step))}
      >
        <Icon name="minus" size={12} />
      </button>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        step={step}
        aria-label={ariaLabel}
        disabled={disabled}
        style={width ? { width } : undefined}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(clamp(next));
        }}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled || (max !== undefined && value >= max)}
        onClick={() => onChange(clamp(value + step))}
      >
        <Icon name="plus" size={12} />
      </button>
    </span>
  );
}

export interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Visible text beside the track, or the accessible name when `hideLabel` is set. */
  label: ReactNode;
  hideLabel?: boolean;
  disabled?: boolean;
  className?: string;
}

/** A two-state toggle that applies immediately. Never use it for a form that submits. */
export function Switch({ checked, onChange, label, hideLabel, disabled, className }: SwitchProps) {
  return (
    <label className={cx('tc-switch', className)} data-disabled={disabled ? 'true' : undefined}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="tc-switch__track" />
      <span className={hideLabel ? 'tc-visually-hidden' : undefined}>{label}</span>
    </label>
  );
}
