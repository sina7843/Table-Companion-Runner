/**
 * Whether the app is actually talking to anything.
 *
 * Three honest signals, no invented ones: the browser's own online/offline events, whether the
 * last write succeeded, and — since TC-P05 — what the event stream says about itself. None of
 * them pretends to know about latency or server health. What they know is enough for the three
 * states the design specifies, and each of them carries a word as well as a colour.
 *
 * `restored` is the moment the connection comes back. `resyncing` is the narrower thing that
 * happens when the stream could not say what was missed and the screens are re-reading. Both
 * clear themselves after a few seconds — a DM who looked away needs to be told their fight is
 * current again, and does not need it animating at them.
 *
 * Neither blocks anything. A screen stays usable while it reconnects: the writes it makes are
 * commands against a version, so a stale one is refused by the server rather than by a banner
 * that stopped somebody acting.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useChannelStatus, useRealtime, useTelemetry } from '../domain';

export type ConnectionState = 'live' | 'reconnecting' | 'offline';

export interface Connection {
  state: ConnectionState;
  /** True briefly after a recovery, so a screen can say "back in sync" and then stop. */
  restored: boolean;
  /**
   * True briefly after the stream said it had fallen behind.
   *
   * Distinct from `restored`: the connection may never have dropped from this device's point
   * of view, and what is stale is the screen rather than the socket.
   */
  resyncing: boolean;
  /** Call after a write lands. */
  reportSuccess: () => void;
  /** Call when a write fails. Failures are what "reconnecting" actually means here. */
  reportFailure: () => void;
}

/** Long enough for a DM to notice on the way back to the screen, short enough to ignore. */
const RESTORED_MS = 4000;

export function useConnection(): Connection {
  // The channel is the better signal when there is one: a socket knows it has dropped
  // before the browser notices anything. With the local channel this reduces to the
  // online/offline events below, which is the honest answer when nothing is deployed.
  const channelStatus = useChannelStatus();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [failing, setFailing] = useState(false);
  const [restored, setRestored] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const resyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (resyncTimer.current) clearTimeout(resyncTimer.current);
    },
    [],
  );

  // The stream could not say what was missed, so every screen is re-reading. Say so, briefly.
  // `useRealtime` delivers `sync.required` to every subscriber whatever kinds it asked for.
  const telemetry = useTelemetry();
  useRealtime([], () => {
    setResyncing(true);
    telemetry({ name: 'realtime_resynced' });
    if (resyncTimer.current) clearTimeout(resyncTimer.current);
    resyncTimer.current = setTimeout(() => setResyncing(false), RESTORED_MS);
  });

  const state: ConnectionState =
    !online || channelStatus === 'offline'
      ? 'offline'
      : failing || channelStatus === 'reconnecting'
        ? 'reconnecting'
        : 'live';

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

  return { state, restored, resyncing, reportSuccess, reportFailure };
}
