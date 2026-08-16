# TC-P04 — Server Authoritative Combat And Concurrency

```text
Execute TC-P04. Make Combat server-authoritative and conflict-safe for real multiplayer use.

Read the current combat domain/actions/turns/log implementation, persistence model, API contracts, and realtime seams. Preserve existing UI behavior unless server authority requires an adapter change.

Tasks:
- replace unsafe whole-record combat mutations with explicit commands/events for actions such as damage, heal, temp HP, condition changes, initiative/turn advance, death save changes, roll-related state, DM override, and undo where supported;
- enforce authentication, authorization, rules validation, and current-combat status on every command;
- add optimistic concurrency with a combat version/revision or equivalent expected-version mechanism;
- execute each accepted combat command in a database transaction that updates authoritative state and appends an auditable CombatEvent;
- define deterministic conflict behavior for stale clients and require refresh/resync rather than last-write-wins corruption;
- make undo safe: only reversible events should be undone, with authorization and audit history preserved;
- ensure DM override is explicit and logged;
- add concurrency/integration tests for simultaneous damage, turn advance races, duplicate retries, stale versions, undo, and reconnect-resubmit behavior;
- keep the domain/ruleset architecture game-system agnostic.

Do not trust the client to calculate final authoritative HP/turn state. Do not delete audit history when undoing an action.

Acceptance: two or more clients can issue overlapping combat actions without silent state loss, stale writes are rejected or reconciled deterministically, every accepted mutation is auditable, and a refresh returns the same authoritative combat state.
```
