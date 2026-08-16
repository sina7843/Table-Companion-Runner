# Table Companion Project Status

Mark an item complete only after its implementation is reviewed, relevant checks pass, and the status change is included in the final commit for that item.

Sliced parents (`08`, `10`, `11`) are never executed as separate implementation prompts. Complete their `a`, `b`, and `c` slices in order.

## Phase 1 implementation
- [x] TC-00
- [x] TC-01
- [x] TC-02
- [x] TC-03
- [x] TC-04
- [x] TC-05
- [x] TC-06
- [x] TC-07
- [x] TC-08a
- [x] TC-08b
- [x] TC-08c
- [x] TC-09
- [x] TC-10a
- [x] TC-10b
- [x] TC-10c
- [x] TC-11a
- [x] TC-11b
- [x] TC-11c
- [x] TC-12
- [x] TC-13
- [x] TC-14
- [x] TC-15
- [x] TC-16
- [x] TC-17

## Production sequence

`prompts-extra/` is an independent production-hardening sequence that runs after Phase 1. It does
not modify the `prompts/` sequence above.

- [x] TC-P00 — production baseline and gap audit
- [x] TC-P01 — backend and PostgreSQL foundation
- [x] TC-P02 — authentication and server authorization
- [x] TC-P03 — API contract runtime validation and hardening
- [x] TC-P04 — server-authoritative combat and concurrency
- [x] TC-P05 — realtime sync and recovery
- [x] TC-P06 — rules content pipeline and legal boundary
- [x] TC-P07 — product, account, offline and operational states
- [x] TC-P08 — e2e multiplayer, security and resilience
- [x] TC-P09 — CI/CD, observability and production infrastructure
- [x] TC-P10 — final production readiness and Golden Path

The gap map, target architecture, production checklist and Golden Path evidence are in
`IMPLEMENTATION_STATUS.md`; architecture decisions are in `DECISIONS.md`.

## Current product state

The old TC-17 gaps are closed and must not be read as current limitations:

- **Authentication is real.** TC-P02 added scrypt credentials, HttpOnly session cookies and server-side authorization. TC-P07 added account creation, rename, sign-out and session-expiry recovery.
- **Realtime is real.** TC-P05 added an authenticated server-sent event stream scoped by campaign membership and filtered per viewer. The local `BroadcastChannel` remains only as the explicit development adapter.
- **Rules content has a real ingest pipeline.** TC-P06 imports redistributable SRD 5.1 content into PostgreSQL and blocks sources whose licences do not permit redistribution. The original 5e.tools requirement is met differently for legal reasons and traced in `REQUIREMENTS_TRACEABILITY.md`.
- **Combat is server-authoritative.** TC-P04 replaced whole-record saves with commands, version checks, idempotent retries, audit history and targeted undo.
- **The production path is tested end to end.** TC-P08/P10 drive independent DM and Player browser contexts against the real backend, PostgreSQL and realtime stream.

`TC-P10` audited a production-shaped container built from an empty database: **35 Golden Path checks passed, 2 deployment-owned restart checks were skipped by name in the external-target run, and the restart was verified separately.** No blocker was found.

## Release decision

**READY WITH NON-BLOCKING FOLLOW-UPS**, subject to a green CI run on the branch being merged.

Follow-ups after the post-audit cleanup:

| Follow-up | State | Owner action |
| --- | --- | --- |
| Secure cookies over real TLS | Open | Run the E2E suite once against an HTTPS staging host with no `TC_COOKIE_SECURE=false` override before first public release. |
| Server-side end-to-end attack/action resolution | Open | Extend the `Ruleset` seam so the server resolves attack roll, hit/miss, damage and effects rather than accepting a client-chosen damage amount. |
| Fixture bytes in production bundle | Partially closed | Production now **refuses to fall back to fixtures** when `VITE_API_BASE_URL` is absent. The remaining optimisation is to code-split/remove fixture bytes from the production bundle. |
| `/dev/showcase` in production | Closed | The route is now gated by `import.meta.env.DEV` and is absent from the production route graph. |
| Horizontal scaling | Open when needed | The realtime hub and limiter are per-process. Add a shared bus (PostgreSQL `LISTEN/NOTIFY` is the documented option) before running multiple app instances. |

## Current work

- Active item: post-audit release cleanup on `tc-p04-server-authoritative-combat`.
- Last completed production item: `TC-P10`.
- Merge blocker: CI must be green. The previous run failed only because the secret guardrail matched explicit fake credentials inside security tests; the guardrail now allows only those exact path-and-value fixtures and still scans every test file.

## Deliberate Phase 1 boundaries

These are product-scope choices, not missing infrastructure:

- No password change, email change or account deletion flow yet.
- No per-member presence indicator.
- No offline mutation queue; stale writes are refused rather than silently merged.
- DM **Spells** and **Items** library screens are not in Phase 1 because the approved Phase 1 information architecture and imported content do not support them yet.
- One application instance is supported until the shared realtime/rate-limit bus is built.

## Local setup

`docker compose up -d`, `npm run db:migrate`, `npm run db:seed`, `npm run server`.
Sign in as `marta@example.test` / `table-companion-dev`. See the Backend section of `README.md`.

## Visual confirmation

Design-intent and responsive-layout acceptance still benefit from a person looking at the running app.
In development, run `npm run dev` and use `/dev/showcase` for primitives and `?scenario=` for state coverage. The showcase is deliberately unavailable in production.
