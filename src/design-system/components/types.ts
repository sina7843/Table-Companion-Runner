/**
 * Shared vocabulary for the design-system adapters.
 *
 * These names are taken from the approved design system's own CSS modifiers, not
 * invented here. Adding a value to any of these unions means the design system has
 * grown a matching `tc-*` rule — check the CSS first.
 */

/** Status tones. The system has exactly these five; there is no sixth hue. */
export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

/** Control sizes, mapped to the `--density-control-height*` tokens. */
export type ControlSize = 'sm' | 'md' | 'lg';

/**
 * A Phosphor icon name without the `ph-` prefix, e.g. `sword`, `heartbeat`, `dice-six`.
 * Left as a string: the full Phosphor set is ~9,000 names and pinning them into a union
 * would need regenerating on every icon-font bump for no real safety gain.
 */
export type IconName = string;

/** Hit-point bands, matching the `[data-band]` selectors in combat.css. */
export type HPBand = 'healthy' | 'damaged' | 'critical' | 'down';

/** Realtime hit-point change flash, matching the `[data-delta]` selectors. */
export type HPDeltaKind = 'damage' | 'healing' | 'temp';

/** Entity types. Always paired with an icon and a word, never colour alone. */
export type EntityType = 'player' | 'monster' | 'npc' | 'ally';

/** Connection states. Each carries a word and a glyph, never only a coloured dot. */
export type ConnectionState = 'live' | 'reconnecting' | 'offline';

/** Dice outcome tints on RollResult. */
export type RollOutcome = 'normal' | 'critical' | 'fumble';

/** Advantage state on a dice button. */
export type Advantage = 'none' | 'advantage' | 'disadvantage';

/** Density axis. Independent of viewport — a mobile sheet and a DM table differ by this. */
export type Density = 'comfortable' | 'compact' | 'touch';

/** Theme axis. Dark is the default and the primary session-running environment. */
export type Theme = 'dark' | 'light';

/** Joins class names, dropping anything falsy. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/**
 * Hit-point band from current/max.
 *
 * ponytail: the approved design defines the four band *colours* but never states the
 * thresholds. These are inferred from the design's own sample data — 12/41 (29%) is
 * labelled "Bloodied", which is the warning/`damaged` tone, so `critical` has to sit
 * below that. Move these two numbers if the rules engine in TC-03 defines them properly;
 * they are deliberately the only place the split is expressed.
 */
export function hpBand(current: number, max: number): HPBand {
  if (current <= 0) return 'down';
  if (max <= 0) return 'healthy';
  const ratio = current / max;
  if (ratio <= 0.25) return 'critical';
  if (ratio <= 0.5) return 'damaged';
  return 'healthy';
}
