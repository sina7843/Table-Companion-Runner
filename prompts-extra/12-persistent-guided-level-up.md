# TC-F12 — Persistent Guided Level Up

```text
Execute TC-F12. Turn the existing guided Level Up flow into a real persisted rules-aware feature.

Prerequisite: TC-F11 character write/versioning must be complete and green.

Read the current LevelUp screen, Ruleset level-up APIs, D&D 5e sheet/progression rules, character persistence contract, authorization and tests.

Tasks:
- preserve the existing ruleset-generated step flow and review screen;
- make Confirm Level Up persist the character produced by Ruleset.applyLevelUp instead of discarding it;
- make level-up a dedicated server-authorized mutation/transaction so the server validates current level, target level, expectedVersion and allowed choices before commit;
- do not trust client-computed HP, proficiency, features, spell slots or derived values;
- if HP gain uses a die roll, make that state-changing randomness server-owned; the client may choose "roll" vs "average" but may not supply the final die result;
- persist level, max/current HP delta, ASI changes, subclass, learned choices/spells/manoeuvres, resource progression and pendingLevelUp state as applicable to the active Ruleset;
- add an explicit eligibility mechanism for level-up: support milestone/manual DM grant in Phase 1; do not invent a full XP system unless already required by the ruleset contract;
- allow the campaign DM to grant/revoke a pending level-up for a campaign character and the owner to complete it;
- make duplicate Confirm safe and stale tabs fail clearly;
- implement undo only if the product can define a safe bounded rule; otherwise document the existing "undo until next session" copy as unsupported and remove misleading UI text;
- add tests for owner flow, DM grant, stale version, duplicate submit, server-owned HP roll, ASI/subclass/spell persistence, unauthorized user, reload/restart persistence and realtime refresh;
- update E2E Golden Path with at least one real level-up through the UI.

Guardrails:
- no D&D progression logic in generic screens or persistence adapters;
- no client-supplied final level-up result accepted as authority;
- do not allow skipping arbitrary levels unless the Ruleset explicitly supports it.

Acceptance: a player can receive eligibility, complete the guided level-up, confirm once, reload the app and see the advanced character with all automatic and chosen consequences persisted correctly; server authorization/concurrency/randomness rules hold; tests and build pass.
```
