# TC-F11 — Character Write Model And Versioned Persistence

```text
Execute TC-F11. Complete the missing character write foundation before adding more character features.

Read Requirements.md, the current Character domain model, CharacterRepository, HTTP repositories, API contract/validation, authorization, persistence adapters, realtime seams, Character Sheet/Edit/Privacy/LevelUp screens, migrations and tests.

Problem to solve:
- CharacterRepository currently exposes reads/attach but no general persistence contract for existing characters.
- Level Up, Privacy, Character Edit and out-of-combat HP/resources therefore cannot persist correctly.
- Character writes may come from both the owner and the campaign DM, so silent lost updates are unacceptable.

Tasks:
- design and implement a versioned character write contract that remains game-system agnostic;
- add Character.version (or an equivalent explicit concurrency token) through domain, database, API and fixtures;
- separate profile/metadata edits from rules-sensitive state mutations when that improves safety; do not create one giant unvalidated client-authoritative blob endpoint;
- enforce owner/DM authorization server-side for every write; a DM may edit only characters belonging to campaigns they run;
- reject stale expectedVersion writes deterministically rather than silently overwriting newer state;
- make retries idempotent where a write can be safely retried;
- preserve the existing rule that derived values are computed by the Ruleset, not trusted from arbitrary client payloads;
- make successful writes publish the existing realtime invalidation/refresh signal after commit, not before;
- update fixture repositories so tests and local fixture mode follow the same concurrency semantics;
- add database, API, authorization and client repository tests for owner write, DM write, unauthorized write, stale version, replay/retry and refresh persistence;
- update implementation decisions/status and requirement traceability.

Guardrails:
- do not weaken TC-P04 combat command authority;
- do not hard-code D&D concepts into the core character persistence contract;
- do not trust ownerUserId, campaignId, derived stats or version fields supplied by an unauthorized client;
- do not introduce a PUT endpoint that lets a stale browser replace the entire stored character without concurrency control.

Acceptance: an existing character can be safely mutated through a documented, server-authorized, version-aware persistence boundary; owner and DM permissions are enforced on the server; stale writes cannot silently win; fixtures match production semantics; lint, typecheck, tests and build pass.
```
