/**
 * The one line that says whether the work is safe.
 *
 * Three screens autosave, and before TC-P07 each said something different about a failure —
 * including one that said `Saved`. One component now, so the answer cannot drift again, and so
 * the failure case is impossible to render without the way out of it.
 *
 * Quiet by design: a word that changes, never a toast and never a spinner over the page. It
 * becomes loud only when a write actually failed, and then it carries a Retry, because a
 * status with no action is a screen telling somebody bad news and walking away.
 *
 * `role="status"` rather than an alert even in the failed case: it is polite, so it waits for
 * a natural pause instead of interrupting somebody mid-sentence. The failure is also visible,
 * coloured and actionable, so nothing depends on hearing it at once.
 */
import { Button } from '../design-system';
import { autosaveLabel, type Autosave } from './useAutosave';

export function SaveStatus<T>({ save, label }: { save: Autosave<T>; label?: string }) {
  const failed = save.status === 'failed';

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-8)' }}>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-size-11)',
          color: failed ? 'var(--color-danger-text)' : 'var(--color-text-tertiary)',
          whiteSpace: 'nowrap',
        }}
        role="status"
        aria-live="polite"
      >
        {save.status === 'idle' && label ? label : autosaveLabel(save.status)}
      </span>
      {failed && (
        <Button size="sm" variant="secondary" icon="arrow-clockwise" onClick={save.retry}>
          Try again
        </Button>
      )}
    </span>
  );
}
