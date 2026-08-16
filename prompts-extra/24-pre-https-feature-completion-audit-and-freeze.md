# TC-F24 — Pre-HTTPS Feature Completion Audit And Freeze

```text
Execute TC-F24. Perform the final product-feature completeness audit before moving Table Companion to HTTPS staging.

Prerequisites: TC-F11 through TC-F23 should be complete or explicitly documented as deferred with product approval.

Read Requirements.md, PROJECT_STATUS.md, IMPLEMENTATION_STATUS.md, REQUIREMENTS_TRACEABILITY.md, all TC-F11–F23 outcomes, routed screens, API/server/domain code, tests and current CI.

Tasks:
- verify the complete player character journey against the real stack: sign up -> create independent character -> optional portrait -> attach/join campaign -> edit -> privacy -> sheet HP/resources -> rest -> inventory/equipment -> spells where applicable -> receive and complete level-up -> detach/duplicate/delete lifecycle;
- verify the complete DM character-management journey: create campaign -> invite -> inspect party -> edit campaign character -> grant level-up -> manage membership -> prepare/start encounter -> combat/history;
- verify every user-visible production CTA performs a real action or is intentionally absent;
- verify Character Edit, Privacy, Level Up, HP controls and resource controls persist across refresh and backend restart;
- verify owner/DM/other-player authorization and private response shaping for all newly added character writes;
- verify live CombatInstance remains the authority while a character is in active combat and no sheet mutation creates divergent HP/resources;
- verify avatar upload validation/storage behavior in the configured non-production/staging-capable adapter;
- verify D&D rules/content support exactly matches the documented coverage matrix and no hidden "working subset" promise remains;
- run lint, typecheck, formatting, unit/integration, database migrations, security guardrails, build, container checks and two-client E2E;
- add/extend a feature-completeness E2E that exercises the highest-risk character flows, not only combat;
- update traceability with evidence and produce one decision: FEATURE-FROZEN FOR HTTPS, FEATURE-FROZEN WITH EXPLICIT DEFERRALS, or BLOCKED;
- list only external/staging tasks after this point: HTTPS Secure-cookie exercise, production media storage credentials/provider, backup/restore drill and deployment-provider configuration.

Do not mark FEATURE-FROZEN while a core Phase 1 screen still contains a no-op save/apply/CTA, a user-facing "Saved" state without persistence, or an undocumented partial rules/content promise.

Acceptance: the pre-HTTPS product has an evidence-backed feature-freeze decision; core Phase 1 character/DM flows are genuinely persisted and authorized; all validation is green; remaining work is deployment/staging or explicitly approved future scope rather than hidden incomplete product behavior.
```
