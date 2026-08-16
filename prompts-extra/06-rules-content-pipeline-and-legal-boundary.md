# TC-P06 — Rules Content Pipeline And Legal Boundary

```text
Execute TC-P06. Build the production content ingestion boundary for the first ruleset without compromising the system-agnostic architecture or redistribution constraints.

Read the existing Ruleset interface/registry, D&D builder/sheet/monster data helpers, Requirements.md, and all notes about content sources and licensing.

Tasks:
- define a source-agnostic content model for classes, species, backgrounds, feats, spells, equipment, monsters, and other Phase 1 rules data actually consumed by the app;
- make the D&D adapter load normalized content from a pipeline/storage layer rather than relying on hand-maintained working subsets in UI/domain files;
- keep generic entities and interfaces free from unnecessary D&D-only assumptions;
- add deterministic import/normalization scripts with source/version metadata, validation, duplicate handling, and reproducible output;
- establish a production-safe legal boundary: only ingest/redistribute content whose license/permission is explicitly approved for the product; keep unsupported sources behind non-production development tooling or documented blockers;
- preserve attribution/license metadata required by approved sources;
- add rules/content tests for representative character-builder dependencies, monster actions, spell/equipment references, invalid source records, and source-version upgrades;
- document how a future Pathfinder or other ruleset adapter would provide equivalent normalized capabilities without schema rewrites.

Do not scrape, copy, or publish unapproved copyrighted rulebook content as part of production. Do not hardcode source-specific parsing logic into generic UI components.

Acceptance: production rules data is reproducibly imported from an approved source into normalized storage, the current D&D flows use that content through ruleset seams, license/source metadata is traceable, and adding another ruleset does not require redesigning the core app model.
```
