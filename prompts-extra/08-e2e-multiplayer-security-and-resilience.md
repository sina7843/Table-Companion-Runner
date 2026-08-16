# TC-P08 — E2E Multiplayer Security And Resilience

```text
Execute TC-P08. Add production-grade end-to-end, multiplayer, security, and resilience coverage for the Phase 1 Golden Path.

Inspect the current unit/integration tests and all production infrastructure from TC-P01 through TC-P07.

Tasks:
- add browser E2E coverage with at least two independent browser contexts representing DM and Player;
- cover account/session setup, campaign creation/join, character creation, encounter creation, combat start, initiative/turns, rolls, damage/heal, conditions, death-save behavior where applicable, DM override, combat log, undo, and combat completion;
- verify secret/private rolls and character privacy never leak to unauthorized clients in DOM, API responses, realtime messages, or logs;
- test refresh and backend restart persistence during representative flows;
- test WebSocket interruption/reconnect/resync and version-conflict recovery;
- add adversarial API tests for ID tampering, privilege escalation, malformed payloads, replay/duplicate mutations, stale combat commands, and unauthorized room subscription;
- test concurrent writes to critical persistence paths, especially combat state and draft/content upgrade paths;
- run accessibility smoke coverage on the main DM desktop/tablet and Player mobile paths;
- document any flaky/non-deterministic tests and fix root causes rather than hiding them with large retries.

Do not rely on a single shared browser session for multiplayer validation. Do not consider client-side hiding a security test pass.

Acceptance: the production Golden Path passes with independent DM and Player clients against the real backend/database/realtime stack, security boundaries have negative tests, reconnect/restart do not corrupt state, and the suite can run reliably in CI.
```
