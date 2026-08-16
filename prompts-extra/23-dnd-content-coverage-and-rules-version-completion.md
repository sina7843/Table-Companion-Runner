# TC-F23 — D&D Content Coverage And Rules-Version Completion

```text
Execute TC-F23. Make the supported D&D rules/content promise explicit and complete enough for the intended Phase 1 release.

Read Requirements.md, the current D&D 5e/2024 Ruleset adapter, content importer/catalogue, builder, level-up, sheet, monsters, spells, equipment and licensing/redistribution docs.

Problem to solve:
- the current builder/content code explicitly describes itself as a realistic working subset;
- the product must not present "D&D 5e (2024)" as broadly supported while common legal/approved options silently do not exist.

Tasks:
- choose and document the exact initial support target: D&D 2024 rules, 2014 rules, or explicitly separated versions; do not mix semantics under one opaque label;
- produce a machine-readable/content-testable coverage matrix for Species, Backgrounds, Classes, Subclasses, Feats/ASI choices, Spells by class/level, Equipment, Conditions, Monsters and progression levels;
- define a release minimum for each category based on legally redistributable/approved sources already allowed by the project;
- expand the ingest/content pipeline to meet that release minimum without copying unlicensed/non-redistributable material into the repository;
- make Builder and Level Up derive available choices from the content catalogue and Ruleset, not hand-maintained TypeScript subsets;
- remove or migrate remaining hard-coded gameplay content where it creates divergence from the catalogue;
- add validation that imported records required by the release matrix exist and have valid references/keys;
- add regression tests across representative martial, prepared caster, known-spell caster and resource-using characters at multiple levels;
- make UI clearly identify unsupported content/rules versions instead of silently substituting a "Default" subclass or fabricated option;
- update README/product copy/traceability with exactly what is supported at release.

Guardrails:
- licensing/redistribution boundaries from TC-P06 remain mandatory;
- do not claim full official-book coverage unless the repository actually has rights and tests for it;
- do not solve missing content by embedding book text into source files;
- keep core architecture game-system agnostic and version selection explicit.

Acceptance: Table Companion has an honest, tested D&D support matrix; common builder/level-up/sheet paths do not depend on hidden working-subset assumptions; unsupported options are explicit; all added content comes through the approved pipeline; tests/build pass.
```
