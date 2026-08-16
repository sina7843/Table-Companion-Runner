/**
 * Product telemetry: a boundary, and by default nothing behind it.
 *
 * The prompt for this is "minimal, provider-neutral, no secrets, not invasive", and the way to
 * satisfy all four at once is to ship the seam and no provider. There is no vendor script, no
 * network call, no identifier minted here, and no configuration that would need one — a
 * deployment that wants analytics supplies a sink; a deployment that does not gets a function
 * that returns.
 *
 * What may be recorded is a closed union, not a string. That is the whole design: an open
 * `track(name, props)` becomes invasive one careless call at a time, because the easiest thing
 * to reach for at the call site is whatever is in scope — a character name, an email, a roll.
 * Adding an event here is a deliberate edit to a list somebody can read in full.
 *
 * The rule every event obeys: **it names what happened, never who or what it happened to.**
 * No ids, no names, no free text, no user input. `save_failed` says a save failed and which
 * kind of document, and stops there. `combat_conflict` says two people acted at once. Neither
 * says which fight, which is what would make it a record of a session rather than a count.
 */
import { createContext, useContext } from 'react';

/**
 * Everything the product may report.
 *
 * These are the states TC-P07 exists to make coherent — an operator needs to know they are
 * happening, and the numbers are the only way to find out that, say, autosave fails constantly
 * on one deployment. Nothing here is a funnel step or a feature-usage metric; that is the
 * "not invasive" line.
 */
export type TelemetryEvent =
  /** A session ended while somebody was using the app. */
  | { name: 'session_expired' }
  /** A save failed. `kind` is the sort of document, never which one. */
  | { name: 'save_failed'; kind: 'character-draft' | 'encounter' | 'monster' | 'combat' }
  /** A failed save later succeeded, with no data lost. */
  | { name: 'save_recovered'; kind: 'character-draft' | 'encounter' | 'monster' | 'combat' }
  /** Two people changed one fight at once and the second was refused and re-read. */
  | { name: 'combat_conflict' }
  /** The realtime stream could not say what was missed, so the screens re-read. */
  | { name: 'realtime_resynced' }
  /** An invite code was refused. Not which code, and not by whom. */
  | { name: 'invite_rejected' };

export type TelemetrySink = (event: TelemetryEvent) => void;

/**
 * The default, and the one a test gets: a function that does nothing.
 *
 * Not `null` with a guard at every call site — a no-op is the same shape as a real sink, so
 * the code that reports is identical whether anything is listening or not.
 */
export const noopSink: TelemetrySink = () => {};

const TelemetryCtx = createContext<TelemetrySink>(noopSink);

export const TelemetryProvider = TelemetryCtx.Provider;

/** The sink, for a screen that has something to report. Never null. */
export function useTelemetry(): TelemetrySink {
  return useContext(TelemetryCtx);
}
