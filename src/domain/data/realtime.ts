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
 * theoretically correct, and TC-P05 kept it as the explicit development adapter.
 * `createEventStreamChannel` is the production one and is only ever constructed when a URL has
 * been configured; there is no default endpoint and no provider to sign up to.
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
  | { kind: 'campaign.changed'; campaignId: CampaignId; at: Timestamp; origin: string }
  /**
   * Whatever you are holding, throw it away and read again.
   *
   * Sent when the stream cannot honestly say what was missed — a reconnect outside the
   * replay window, or a server that has restarted. It is deliberately not a list of events
   * to catch up on: reconstructing state from a partial history is how a client ends up
   * confidently wrong, and the database is one read away.
   */
  | { kind: 'sync.required'; reason: string; at: Timestamp; origin: string };

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
  /**
   * Who decides what is announced.
   *
   * `server` means a deployment is broadcasting after it commits, and a client publishing
   * would be a client inventing events — so `withRealtime` stays quiet. `local` is the
   * development adapter, where the tabs on one machine are the only participants and one of
   * them has to speak.
   */
  readonly authority: 'server' | 'local';
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
    authority: 'local',
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

/**
 * The production channel: a server-sent event stream at a URL the deployment supplies.
 *
 * Constructed only when `VITE_REALTIME_URL` is set. It replaced a speculative WebSocket client
 * at TC-P05, and the reason is the shape of an event in this product: a notification, never a
 * payload. Nothing here has anything to say back, so a bidirectional socket would have bought a
 * channel nobody uses at the cost of a dependency on the server side, a handshake and a framing
 * layer. `EventSource` is a platform API that already does reconnect, already replays with
 * `Last-Event-ID`, and already sends the session cookie.
 *
 * Three behaviours worth naming:
 *
 * - **Reconnect is the browser's.** It retries on its own with the interval the server states
 *   in a `retry:` field, so there is no backoff schedule here to drift from the server's.
 * - **A gap is answered by re-reading.** When the server cannot say what was missed it sends
 *   `sync.required`, which every subscriber receives regardless of the kinds it asked for.
 * - **Nothing is published.** The server announces after it commits; a client that published
 *   would be a client inventing events. `authority` says so and `withRealtime` reads it.
 */
export function createEventStreamChannel(url: string): RealtimeChannel {
  const state = makeState();
  state.status = 'reconnecting';

  let stream: EventSource | null = null;
  let closed = false;

  const deliver = (event: DomainEvent) => {
    for (const handler of state.eventHandlers) handler(event);
  };

  if (typeof EventSource === 'undefined') {
    // No stream here — a test runner, or a build without one. The application still works;
    // it simply learns about other devices when it next reads.
    state.status = 'offline';
  } else {
    // `withCredentials` so the session cookie travels. The deployment is same-origin, which
    // is what makes that both possible and safe.
    stream = new EventSource(url, { withCredentials: true });

    stream.addEventListener('open', () => setStatus(state, 'live'));

    stream.addEventListener('message', (message: MessageEvent<string>) => {
      try {
        deliver(JSON.parse(message.data) as DomainEvent);
      } catch {
        // A malformed frame is not worth tearing a fight down for; the next read of the
        // repository is authoritative anyway.
      }
    });

    // Named events the server sends beside the ordinary stream.
    stream.addEventListener('resync', (message) => {
      const reason = (message as MessageEvent<string>).data || 'the stream fell behind';
      deliver({
        kind: 'sync.required',
        reason,
        at: new Date().toISOString(),
        origin: 'server',
      });
    });

    stream.addEventListener('error', () => {
      if (closed) return;
      // `EventSource` reconnects on its own; the status is what the shell shows while it does.
      setStatus(
        state,
        typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'reconnecting',
      );
    });
  }

  return {
    authority: 'server',
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
    publish() {
      // Deliberately nothing. The server announces what it committed; a client cannot know
      // that a write landed until it is told, and inventing the announcement is how two
      // devices start disagreeing about what happened.
    },
    close() {
      closed = true;
      stream?.close();
      state.statusHandlers.clear();
      state.eventHandlers.clear();
    },
  };
}

/** A channel that does nothing, for tests and for a surface with no fight in it. */
export function createNullChannel(): RealtimeChannel {
  return {
    authority: 'local',
    status: 'live',
    onStatus: () => () => {},
    subscribe: () => () => {},
    publish: () => {},
    close: () => {},
  };
}
