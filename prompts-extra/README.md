# Extra Production Prompts

This folder is an independent production-hardening sequence for Table Companion. It starts after the existing Phase 1 implementation prompts and does not modify the original `/prompts` runner sequence.

## Recommended order

1. `00-production-baseline-and-gap-audit.md`
2. `01-backend-postgres-foundation.md`
3. `02-authentication-and-server-authorization.md`
4. `03-api-contract-runtime-validation-and-hardening.md`
5. `04-server-authoritative-combat-and-concurrency.md`
6. `05-realtime-websocket-sync-and-recovery.md`
7. `06-rules-content-pipeline-and-legal-boundary.md`
8. `07-product-account-offline-and-operational-states.md`
9. `08-e2e-multiplayer-security-and-resilience.md`
10. `09-ci-cd-observability-and-production-infrastructure.md`
11. `10-final-production-readiness-and-golden-path.md`

## Rules for this sequence

- Preserve the current frontend, design system, domain model, and ruleset abstractions unless a concrete defect requires change.
- Keep the architecture game-system agnostic; D&D is the first ruleset, not the architecture.
- Prefer incremental migration from fixtures/seams to real infrastructure. Do not rewrite working UI from scratch.
- Treat the server as the security and multiplayer authority.
- Do not commit real secrets. Update `.env.example` only.
- Run the repository's available lint/typecheck/test/build checks after each stage.
- Keep `IMPLEMENTATION_STATUS.md`, `IMPLEMENTATION_DECISIONS.md`, and requirement traceability current when a stage materially changes architecture or completion status.
- Do not claim production readiness until the final Golden Path passes with real persistence and at least two independent clients.

See `QUICK_START.md` and `prompt-manifest.json` for the standalone sequence metadata.
