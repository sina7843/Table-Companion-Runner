# Extra Production Prompts

This folder is independent from the original `/prompts` Runner sequence.

It now contains two consecutive tracks:

1. **TC-P00–TC-P10 — production foundation/hardening**: backend, auth, server authorization, authoritative combat, realtime, content pipeline, E2E, CI/CD and production readiness.
2. **TC-F11–TC-F24 — product feature completion before HTTPS staging**: finish the user-facing Phase 1 capabilities that still look partial or non-persistent.

## Production foundation — completed sequence

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

## Feature completion before HTTPS staging

Run in this order:

12. `11-character-write-model-and-versioned-persistence.md`
13. `12-persistent-guided-level-up.md`
14. `13-real-character-editing-and-dm-override.md`
15. `14-persisted-character-privacy.md`
16. `15-character-avatar-and-portrait-media.md`
17. `16-out-of-combat-hp-and-resource-tracking.md`
18. `17-ruleset-driven-short-and-long-rest.md`
19. `18-inventory-and-equipment-management.md`
20. `19-spellbook-preparation-and-casting-state.md`
21. `20-character-lifecycle-duplicate-detach-archive-delete.md`
22. `21-campaign-management-and-membership-controls.md`
23. `22-dead-cta-and-incomplete-flow-audit.md`
24. `23-dnd-content-coverage-and-rules-version-completion.md`
25. `24-pre-https-feature-completion-audit-and-freeze.md`

## Rules for both tracks

- Preserve the current frontend, design system, domain model and Ruleset abstractions unless a concrete defect requires change.
- Keep the architecture game-system agnostic; D&D is the first Ruleset, not the platform architecture.
- Prefer incremental completion over rewrites.
- Treat the server as the security, persistence and multiplayer authority.
- Never trust client-computed final rules-sensitive state when the server can derive it from an intent.
- Do not commit real secrets. Update `.env.example` only.
- Run the repository's lint/typecheck/format/test/build checks after each stage and include database/E2E coverage when the slice changes those boundaries.
- Keep `IMPLEMENTATION_STATUS.md`, `IMPLEMENTATION_DECISIONS.md`, `PROJECT_STATUS.md` and `REQUIREMENTS_TRACEABILITY.md` current when completion status materially changes.
- Do not start the HTTPS/staging release pass until TC-F24 returns `FEATURE-FROZEN FOR HTTPS` or an explicitly approved `FEATURE-FROZEN WITH EXPLICIT DEFERRALS`.

See `QUICK_START.md` and `prompt-manifest.json` for sequence metadata.
