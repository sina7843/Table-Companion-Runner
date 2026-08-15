/**
 * Whether the app is actually talking to anything.
 *
 * Two honest signals, no invented ones: the browser's own online/offline events, and
 * whether the last write succeeded. There is no transport yet — TC-13 brings one — so this
 * deliberately does not pretend to know about latency, sockets or server health. What it
 * does know is enough for the three states the design specifies, and each of them carries
 * a word as well as a colour.
 *
 * `restored` is the moment it comes back. A DM who looked away needs to be told their
 * fight is current again; they do not need it animating at them, so the flag clears itself
 * after a few seconds and nothing loops.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type ConnectionState = 'live' | 'reconnecting' | 'offline';

export interface Connection {
  state: ConnectionState;
  /** True briefly after a recovery, so a screen can say "back in sync" and then stop. */
  restored: boolean;
  /** Call after a write lands. */
  reportSuccess: () => void;
  /** Call when a write fails. Failures are what "reconnecting" actually means here. */
  reportFailure: () => void;
}

/** Long enough for a DM to notice on the way back to the screen, short enough to ignore. */
const RESTORED_MS = 4000;

export function useConnection(): Connection {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [failing, setFailing] = useState(false);
  const [restored, setRestored] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasDown = useRef(false);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const state: ConnectionState = !online ? 'offline' : failing ? 'reconnecting' : 'live';

  useEffect(() => {
    if (state !== 'live') {
      wasDown.current = true;
      setRestored(false);
      return;
    }
    if (!wasDown.current) return;

    wasDown.current = false;
    setRestored(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setRestored(false), RESTORED_MS);
  }, [state]);

  const reportSuccess = useCallback(() => setFailing(false), []);
  const reportFailure = useCallback(() => setFailing(true), []);

  return { state, restored, reportSuccess, reportFailure };
}
