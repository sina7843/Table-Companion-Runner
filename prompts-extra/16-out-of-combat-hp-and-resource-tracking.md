# TC-F16 — Out-Of-Combat HP And Resource Tracking

```text
Execute TC-F16. Make Character Sheet HP and resource controls real outside live combat.

Prerequisites: TC-F11 must be complete. Reuse its character versioning/authorization and TC-P04's rules-first mutation principles.

Read CharacterSheet, HealthTrack/ResourcePool, HPControl, Ruleset resource definitions, combat commands and authorization.

Tasks:
- replace no-op HP controls on Character Sheet with real damage, heal and temporary-HP mutations;
- use intent-based character mutations/commands rather than accepting a client-computed final HP total;
- apply Ruleset semantics for temp HP, zero floor, max HP bounds and any system-specific health rules;
- add generic resource-spend and resource-restore mutations for ResourcePool entries, validated by the active Ruleset;
- wire spell slots and class resources displayed on the sheet to usable controls with clear remaining/used state;
- owner and campaign DM may change the appropriate character state; unrelated users may not;
- handle stale version/retry behavior without double-applying damage or spend;
- after a successful mutation, use authoritative returned Character state and existing realtime invalidation;
- decide and document how out-of-combat HP relates to an active CombatInstance: do not create two silently divergent authorities. If a character is in live combat, route combat-state mutations through combat commands or clearly lock the sheet control to the live combat authority;
- add tests for damage/heal/temp HP/resource spend/restore, stale/replay, authorization, active-combat behavior, refresh/restart persistence and realtime refresh.

Guardrails:
- never let a client send finalHp/finalUsed as authority when the intent can be expressed as an amount/action;
- do not let Character Sheet writes overwrite live combat participant state;
- keep resource keys generic in core; D&D interpretation stays in Ruleset.

Acceptance: HP and tracked resources on Character Sheet are genuinely interactive and persistent, stay consistent with live combat authority, survive refresh/restart, enforce permissions/concurrency, and pass all validation.
```
