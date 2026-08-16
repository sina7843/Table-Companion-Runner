# TC-F17 — Ruleset-Driven Short And Long Rest

```text
Execute TC-F17. Add safe Short Rest and Long Rest flows driven entirely by the active Ruleset.

Prerequisites: TC-F11 and TC-F16 must be complete.

Read ResourcePool/HealthTrack, Ruleset capabilities, D&D character data, Character Sheet, live combat authority and existing rules tests.

Tasks:
- add generic Ruleset APIs that describe available rest types, required choices and the resulting character-state transition;
- implement D&D 5e rest behavior only inside the D&D adapter: hit-dice use/recovery, HP recovery, spell-slot recovery and class-resource recovery according to the supported rules version/content;
- surface Rest from Character Sheet with a confirmation/review flow showing exactly what will recover and any choices required;
- persist the rest as one atomic versioned mutation; retries must not spend hit dice or restore resources twice;
- make all state-changing random dice (for example hit-die healing if rolled) server-owned or server-verified through the Ruleset action-resolution path;
- define active-combat behavior explicitly: prevent/rest restrict as rules/product require rather than mutating the persistent Character behind a live CombatInstance;
- log enough structured activity for the owner/DM to understand that a rest occurred without leaking private sheet content;
- add tests for short/long rest, no-op/full-resource cases, insufficient hit dice, server-owned healing roll where relevant, stale/replay, authorization, active combat refusal and persistence;
- update requirements traceability and user-facing copy.

Guardrails:
- core code must never name D&D-specific rest resources;
- do not hard-code "restore everything" in the screen;
- do not mutate a live combat snapshot behind the combat service.

Acceptance: the active Ruleset determines rest options and consequences; D&D short/long rests correctly recover the supported resources; writes are atomic/idempotent/versioned; live combat cannot diverge; tests/build pass.
```
