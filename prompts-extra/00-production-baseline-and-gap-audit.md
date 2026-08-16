# TC-P00 — Production Baseline And Gap Audit

```text
Execute TC-P00. Establish a production baseline for Table Companion before adding new infrastructure.

Read README.md, Requirements.md, IMPLEMENTATION_DECISIONS.md, IMPLEMENTATION_STATUS.md, PROJECT_STATUS.md, REQUIREMENTS_TRACEABILITY.md, CLAUDE.md, package.json, `.env.example`, and the current data/session/realtime/ruleset abstractions.

Tasks:
- map which Phase 1 capabilities are UI/domain complete versus actually backed by production persistence/auth/realtime;
- identify fixture-only paths, client-only permission checks, unsafe whole-record writes, missing runtime validation, missing database boundaries, and missing deployment/observability pieces;
- preserve the current frontend and system-agnostic ruleset architecture unless a concrete defect is demonstrated;
- define the target backend boundary, database ownership, authentication boundary, realtime authority, and production Golden Path;
- create or update a concise production checklist in IMPLEMENTATION_STATUS.md with explicit Not Started / In Progress / Done states;
- record architecture decisions in IMPLEMENTATION_DECISIONS.md before implementation when choices are required;
- run the existing lint/typecheck/test/build suite and record the baseline result.

Do not implement a broad rewrite in this step. Do not mark a feature production-ready merely because the UI or fixture flow works.

Acceptance: the repository has a clear, evidence-based production gap map, a target architecture compatible with the existing seams, a passing or accurately documented baseline test/build state, and an ordered plan for TC-P01 onward.
```
