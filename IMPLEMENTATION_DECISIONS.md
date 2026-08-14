# Table Companion — Approved implementation decisions

These are authoritative unless the user explicitly changes them.

1. The architecture is game-system agnostic. D&D 5e/5.5e is the first ruleset, not the core architecture.
2. DM is desktop/tablet-first; Player is mobile-first.
3. Phase 1 hero experience is Live Combat / Session Control.
4. Character Builder and Level Up are guided, rules-aware step-by-step flows.
5. Automatically calculate every deterministic value that the rules engine can calculate.
6. D&D content/data is expected to come from 5e.tools, but ingestion must remain isolated from user campaign data and should not be hardwired into UI components.
7. Phase 1 supports homebrew/custom Monsters, but not custom classes/subclasses/species/backgrounds/spells/items/feats.
8. Damage and healing apply directly; DM can edit/override/undo.
9. DM chooses public vs secret rolls.
10. Player can hide supported Character Sheet sections from other Players; DM retains full Character access.
11. Player Personal Notes are Phase 2 and must be inaccessible to the DM.
12. One DM per campaign in Phase 1; Co-DM is later.
13. Encounter templates are reusable and start separate Combat Instances.
14. Phase 1 is online-first with autosave, reconnect, and state recovery; do not build full offline-first conflict resolution.
15. The approved Claude Design and approved Design System are visual/interaction sources of truth.
16. Stack may be modernized. Default greenfield choice: React + TypeScript using Next.js and Tailwind when appropriate. If an existing repository already has a coherent stack, inspect before replacing it.
17. Do not make a large framework rewrite just for preference. Any stack change must improve fidelity, maintainability, or implementation speed and be documented in DECISIONS.md.
18. Use responsive, reusable components rather than static HTML recreation.
