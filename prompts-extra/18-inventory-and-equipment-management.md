# TC-F18 — Inventory And Equipment Management

```text
Execute TC-F18. Replace the current starter-pack-only inventory presentation with real character inventory and equipment management.

Prerequisites: TC-F11 and TC-F13 must be complete.

Read Character systemData/inventory rendering, D&D content pipeline, equipment definitions, Ruleset derivation, Character Edit and authorization.

Tasks:
- introduce a generic inventory item shape that can represent ruleset/library items and user-authored custom items without putting D&D fields in core;
- persist quantity, carried/equipped state and any generic notes/reference needed by the sheet;
- add add/remove/update quantity/equip/unequip flows from Character Sheet/Edit;
- allow selection from approved ingested content plus a clearly marked custom item path;
- make Ruleset recalculate derived values affected by equipment, including AC and attack/action availability where supported;
- prevent invalid equip states by default and surface rules warnings when a table override is permitted;
- preserve existing starting equipment by migrating/normalizing current characters rather than silently dropping it;
- keep item writes versioned and server-authorized for owner/campaign DM;
- ensure private inventory visibility still follows Character section privacy;
- add tests for quantity, equip/unequip, derived recalculation, custom item, migration of existing starter packs, stale conflict, authorization and refresh persistence;
- update content/traceability docs with exactly which equipment categories are supported.

Guardrails:
- no D&D armour/weapon rules in generic inventory components;
- do not trust a client-supplied resulting AC or attack bonus;
- do not erase unknown/custom inventory data during a ruleset recalculation.

Acceptance: inventory is a real persisted editable entity on the character; equipment choices affect rules-derived sheet values through the Ruleset; owner/DM permissions and privacy hold; existing characters retain their items; tests/build pass.
```
