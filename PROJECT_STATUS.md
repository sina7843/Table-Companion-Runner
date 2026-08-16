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

The gap map, the target architecture, the production checklist and the Golden Path are in
`IMPLEMENTATION_STATUS.md`; the architecture decisions behind them are in `DECISIONS.md` (TC-P00).

**Persistence, authorization, the API boundary and combat authority are real; multiplayer
delivery is not.** Since `TC-P01` every §6 entity has a PostgreSQL table behind it. Since
`TC-P02` sessions are real cookies, every rule in `permissions.ts` is enforced server-side, and
private data is filtered before it is sent rather than hidden on arrival. Since `TC-P03` every
request and response is validated at runtime, errors carry stable codes, requests carry
correlation ids, and the boundary is rate limited and paged. Since `TC-P04` a fight changes only
by command: the server computes hit points, turn order, initiative and death saves from the
state it holds, refuses a stale writer rather than merging, recognises a retry, and records every
accepted change as an auditable event that undo reads.

Since `TC-P05` a deployment broadcasts after it commits: two devices at one table see each
other's changes over an authenticated event stream scoped to the campaigns each account is in,
a secret roll is not announced to a player at all, and a client that missed a window is told to
re-read rather than handed a reconstruction.

Since `TC-P06` rules content is imported from an approved source rather than hand-maintained
in TypeScript: the catalogue is bundles under `content/`, the importer refuses a source whose
licence does not permit redistribution, and every record is traceable to a source and a licence.

Since `TC-P07` the screens behave the way a server-backed product has to. An account can be
created and renamed and signed out of; a session that ends says so and returns the person to
where they were; a failed autosave keeps the work, says so and offers a retry rather than
reporting `Saved`; and two things the app could not actually know — a player's presence and a
connection state — stopped being asserted.

Since `TC-P08` the Golden Path is driven end to end by two independent browsers against the
real backend, database and event stream, with privacy asserted in the payload, the DOM, the
stream and the logs; the server has adversarial coverage over HTTP for id tampering, privilege
escalation, replay, stale commands, unauthorized subscription and concurrent writes; and a
backend restart, a dropped stream and two clients on one version all recover without losing
anything. It found four real defects — most importantly that the browser had been sending
`expectedVersion: 0` on every combat command since TC-P04, because the response schema dropped
the field.

Since `TC-P09` there is a way to ship it. Every commit is validated by four CI jobs — checks,
tests against PostgreSQL, the browser suite, and an image that is built, migrated, run and
probed. One container serves the bundle and the API same-origin, drains on `SIGTERM`, answers
liveness and readiness separately and exposes Prometheus counts. The redaction rule that used to
be a comment is enforced on every log line, `DEPLOYMENT.md` documents secrets, startup order,
migrations, backup and rollback, and the Golden Path was run against a clean staging container
rather than described — which found the last defect: imported creatures never reached the table
the app serves.

`TC-P10` audited the result against a container built from this commit, an empty database, and
two independent browsers: **35 of 35 Golden Path steps passed, a restart returned the same
version and hit points, and no secret reached an unauthorized response, the DOM, the stream, the
logs or `/metrics`.** It found and fixed two configuration defects — staging cookies laxer than
documented, and migrate-on-boot defaulting to on in production.

**Release decision: READY WITH NON-BLOCKING FOLLOW-UPS.** Four follow-ups, each with an owner
action: exercise `Secure` cookies against a TLS host, close the client-evaluated attack roll,
stop shipping fixture bytes (and fail loudly rather than falling back to them), and drop
`/dev/showcase` from a production build. The full evidence is in `IMPLEMENTATION_STATUS.md`.

What remains beyond those: the realtime hub is per-process, so only one instance is supported.
That is a scope statement, not a defect in what was built.

Local setup: `docker compose up -d`, `npm run db:migrate`, `npm run db:seed`, `npm run server`.
Sign in as `marta@example.test` / `table-companion-dev`. See the Backend section of `README.md`.

## Current work
- Active item: none — the production sequence is complete through `TC-P10`.
- Last completed item: `TC-P10` (Phase 1 sequence completed at `TC-17`)
- Blockers: none. The TC-P10 audit returned READY WITH NON-BLOCKING FOLLOW-UPS; the four
  follow-ups are the backlog and each has an owner action.

## Phase 1 scope gaps

Every prompt was executed, but three items in `Requirements.md` §6 are not fully built. They are
recorded here rather than buried, and traced in `REQUIREMENTS_TRACEABILITY.md`.

| Gap | State | Why |
| --- | --- | --- |
| Authentication (§6.1) | Partial | Session identity, `SessionGate` and the sign-in surface exist. No credential check, no token, no server to check against. No prompt in the sequence introduced one. |
| Realtime multiplayer (§6.19) | Partial | The channel seam, the same-device `BroadcastChannel` transport and the reconnecting WebSocket client are built and tested. There is no server. TC-13 explicitly forbade choosing a provider requiring credentials. |
| 5e.tools data (§6.35) | Blocked | The monster library reads real SRD stat blocks from `src/domain/data/monsterLibrary.ts` in the ingest shape. No ingest pipeline exists, and none was prompted. |

Two design surfaces were deliberately not built: the DM sidebar's **Spells** and **Items**
sections. `Requirements.md` §18.1 does not place them in the Phase 1 information architecture and
no content exists to fill them. See `DECISIONS.md` (TC-17).

## Awaiting visual confirmation

Design-intent and responsive-layout acceptance criteria need a person to look at the running app.
`npm run dev`, then `/dev/showcase` for primitives and `?scenario=` for state coverage.
