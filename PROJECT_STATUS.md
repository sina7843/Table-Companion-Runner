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

## Current work
- Active item: none — the Phase 1 prompt sequence is complete.
- Last completed item: `TC-17`
- Blockers: none blocking the prompt sequence.

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
