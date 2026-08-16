# TC-F13 — Real Character Editing And DM Override

```text
Execute TC-F13. Replace the current mostly read-only Character Edit screen with a real, persisted editor for owners and campaign DMs.

Prerequisite: TC-F11 must be complete. Use the versioned character write boundary; do not invent another persistence path.

Read Requirements.md sections 8.4–8.6, CharacterSheet, CharacterEdit, Ruleset derive/canOverride APIs, character authorization and persistence.

Tasks:
- build a real edit form for owner-editable identity/details such as name, appearance, backstory and other existing generic/profile fields;
- expose only ruleset-approved overrides for calculated values and clearly distinguish calculated, overridden and user-authored fields;
- add a DM edit mode with full campaign-character permission as required, while preserving rules validity warnings and an explicit override affordance;
- ensure changing class/species/background/rules-sensitive fields uses Ruleset validation and recalculation rather than raw text replacement;
- keep the game-system-agnostic core generic: system-specific edit sections must come from the Ruleset adapter/schema;
- implement save/cancel/dirty state, stale-version handling and clear failure recovery;
- reload the authoritative saved character after mutation;
- add server tests proving owner, campaign DM and unrelated users have the correct permissions;
- add UI/integration tests for edit persistence, derived recalculation, allowed override, stale conflict and cancel-without-save;
- remove any false "Saved" status that is not backed by a successful write.

Guardrails:
- never let a generic edit form directly set computed AC/proficiency/etc. unless Ruleset.canOverride explicitly permits it;
- never allow a DM from campaign A to edit a character merely because that user is a DM somewhere else;
- preserve section privacy semantics when editing.

Acceptance: owners can genuinely edit supported character fields; the campaign DM can genuinely edit the campaign's characters; rules-sensitive changes recalculate through the Ruleset; unauthorized writes are refused; UI status reflects real persistence; tests/build pass.
```
