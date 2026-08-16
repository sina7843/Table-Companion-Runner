# TC-F19 — Spellbook, Preparation And Casting State

```text
Execute TC-F19. Complete the day-to-day spell management experience for characters that use spells.

Prerequisites: TC-F11, TC-F16 and TC-F18 should be complete where their data is relevant.

Read the Ruleset spell APIs/content pipeline, Character Sheet spell rendering, ResourcePool spell slots, level-up spell choices, privacy rules and authorization.

Tasks:
- model known/learned/prepared spell state through the Ruleset rather than generic screen assumptions;
- let eligible characters prepare/unprepare spells, add/remove spells only where the class/ruleset allows it, and clearly distinguish known, prepared and unavailable spells;
- keep cantrips and non-slot abilities represented correctly for the supported rules version;
- connect spell casting to resource consumption: casting a slotted spell must consume the correct slot/resource through an authoritative intent, not by client-editing pool counts;
- prevent casting when the required resource is unavailable unless the DM uses an explicit override path;
- show spell details needed at the table from approved ingested content without duplicating content literals in UI code;
- make level-up-added spells feed the same persisted spell state;
- respect Character section privacy in party views;
- add tests for prepare/unprepare, learned spell constraints, slot consumption, no-slot refusal, DM override if supported, stale/replay, rest recovery integration, level-up integration and persistence;
- update content coverage docs to state which classes/spell levels are actually supported.

Guardrails:
- spell preparation rules live in the Ruleset, not React screens;
- do not let the client supply a final slot count;
- do not imply complete spell coverage if the content catalogue is partial.

Acceptance: spellcasters can manage the spell state their Ruleset permits and spend/recover spell resources correctly; Level Up, Rest and Character Sheet use one consistent persisted model; authorization/privacy/concurrency hold; tests/build pass.
```
