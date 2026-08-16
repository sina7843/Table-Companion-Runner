# TC-P01 — Backend And PostgreSQL Foundation

```text
Execute TC-P01. Add the minimal production-oriented backend and PostgreSQL persistence foundation without rewriting the existing frontend.

Inspect the repository and TC-P00 findings first. Reuse existing repository interfaces and API contracts wherever possible.

Tasks:
- introduce a backend service appropriate to the current stack and repository constraints;
- add PostgreSQL with migrations and a development-safe local setup;
- model persistence for User, Campaign, CampaignMember, Invite, Character, CharacterDraft, Monster/HomebrewMonster, Encounter, Combat, CombatParticipant, CombatEvent, and Roll as required by the existing domain/API contracts;
- keep ruleset-specific extensibility through JSON/JSONB or equivalent typed system data rather than baking D&D-only columns into generic entities;
- implement repository/service boundaries so frontend HTTP repositories can replace fixture repositories incrementally;
- preserve demo/local fixtures as an explicit development mode, not as production storage;
- add database integration tests for migrations, CRUD, ownership relations, transaction boundaries, and restart persistence;
- update `.env.example`, setup docs, IMPLEMENTATION_STATUS.md, and IMPLEMENTATION_DECISIONS.md as needed.

Do not store secrets in the repository. Do not reset or destroy existing developer data automatically. Do not change public frontend contracts unless required and documented.

Acceptance: a fresh environment can start the backend and PostgreSQL, apply migrations, persist representative campaign/character/encounter/combat data across restart, and the existing frontend can be wired to the real repository layer without a UI rewrite.
```
