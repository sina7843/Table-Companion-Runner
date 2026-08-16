/**
 * Realtime: telling the other devices at the table that something committed.
 *
 * **Server-sent events, not a WebSocket.** The choice follows from what an event in this
 * product is. Since TC-13 an event has been a notification and never a payload — it says what
 * changed and the receiver re-reads through the repository — so the traffic is one-way, and a
 * WebSocket would buy a client→server channel nothing needs at the cost of a dependency (Node
 * has no WebSocket server), a handshake and a framing layer to get wrong. SSE runs on the HTTP
 * server that already exists, carries the session cookie exactly like every other request, and
 * gives reconnect and `Last-Event-ID` replay from the browser for free.
 *
 * Four rules this file exists to keep:
 *
 * 1. **Nothing is announced before it is committed.** `withServerEvents` publishes after the
 *    store's promise resolves, and the store's promise resolves after `COMMIT`. A subscriber
 *    that re-reads on an event can never read state the transaction later rolled back.
 * 2. **A subscription is granted, never requested.** A stream carries the campaigns the
 *    account is a member of, resolved from stored rows. Asking for one you are not in is a
 *    403 rather than a room you quietly do not receive.
 * 3. **A secret roll is not announced to a player.** The audience is decided here, per event,
 *    from the same visibility the payload filter uses — so a player is not even told that a
 *    hidden roll happened.
 * 4. **The stream is never the source of truth.** A missed window is answered with
 *    `sync.required`, which tells a client to re-read rather than to reconstruct. The
 *    database is authoritative and this is a hint that it has moved.
 */
import { canSee } from '../src/domain/permissions.ts';
import type { DomainEvent } from '../src/domain/data/realtime.ts';
import type { Repositories } from '../src/domain/data/repositories.ts';
import type { CampaignId, UserId } from '../src/domain/types.ts';

/** One event as it goes out: the domain event plus the position it holds in the stream. */
export interface StreamEvent {
  seq: number;
  campaignId: string;
  /** Who may receive it. `dm` is how a secret roll stays out of a player's stream. */
  audience: 'members' | 'dm';
  event: DomainEvent;
}

export interface Subscriber {
  userId: UserId;
  /** The campaigns this stream carries. Resolved from membership, never from the request. */
  campaigns: ReadonlySet<string>;
  /** Campaigns this account runs, for the events only a DM receives. */
  dmOf: ReadonlySet<string>;
  send(entry: StreamEvent): void;
  /** Told to throw away what it has and re-read. */
  resync(reason: string): void;
}

/**
 * How much history one campaign keeps for a reconnecting client.
 *
 * Generous for a fight — a busy round is a few dozen events — and bounded, because this is a
 * convenience for a client that blinked rather than a log. Anything older is answered with
 * `sync.required`, which is always correct and never a guess.
 */
const REPLAY_WINDOW = 200;

export interface Hub {
  /** Announces a committed change. Returns the sequence it was given. */
  publish(entry: Omit<StreamEvent, 'seq'>): number;
  /** Adds a stream and returns its own unsubscribe. */
  add(subscriber: Subscriber): () => void;
  /**
   * The events a reconnecting client missed, or `null` when the gap is wider than the window
   * and the only honest answer is "re-read everything".
   */
  replay(
    since: number,
    campaigns: ReadonlySet<string>,
    dmOf: ReadonlySet<string>,
  ): StreamEvent[] | null;
  /** Current sequence, for a client joining fresh. */
  position(): number;
  size(): number;
}

/** Whether one stream is entitled to one event. Membership, then audience. */
const mayReceive = (
  entry: StreamEvent,
  campaigns: ReadonlySet<string>,
  dmOf: ReadonlySet<string>,
): boolean =>
  campaigns.has(entry.campaignId) && (entry.audience === 'members' || dmOf.has(entry.campaignId));

export function createHub(): Hub {
  let sequence = 0;
  const subscribers = new Set<Subscriber>();
  /** Per campaign, oldest first, capped. */
  const history = new Map<string, StreamEvent[]>();

  return {
    publish(input) {
      sequence += 1;
      const entry: StreamEvent = { ...input, seq: sequence };

      const kept = history.get(entry.campaignId) ?? [];
      kept.push(entry);
      if (kept.length > REPLAY_WINDOW) kept.splice(0, kept.length - REPLAY_WINDOW);
      history.set(entry.campaignId, kept);

      for (const subscriber of subscribers) {
        if (!mayReceive(entry, subscriber.campaigns, subscriber.dmOf)) continue;
        // A stream that has gone away must not take a command down with it: the write has
        // already committed, and delivery is best effort by design.
        try {
          subscriber.send(entry);
        } catch {
          subscribers.delete(subscriber);
        }
      }
      return sequence;
    },

    add(subscriber) {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },

    replay(since, campaigns, dmOf) {
      if (since >= sequence) return [];

      const missed: StreamEvent[] = [];
      for (const campaignId of campaigns) {
        const kept = history.get(campaignId) ?? [];
        // The window has rolled past what this client last saw. Reconstructing from a partial
        // history is exactly the thing not to do, so it is told to re-read instead.
        if (kept.length === REPLAY_WINDOW && (kept[0]?.seq ?? 0) > since) return null;
        for (const entry of kept) {
          if (entry.seq > since && mayReceive(entry, campaigns, dmOf)) missed.push(entry);
        }
      }
      return missed.toSorted((a, b) => a.seq - b.seq);
    },

    position: () => sequence,
    size: () => subscribers.size,
  };
}

/* ── Deciding who hears what ────────────────────────────────────────────────── */

const now = () => new Date().toISOString();

/**
 * Whether a roll is one a player's stream may mention at all.
 *
 * TC-13 argued that announcing a secret roll was harmless because the event carries no total.
 * It is not: "the DM just rolled something" is information, and at a table it is the
 * information. The same predicate that keeps the roll out of a player's log keeps the
 * announcement out of their stream.
 */
export const audienceForVisibility = (
  visibility: Parameters<typeof canSee>[1],
): 'members' | 'dm' =>
  canSee({ userId: '' as UserId, role: 'player' }, visibility, false) ? 'members' : 'dm';

/**
 * Publishes after a write commits.
 *
 * Wraps the *authorized* repositories, so by the time a call returns here the caller was
 * allowed to make it and the transaction has closed. Every publish is after an `await` on the
 * store for that reason: an announcement before `COMMIT` is an invitation to read state that
 * is about to disappear.
 *
 * Not everything announces. A monster is personal to whoever owns it and a draft is a
 * half-built character nobody else can see, so neither has an audience to tell.
 */
export function withServerEvents(repos: Repositories, publish: Hub['publish']): Repositories {
  const announce = (
    campaignId: string,
    event: DomainEvent,
    audience: 'members' | 'dm' = 'members',
  ) => {
    publish({ campaignId, audience, event });
  };

  /** The server stamps origin, so a client cannot claim an event came from somewhere else. */
  const from = 'server';

  return {
    ...repos,

    campaigns: {
      ...repos.campaigns,
      acceptInvite: async (code) => {
        const campaign = await repos.campaigns.acceptInvite(code);
        announce(campaign.id, {
          kind: 'campaign.changed',
          campaignId: campaign.id,
          at: now(),
          origin: from,
        });
        return campaign;
      },
    },

    characters: {
      ...repos.characters,
      attachToCampaign: async (characterId, campaignId) => {
        const character = await repos.characters.attachToCampaign(characterId, campaignId);
        announce(campaignId, {
          kind: 'character.changed',
          characterId: character.id,
          at: now(),
          origin: from,
        });
        return character;
      },
    },

    encounters: {
      ...repos.encounters,
      save: async (encounter) => {
        const saved = await repos.encounters.save(encounter);
        // DM-only: an encounter carries setup notes and a player never reads one, so telling
        // them it changed would be telling them it exists.
        announce(
          saved.campaignId,
          { kind: 'encounter.changed', encounterId: saved.id, at: now(), origin: from },
          'dm',
        );
        return saved;
      },
      duplicate: async (encounterId) => {
        const copy = await repos.encounters.duplicate(encounterId);
        announce(
          copy.campaignId,
          { kind: 'encounter.changed', encounterId: copy.id, at: now(), origin: from },
          'dm',
        );
        return copy;
      },
    },

    combats: {
      ...repos.combats,
      startFromTemplate: async (encounterId) => {
        const combat = await repos.combats.startFromTemplate(encounterId);
        announce(combat.campaignId, {
          kind: 'combat.changed',
          combatId: combat.id,
          at: now(),
          origin: from,
        });
        announce(
          combat.campaignId,
          { kind: 'encounter.changed', encounterId, at: now(), origin: from },
          'dm',
        );
        return combat;
      },
      command: async (input) => {
        const outcome = await repos.combats.command(input);
        // A replayed command changed nothing. Announcing it would make every other device
        // re-read for a change that did not happen.
        if (!outcome.replayed) {
          announce(outcome.combat.campaignId, {
            kind: outcome.combat.status === 'ended' ? 'combat.ended' : 'combat.changed',
            combatId: outcome.combat.id,
            at: now(),
            origin: from,
          });
        }
        return outcome;
      },
    },

    rolls: {
      ...repos.rolls,
      record: async (roll) => {
        const recorded = await repos.rolls.record(roll);
        if (recorded.combatId) {
          const combat = await repos.combats.byId(recorded.combatId);
          if (combat) {
            announce(
              combat.campaignId,
              {
                kind: 'roll.recorded',
                combatId: recorded.combatId,
                rollId: recorded.id,
                at: now(),
                origin: from,
              },
              audienceForVisibility(recorded.visibility),
            );
          }
        }
        return recorded;
      },
    },
  };
}

/* ── Who a stream belongs to ────────────────────────────────────────────────── */

export interface StreamScope {
  campaigns: Set<string>;
  dmOf: Set<string>;
}

/**
 * The rooms an account may have, read from stored membership.
 *
 * A client can narrow to one campaign; it cannot widen. `wanted` naming a campaign the account
 * is not in resolves to null, and the caller answers 403 — a refusal rather than a room that
 * silently delivers nothing, because the second is indistinguishable from a bug.
 */
export async function scopeFor(
  repos: Repositories,
  userId: UserId,
  wanted?: string | null,
): Promise<StreamScope | null> {
  const campaigns = await repos.campaigns.listForUser(userId);

  const scope: StreamScope = { campaigns: new Set(), dmOf: new Set() };
  for (const campaign of campaigns) {
    if (wanted && campaign.id !== wanted) continue;
    scope.campaigns.add(campaign.id);
    if (campaign.dmUserId === userId) scope.dmOf.add(campaign.id);
  }

  if (wanted && scope.campaigns.size === 0) return null;
  return scope;
}

/** For the caller that has a campaign id and needs it typed. */
export const asCampaignId = (value: string): CampaignId => value as CampaignId;
