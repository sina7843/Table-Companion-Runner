# Quick Start — Extra Production And Feature Completion Sequence

The original Phase 1 implementation prompts live in `/prompts`. This folder is independent and continues from that foundation.

## Track A — Production foundation

Already intended to run after the original Phase 1 sequence:

```text
TC-P00
TC-P01
TC-P02
TC-P03
TC-P04
TC-P05
TC-P06
TC-P07
TC-P08
TC-P09
TC-P10
```

## Track B — Feature completion before HTTPS

Run these after the production foundation is green and before treating the product as feature-frozen for HTTPS staging:

```text
TC-F11  Character write model and versioned persistence
TC-F12  Persistent guided Level Up
TC-F13  Real Character Edit and DM override
TC-F14  Persisted character privacy
TC-F15  Character avatar / portrait media
TC-F16  Out-of-combat HP and resource tracking
TC-F17  Ruleset-driven Short Rest / Long Rest
TC-F18  Inventory and equipment management
TC-F19  Spellbook, preparation and casting state
TC-F20  Character lifecycle: duplicate / detach / archive / delete
TC-F21  Campaign management and membership controls
TC-F22  Dead CTA and incomplete-flow audit
TC-F23  D&D content coverage and rules-version completion
TC-F24  Pre-HTTPS feature completion audit and freeze
```

Do not skip TC-F11: the current feature-completion track deliberately builds Character persistence/versioning first so Level Up, Edit, Privacy, HP/resources and lifecycle do not each invent their own write semantics.

Do not start the HTTPS staging pass until TC-F24 returns `FEATURE-FROZEN FOR HTTPS` or the explicitly reviewed `FEATURE-FROZEN WITH EXPLICIT DEFERRALS`.

Each prompt must inspect the repository before editing, preserve sound architecture, run the relevant validation suite, and update implementation/traceability documentation with evidence.
