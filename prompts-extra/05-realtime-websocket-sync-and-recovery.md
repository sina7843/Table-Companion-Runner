# TC-P05 — Realtime WebSocket Sync And Recovery

```text
Execute TC-P05. Implement production realtime synchronization on top of the authoritative backend state.

Inspect the existing realtime abstraction, `withRealtime`, connection handling, repository refresh patterns, authentication, and TC-P04 combat command/event model.

Tasks:
- implement an authenticated WebSocket or equivalent realtime server using campaign/combat scoped rooms;
- authorize subscriptions server-side before joining a room;
- broadcast compact state-change/event notifications after committed mutations, never before transaction success;
- ensure secret/private events and payloads are filtered server-side per recipient authorization;
- define reconnect, heartbeat, backoff, stale-connection cleanup, and resubscription behavior;
- implement authoritative resync after reconnect or detected version gaps instead of trusting missed-event reconstruction blindly;
- preserve local BroadcastChannel/demo behavior only as an explicit development adapter;
- add tests for DM + Player synchronization, reconnect, missed events, duplicate delivery, out-of-order delivery tolerance, unauthorized room access, and secret roll isolation;
- update UI connection states so offline/reconnecting/resynced states are understandable without blocking safe local interaction unnecessarily.

Do not make WebSocket messages the only source of truth; durable authoritative state remains in the backend/database.

Acceptance: two independent clients observe committed combat/campaign changes promptly, reconnect safely after interruption, cannot subscribe to unauthorized data, and recover to the exact authoritative server state after missed events.
```
