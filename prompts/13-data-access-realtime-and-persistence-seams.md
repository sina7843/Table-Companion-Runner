# TC-13 — Data Access Realtime And Persistence Seams

```text
Execute TC-13. Replace fixture-only coupling with clean data/realtime seams without inventing unapproved infrastructure.

Inspect the current repository first. If a backend/API already exists, integrate with it. If greenfield, implement a minimal production-oriented service layer/API boundary appropriate to the chosen stack, while keeping local/demo fixtures available for UI development.

Cover contracts for Campaign/Character/Monster/Encounter/Combat state, autosave, optimistic updates where safe, reconnect/state refresh, and realtime event handling.

Do not read real secrets and do not choose a third-party provider that requires credentials unless the user has already configured it. Use `.env.example` only.

Acceptance: UI features no longer depend directly on hardcoded fixture imports; realtime and persistence interfaces are explicit; app still runs locally without secret leakage.
```
