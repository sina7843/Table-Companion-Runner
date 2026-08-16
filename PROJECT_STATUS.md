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
- [ ] TC-P05 — realtime WebSocket sync and recovery
- [ ] TC-P06 — rules content pipeline and legal boundary
- [ ] TC-P07 — product, account, offline and operational states
- [ ] TC-P08 — e2e multiplayer, security and resilience
- [ ] TC-P09 — CI/CD, observability and production infrastructure
- [ ] TC-P10 — final production readiness and Golden Path

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

What remains: there is no realtime server, so a second device learns about a change by
re-reading rather than being told (`TC-P05`); a free-form attack roll is still evaluated on the
client; and there is no CI, ingest pipeline or observability beyond `/health` and structured
logs. No capability is production-ready yet. That is a scope statement, not a defect in what was
built.

Local setup: `docker compose up -d`, `npm run db:migrate`, `npm run db:seed`, `npm run server`.
Sign in as `marta@example.test` / `table-companion-dev`. See the Backend section of `README.md`.

## Current work
- Active item: none — `TC-P04` is complete; `TC-P05` is the next eligible prompt.
- Last completed item: `TC-P04` (Phase 1 sequence completed at `TC-17`)
- Blockers: none. `TC-P08` will need a browser-automation dependency for two independent clients;
  that is a decision for that prompt, not a blocker now.

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
