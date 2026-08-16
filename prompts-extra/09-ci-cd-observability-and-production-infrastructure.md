# TC-P09 — CI/CD Observability And Production Infrastructure

```text
Execute TC-P09. Add the production delivery and operational infrastructure needed to deploy Table Companion safely.

Inspect package scripts, backend/database setup, tests from TC-P08, `.env.example`, and repository guardrails first.

Tasks:
- create CI that installs dependencies reproducibly and runs lint, typecheck, unit/integration tests, E2E tests where feasible, build, migration validation, and package/guardrail checks;
- define separate development, test, staging, and production configuration boundaries without committing secrets;
- provide container/deployment configuration appropriate to the chosen stack, including web, API, database connectivity, health/readiness checks, and graceful shutdown;
- make database migrations explicit and safe in deployment; define backup/restore and rollback expectations;
- add structured application logging, error reporting boundary, metrics/health endpoints, and correlation IDs sufficient to diagnose auth/API/realtime/combat failures;
- ensure logs redact tokens, passwords, secret rolls, and private character data;
- document secret management, environment variables, startup order, deployment commands, migration commands, and rollback/recovery procedures;
- add production-safe rate/size/time limits and resource defaults where missing;
- validate that a clean staging deployment can run the Golden Path using real persistence and realtime.

Do not hardcode vendor credentials. Prefer provider-neutral infrastructure where no deployment provider has been approved.

Acceptance: every commit/PR can be automatically validated, staging can be deployed from documented configuration, service and database health are observable, migrations/backup/rollback are documented, and production secrets/private data are not exposed in source or logs.
```
