/**
 * The realtime seam.
 *
 * A fight is the one thing in this product that several devices look at simultaneously, so
 * "who changed what" needs a shape before there is a server to send it. This file is that
 * shape and nothing more: an event union, a connection state, and a channel interface.
 *
 * Two implementations ship. `createLocalChannel` is a real channel with no infrastructure —
 * it uses the platform's own `BroadcastChannel`, so a DM tab and a player tab on the same
 * machine genuinely stay in step, which is what makes the seam testable today rather than
 * theoretically correct. `createSocketChannel` is the production one and is only ever
 * constructed when a URL has been configured; there is no default endpoint and no provider
 * to sign up to.
 *
 * The core publishes and subscribes. It never learns which implementation it has.
 */
import type {
  CampaignId,
  CharacterId,
  CombatInstanceId,
  EncounterTemplateId,
  MonsterId,
  RollId,
  Timestamp,
} from '../types.ts';

/**
 * What one device tells the others.
 *
 * Deliberately notifications, not payloads: an event says a thing changed and who changed
 * it, and the receiver re-reads through the repository. Shipping the new state in the event
 * would mean two sources of truth and a merge problem the moment two writes cross.
 */
export type DomainEvent =
  | { kind: 'combat.changed'; combatId: CombatInstanceId; at: Timestamp; origin: string }
  | { kind: 'combat.ended'; combatId: CombatInstanceId; at: Timestamp; origin: string }
  | {
      kind: 'roll.recorded';
      combatId: CombatInstanceId;
      rollId: RollId;
      at: Timestamp;
      origin: string;
    }
  | { kind: 'encounter.changed'; encounterId: EncounterTemplateId; at: Timestamp; origin: string }
  | { kind: 'character.changed'; characterId: CharacterId; at: Timestamp; origin: string }
  | { kind: 'monster.changed'; monsterId: MonsterId; at: Timestamp; origin: string }
  | { kind: 'campaign.changed'; campaignId: CampaignId; at: Timestamp; origin: string };

export type DomainEventKind = DomainEvent['kind'];

/**
 * An event as a publisher supplies it: the channel stamps `origin` and `at`.
 *
 * Distributive on purpose — a plain `Omit` over a union collapses to the keys every member
 * shares, which would have silently reduced every event to `{ kind }`.
 */
type Outgoing<T> = T extends unknown ? Omit<T, 'origin' | 'at'> & { at?: Timestamp } : never;
export type OutgoingEvent = Outgoing<DomainEvent>;

/** The three states the design specifies, each of which carries a word as well as a colour. */
export type ConnectionState = 'live' | 'reconnecting' | 'offline';

export type Unsubscribe = () => void;

export interface RealtimeChannel {
  readonly status: ConnectionState;
  /** Fires on every state change. Returns its own unsubscribe. */
  onStatus(handler: (state: ConnectionState) => void): Unsubscribe;
  /** Fires for events from *other* origins; a device does not hear its own echo. */
  subscribe(handler: (event: DomainEvent) => void): Unsubscribe;
  publish(event: OutgoingEvent): void;
  close(): void;
}

/**
 * Posts to a same-origin broadcast bus.
 *
 * Named so the call site reads as what it is: a BroadcastChannel has exactly one origin
 * and its `postMessage` takes no target, unlike `window.postMessage`.
 */
function send(bus: BroadcastChannel | null, event: DomainEvent): void {
  // oxlint-disable-next-line unicorn/require-post-message-target-origin
  bus?.postMessage(event);
}

/** Identifies this tab, so a device can ignore the events it caused. */
function newOrigin(): string {
  return `o-${Math.random().toString(36).slice(2, 10)}`;
}

interface ChannelState {
  status: ConnectionState;
  statusHandlers: Set<(state: ConnectionState) => void>;
  eventHandlers: Set<(event: DomainEvent) => void>;
}

function makeState(): ChannelState {
  return { status: 'live', statusHandlers: new Set(), eventHandlers: new Set() };
}

function setStatus(state: ChannelState, next: ConnectionState) {
  if (state.status === next) return;
  state.status = next;
  for (const handler of state.statusHandlers) handler(next);
}

/**
 * A channel with no server behind it.
 *
 * Same tab through the handler set, other tabs through `BroadcastChannel`. Connection state
 * tracks the browser's own online/offline events, because that is the only honest signal
 * available without a transport — it never claims to know about a server that is not there.
 */
export function createLocalChannel(name = 'table-companion'): RealtimeChannel {
  const origin = newOrigin();
  const state = makeState();

  const bus = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(name);

  const onMessage = (message: MessageEvent<DomainEvent>) => {
    const event = message.data;
    if (!event || event.origin === origin) return;
    for (const handler of state.eventHandlers) handler(event);
  };
  bus?.addEventListener('message', onMessage);

  const online = () => setStatus(state, 'live');
  const offline = () => setStatus(state, 'offline');
  if (typeof window !== 'undefined') {
    state.status = navigator.onLine ? 'live' : 'offline';
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
  }

  return {
    get status() {
      return state.status;
    },
    onStatus(handler) {
      state.statusHandlers.add(handler);
      return () => state.statusHandlers.delete(handler);
    },
    subscribe(handler) {
      state.eventHandlers.add(handler);
      return () => state.eventHandlers.delete(handler);
    },
    publish(event) {
      const full = { ...event, origin, at: event.at ?? new Date().toISOString() } as DomainEvent;
      // A BroadcastChannel is same-origin by construction and its postMessage takes no
      // target origin; the lint rule is written for `window.postMessage`. Calling through
      // the typed handle keeps the intent obvious and the rule quiet.
      send(bus, full);
    },
    close() {
      bus?.removeEventListener('message', onMessage);
      bus?.close();
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', online);
        window.removeEventListener('offline', offline);
      }
      state.statusHandlers.clear();
      state.eventHandlers.clear();
    },
  };
}

/** How long to wait before trying again, growing to a ceiling rather than hammering. */
const RETRY_MS = [1000, 2000, 5000, 10_000, 20_000];

/**
 * The production channel: a WebSocket at a URL the deployment supplies.
 *
 * Constructed only when `VITE_REALTIME_URL` is set. There is no default endpoint and no
 * third-party client library — a socket is a platform API, and picking a provider is a
 * decision that belongs to whoever deploys this, not to this file.
 */
export function createSocketChannel(url: string): RealtimeChannel {
  const origin = newOrigin();
  const state = makeState();
  state.status = 'reconnecting';

  let socket: WebSocket | null = null;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  /** Events published while the socket was down, sent in order once it returns. */
  const queued: DomainEvent[] = [];

  const connect = () => {
    if (closed) return;
    socket = new WebSocket(url);

    socket.addEventListener('open', () => {
      attempt = 0;
      setStatus(state, 'live');
      // Nothing is dropped by a reconnect: the queue is what the DM did while it was down.
      while (queued.length > 0) {
        const next = queued.shift();
        if (next) socket?.send(JSON.stringify(next));
      }
    });

    socket.addEventListener('message', (message: MessageEvent<string>) => {
      try {
        const event = JSON.parse(message.data) as DomainEvent;
        if (event.origin === origin) return;
        for (const handler of state.eventHandlers) handler(event);
      } catch {
        // A malformed frame is not worth tearing the fight down for; the next read of the
        // repository is authoritative anyway.
      }
    });

    const retry = () => {
      if (closed) return;
      setStatus(state, navigator.onLine ? 'reconnecting' : 'offline');
      const wait = RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)] ?? 20_000;
      attempt += 1;
      timer = setTimeout(connect, wait);
    };

    socket.addEventListener('close', retry);
    socket.addEventListener('error', () => socket?.close());
  };

  connect();

  return {
    get status() {
      return state.status;
    },
    onStatus(handler) {
      state.statusHandlers.add(handler);
      return () => state.statusHandlers.delete(handler);
    },
    subscribe(handler) {
      state.eventHandlers.add(handler);
      return () => state.eventHandlers.delete(handler);
    },
    publish(event) {
      const full = { ...event, origin, at: event.at ?? new Date().toISOString() } as DomainEvent;
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(full));
      else queued.push(full);
    },
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      socket?.close();
      state.statusHandlers.clear();
      state.eventHandlers.clear();
    },
  };
}

/** A channel that does nothing, for tests and for a surface with no fight in it. */
export function createNullChannel(): RealtimeChannel {
  return {
    status: 'live',
    onStatus: () => () => {},
    subscribe: () => () => {},
    publish: () => {},
    close: () => {},
  };
}
