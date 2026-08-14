import { useEffect, useRef, type ReactNode } from 'react';
import { SidePanel } from '../design-system';

export interface ContextPanelProps {
  open: boolean;
  onClose: () => void;
  eyebrow?: ReactNode;
  title: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

/**
 * The reusable contextual right-side panel.
 *
 * One component, two rendered modes, both driven by `shell.css`:
 *   ≥ 1280px  docked in the layout flow, in its own column
 *   < 1280px  a non-modal drawer, with the workspace reserving its width
 *
 * It is deliberately NOT the design system's `Drawer`. That is built on
 * `<dialog>.showModal()`, which traps focus, makes the background inert and paints a
 * scrim. The design is explicit that the tablet context panel does none of those things:
 * "Nothing behind the drawer is blocked, and no scrim appears — the DM is still running
 * a fight." Use `Drawer` for a genuine interruption; use this for context.
 *
 * Escape closes it, and focus moves into the panel when it opens and returns to whatever
 * opened it when it closes — the parts of a dialog that help without taking over.
 */
export function ContextPanel({
  open,
  onClose,
  eyebrow,
  title,
  actions,
  children,
}: ContextPanelProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    // Both captured inside the effect: by the time cleanup runs the panel has already
    // unmounted, so reading `ref.current` there would see null and skip the restore.
    const node = ref.current;
    const restoreTo = document.activeElement as HTMLElement | null;

    // Move focus to the panel so a keyboard user lands on the new content rather than
    // continuing from wherever the row they clicked happened to be.
    node?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // Only pull focus back if it is still inside the panel — if the user has moved
      // on to the fight, yanking it would be worse than leaving it alone.
      if (node?.contains(document.activeElement)) restoreTo?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="tc-shell__panel" ref={ref} tabIndex={-1}>
      <SidePanel eyebrow={eyebrow} title={title} actions={actions} onClose={onClose} wide>
        {children}
      </SidePanel>
    </div>
  );
}
