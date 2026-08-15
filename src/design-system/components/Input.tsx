import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
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
}

export function TextInput({
  invalid,
  icon,
  suffix,
  mono,
  numeric,
  className,
  type = 'text',
  ...rest
}: TextInputProps) {
  const input = (
    <input
      {...rest}
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
