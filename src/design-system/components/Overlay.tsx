import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { IconButton } from './Button';
import { cx } from './types';

/**
 * Drives a native <dialog> from a React `open` prop.
 *
 * showModal() is what supplies the focus trap, the inert background, Escape handling
 * and top-layer stacking — none of which is reimplemented here. The `cancel` event
 * fires on Escape; it is intercepted so React state stays the source of truth rather
 * than the DOM closing itself behind React's back.
 */
function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener('cancel', onCancel);
    return () => dialog.removeEventListener('cancel', onCancel);
  }, [onClose]);

  return ref;
}

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  footer?: ReactNode;
  children?: ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  footer,
  children,
}: ModalProps) {
  const ref = useDialog(open, onClose);
  const titleId = useId();
  const descId = useId();

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      className={cx('tc-modal', size !== 'md' && `tc-modal--${size}`)}
      // Clicking the backdrop lands on the dialog element itself, never on its children.
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="tc-overlay__head">
        <div className="tc-overlay__titles">
          <span className="tc-overlay__title" id={titleId}>
            {title}
          </span>
          {description && (
            <span className="tc-overlay__desc" id={descId}>
              {description}
            </span>
          )}
        </div>
        <IconButton icon="x" label="Close" size="sm" onClick={onClose} />
      </div>
      <div className="tc-overlay__body">{children}</div>
      {footer && <div className="tc-overlay__foot">{footer}</div>}
    </dialog>
  );
}

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  side?: 'right' | 'left';
  footer?: ReactNode;
  children?: ReactNode;
}

/**
 * The overflow drawer. Note the design system's rule: a docked SidePanel is the desktop
 * default and this is the below-1280px fallback — reach for the panel first.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  side = 'right',
  footer,
  children,
}: DrawerProps) {
  const ref = useDialog(open, onClose);
  const titleId = useId();
  const descId = useId();

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      className={cx('tc-drawer', side === 'left' && 'tc-drawer--left')}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="tc-overlay__head">
        <div className="tc-overlay__titles">
          <span className="tc-overlay__title" id={titleId}>
            {title}
          </span>
          {description && (
            <span className="tc-overlay__desc" id={descId}>
              {description}
            </span>
          )}
        </div>
        <IconButton icon="x" label="Close" size="sm" onClick={onClose} />
      </div>
      <div className="tc-overlay__body">{children}</div>
      {footer && <div className="tc-overlay__foot">{footer}</div>}
    </dialog>
  );
}

export interface TooltipProps {
  content: ReactNode;
  /** Keyboard hint rendered in the mono face, e.g. `⌘K`. */
  shortcut?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Shows on hover AND on keyboard focus — a hover-only tooltip is invisible to anyone
 * navigating by keyboard. The content is wired through `aria-describedby` rather than
 * `title`, so it is announced without the browser's own delayed native bubble.
 */
export function Tooltip({ content, shortcut, children, className }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  return (
    <span
      className={cx('tc-tooltip-anchor', className)}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      <span aria-describedby={id}>{children}</span>
      <span className="tc-tooltip" role="tooltip" id={id} hidden={!visible}>
        {content}
        {shortcut && <kbd>{shortcut}</kbd>}
      </span>
    </span>
  );
}

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
}

/**
 * The phone's overlay: a sheet that rises from the bottom edge.
 *
 * One sheet holds a whole outcome — the roll, what it means, and the action it offers —
 * rather than three stacked dialogs. It is a native `<dialog>` for the same reason the
 * modal is: the focus trap, the inert background and Escape come from the platform.
 *
 * Its footer is where the primary action lives, because on a phone that is where the
 * thumb already is.
 */
export function Sheet({ open, onClose, title, description, footer, children }: SheetProps) {
  const ref = useDialog(open, onClose);
  const titleId = useId();
  const descId = useId();

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      className="tc-sheet"
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <span className="tc-sheet__grab" aria-hidden="true" />
      <div className="tc-overlay__head">
        <div className="tc-overlay__titles">
          <span className="tc-overlay__title" id={titleId}>
            {title}
          </span>
          {description && (
            <span className="tc-overlay__desc" id={descId}>
              {description}
            </span>
          )}
        </div>
        <IconButton icon="x" label="Close" onClick={onClose} />
      </div>
      <div className="tc-overlay__body">{children}</div>
      {footer && <div className="tc-overlay__foot">{footer}</div>}
    </dialog>
  );
}
