# TC-03 — Domain Model Ruleset And State Foundation

```text
Execute TC-03. Build the front-end/domain foundation that keeps Table Companion game-system agnostic.

Implement typed domain models and state boundaries for User, GameSystem, Ruleset, Campaign, Character, Monster, EncounterTemplate, CombatInstance, CombatParticipant, Roll, Condition, and permissions.

Create a ruleset adapter/interface for derived calculations and ruleset-specific capabilities such as initiative, AC, death saves, spell slots, conditions, and level-up steps. D&D 5e/5.5e can be the first adapter, but generic components must not import D&D constants directly.

Add realistic fixture/mock data sufficient to render all planned Phase 1 screens. Keep data access behind repository/service interfaces so fixtures can later be replaced by APIs.

Acceptance: types compile, UI code can consume generic domain objects, and D&D-specific behavior is isolated behind a ruleset layer.
```
