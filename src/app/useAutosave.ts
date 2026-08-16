/**
 * Autosave for the three screens that edit a document rather than submit a form: the character
 * builder, the encounter builder and the homebrew monster editor.
 *
 * All three had their own copy of this, and the copies had drifted into three different
 * answers to "what happens when the save fails" — one showed `Saved`, one showed `Not saved
 * yet` and only one kept the edit to try again. The first of those is the bug this exists to
 * remove: **a failed write is never reported as a saved one.**
 *
 * What it guarantees, in order of how much a user would mind losing it:
 *
 * 1. **A failed edit is kept.** It stays pending, so the next edit and the Try again button
 *    both carry it. Nothing is dropped because a request failed.
 * 2. **Leaving flushes.** A debounce that only fires on a timer loses the last thing somebody
 *    typed before they clicked away — every exit path writes what is queued first.
 * 3. **Closing the tab warns.** While an edit is unsaved, `beforeunload` is armed. The browser
 *    decides the wording; the app's only job is to not let the work disappear silently.
 * 4. **A late response never reports success over a newer edit.** A response that arrives after
 *    the next edit was queued settles nothing.
 *
 * It does not retry on its own. A screen nobody is looking at retrying in a loop is how a
 * failing deployment turns into a busy one, and the person who knows whether the work still
 * matters is the one at the keyboard.
 *
 * The state machine is a plain object rather than hook internals, because this project has no
 * DOM test environment and "a failed save must never read as saved" is exactly the kind of
 * rule that has to be *tested* rather than reviewed. `autosave.test.ts` drives this directly.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

export interface AutosaveState {
  status: AutosaveStatus;
  /** The server's own sentence when the last attempt failed, else null. */
  error: string | null;
  /** True while an edit exists that the server has not accepted. */
  unsaved: boolean;
}

export interface AutosaveOptions {
  debounceMs?: number;
  /** Called once when a run of failures starts. */
  onFailure?: () => void;
  /** Called once when a run of failures ends in a success. */
  onRecovery?: () => void;
  /** Injected by the test; real callers get the platform's. */
  schedule?: (run: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
}

export interface AutosaveEngine<T> {
  state(): AutosaveState;
  subscribe(listener: () => void): () => void;
  /** Queues a value. Debounced. */
  save(next: T): void;
  /** Writes whatever is queued now — for Start, Finish, or leaving the screen. */
  flush(): Promise<void>;
  /** Sends the failed value again, unchanged. */
  retry(): void;
  /** Fires a queued write without waiting for it. For unmount, which cannot wait. */
  abandon(): void;
}

/** Long enough that typing a backstory is one write, short enough to feel automatic. */
const DEBOUNCE_MS = 500;

const IDLE: AutosaveState = { status: 'idle', error: null, unsaved: false };

export function createAutosave<T>(
  write: (value: T) => Promise<unknown>,
  options: AutosaveOptions = {},
): AutosaveEngine<T> {
  const schedule = options.schedule ?? ((run, ms) => setTimeout(run, ms));
  const cancel =
    options.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const debounceMs = options.debounceMs ?? DEBOUNCE_MS;

  const listeners = new Set<() => void>();
  let state: AutosaveState = IDLE;
  let timer: unknown = null;
  let pending: { value: T } | null = null;
  let failing = false;

  function set(next: AutosaveState) {
    // Referential stability matters: `useSyncExternalStore` re-renders on identity, and a
    // fresh object per notification would re-render a builder on every keystroke's timer.
    if (
      next.status === state.status &&
      next.error === state.error &&
      next.unsaved === state.unsaved
    ) {
      return;
    }
    state = next;
    for (const listener of listeners) listener();
  }

  function send(value: T): Promise<void> {
    pending = null;
    set({ status: 'saving', error: null, unsaved: true });

    return write(value).then(
      () => {
        // A newer edit landed while this one was in flight; that one owns the outcome, and
        // reporting `Saved` here would be reporting it about the wrong value.
        if (pending !== null) return;
        set({ status: 'saved', error: null, unsaved: false });
        if (failing) {
          failing = false;
          options.onRecovery?.();
        }
      },
      (failure: unknown) => {
        // Kept, so the next edit and Try again both carry it. This is the whole point.
        pending = { value };
        set({
          status: 'failed',
          error:
            failure instanceof Error
              ? failure.message
              : 'That change was not saved. It is still here — try again.',
          unsaved: true,
        });
        if (!failing) {
          failing = true;
          options.onFailure?.();
        }
      },
    );
  }

  return {
    state: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    save(next) {
      pending = { value: next };
      set({ status: 'saving', error: state.error, unsaved: true });
      if (timer !== null) cancel(timer);
      timer = schedule(() => {
        timer = null;
        void send(next);
      }, debounceMs);
    },
    flush() {
      if (timer !== null) cancel(timer);
      timer = null;
      const next = pending;
      return next === null ? Promise.resolve() : send(next.value);
    },
    retry() {
      const next = pending;
      if (next !== null) void send(next.value);
    },
    abandon() {
      if (timer !== null) cancel(timer);
      timer = null;
      if (pending !== null) void write(pending.value);
    },
  };
}

export interface Autosave<T> extends AutosaveState {
  save: (next: T) => void;
  flush: () => Promise<void>;
  retry: () => void;
}

export function useAutosave<T>(
  write: (value: T) => Promise<unknown>,
  options: Omit<AutosaveOptions, 'schedule' | 'cancel'> = {},
): Autosave<T> {
  // Refs, not dependencies: a caller's inline closure is a new function every render, and
  // rebuilding the engine per render would mean a document that never quite saves.
  const writeRef = useRef(write);
  writeRef.current = write;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const engineRef = useRef<AutosaveEngine<T> | null>(null);
  engineRef.current ??= createAutosave<T>((value) => writeRef.current(value), {
    get debounceMs() {
      return optionsRef.current.debounceMs;
    },
    onFailure: () => optionsRef.current.onFailure?.(),
    onRecovery: () => optionsRef.current.onRecovery?.(),
  });
  const engine = engineRef.current;

  const state = useSyncExternalStore(engine.subscribe, engine.state, engine.state);

  // Leaving the screen writes what is queued. The write is fired rather than awaited —
  // unmount cannot wait — but it is fired, which is the difference between an edit that is
  // in flight and an edit that never happened.
  useEffect(() => () => engine.abandon(), [engine]);

  // Closing the tab with work outstanding asks first. Armed only while there is something to
  // lose, so the prompt is never a surprise on a screen that is fully saved.
  useEffect(() => {
    if (!state.unsaved) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [state.unsaved]);

  return { ...state, save: engine.save, flush: engine.flush, retry: engine.retry };
}

/**
 * The words for a status, in one place because three screens show them.
 *
 * `failed` says the work is still here, because that is what somebody in that state actually
 * wants to know and it is true — the engine is holding it.
 */
export function autosaveLabel(status: AutosaveStatus): string {
  switch (status) {
    case 'saving':
      return 'Saving…';
    case 'saved':
      return 'Saved';
    case 'failed':
      return 'Not saved — your work is still here';
    default:
      return 'No changes yet';
  }
}
