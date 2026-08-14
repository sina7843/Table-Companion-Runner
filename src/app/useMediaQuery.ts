import { useSyncExternalStore } from 'react';

/**
 * Reads a media query reactively.
 *
 * useSyncExternalStore rather than useState + useEffect: it reads the current match
 * during render, so the shell never paints one frame at the wrong breakpoint.
 *
 * Needed because two of the design's responsive rules are attribute changes, not CSS —
 * the sidebar's collapsed state and the density axis both switch at --bp-xl, and
 * `[data-density]` cannot be set from a media query.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    // Server snapshot. Nothing renders on a server today, but returning false keeps
    // this honest if TC-13 ever introduces one: desktop is the assumption to avoid.
    () => false,
  );
}

/** The design's own breakpoints, from tokens/layout.css. */
export const BP = {
  sm: '(min-width: 480px)',
  md: '(min-width: 768px)',
  lg: '(min-width: 1024px)',
  xl: '(min-width: 1280px)',
  xxl: '(min-width: 1600px)',
} as const;
