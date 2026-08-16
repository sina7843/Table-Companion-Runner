# Table Companion — Requirements traceability

Current traceability for `Requirements.md` §6 after the Phase 1 and production sequences. This
file describes the implementation that exists now; historical TC-17 paths and limitations are
superseded by TC-P01…TC-P10.

Status values: **Done** — implemented and covered. **Met differently** — the requirement's product
intent is implemented through a safer/legal source than the originally named mechanism. **Limited**
— implemented, with a named non-blocking boundary.

## §6 Phase 1 scope

| # | Requirement | Routes | Current implementation | Primary coverage | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Authentication / Users | `/`, `/signup`, `/join`, `/dm/account` | `server/auth.ts`, `server/authorize.ts`, `src/domain/data/SessionProvider.tsx`, `src/domain/data/sessionExpiry.ts`, `src/screens/account.tsx` | `server/auth.test.ts`, `server/authorize.test.ts`, `server/account.test.ts`, `src/domain/account.test.ts` | **Done** — scrypt credentials, HttpOnly session cookies, server-side authorization, account creation/rename/sign-out and expiry recovery. |
| 2 | Game System selection | `/builder`, `/campaigns/new` | `src/domain/ruleset/registry.ts`, ruleset-backed content catalogue | `src/domain/domain.test.ts`, `src/domain/rulesetContract.test.ts` | Done |
| 3 | Campaigns | `/dm/campaigns`, `/dm/campaigns/:id`, `/campaigns/new` | campaign screens + PostgreSQL repositories | `server/store.test.ts`, `src/domain/domain.test.ts`, E2E Golden Path | Done |
| 4 | Party management | `/dm/campaigns/:id/party`, `/dm/characters`, `/play/party` | campaign party surfaces + server-scoped membership reads | authorization tests + Golden Path | Done |
| 5 | Character creation | `/builder`, `/builder/:draftId` | `src/screens/builder/BuilderScreen.tsx`, `Ruleset.builderSteps` / `builderStepForm`, server-backed drafts | builder tests + Golden Path | Done |
| 6 | Character management | `/play/sheet/:id/edit`, `/play/characters` | character edit/list surfaces through authorized repositories | sheet/domain/adversarial tests | Done |
| 7 | Character level-up | `/play/sheet/:id/level-up` | `src/screens/character/LevelUp.tsx`, `Ruleset.levelUpSteps` / `applyLevelUp` | sheet + ruleset contract tests | Done |
| 8 | Character Sheets | `/play/sheet/:id`, `/dm/characters/:id` | `CharacterSheet.tsx`, `ruleset/dnd5e/sheet.ts` | sheet + E2E coverage | Done |
| 9 | Character privacy controls | `/play/sheet/:id/privacy` | `src/domain/permissions.ts` plus server filtering before serialization | authorize/adversarial/privacy E2E assertions | Done |
| 10 | Monster library | `/dm/monsters` | `MonsterLibrary.tsx`; SRD bundles → `server/content/import.ts` → PostgreSQL/library records | content/import/library tests + staging Golden Path | Done |
| 11 | Monster Sheets | `/dm/monsters/:id` | `MonsterPage.tsx`, `MonsterSheet.tsx` | monster sheet + E2E coverage | Done |
| 12 | Custom / Homebrew Monsters | `/dm/monsters/new` | `MonsterEditor.tsx`, ruleset homebrew validation, PostgreSQL persistence | homebrew/store/adversarial tests | Done |
| 13 | Monster cloning | `/dm/monsters/:id/clone` | `MonsterEditor mode="clone"`, authorized repository clone | homebrew/store tests | Done |
| 14 | Monster editing | `/dm/monsters/:id/edit` | `MonsterEditor mode="edit"`, authorized repository update | homebrew/adversarial tests | Done |
| 15 | Encounter builder | `/dm/encounters/new`, `/dm/encounters/:id/edit` | `EncounterBuilder.tsx`, composition transforms, shared autosave | composition/autosave/E2E tests | Done |
| 16 | Saved Encounters | `/dm/encounters`, `/dm/encounters/:id` | encounter library/detail + PostgreSQL persistence | encounter/store/E2E tests | Done |
| 17 | Reusable Encounters | encounter → Start combat | `CombatRepository.startFromTemplate`; pre-combat transforms now in `src/domain/combat/setup.ts` | `src/domain/combat/setup.test.ts`, store/E2E tests | Done |
| 18 | Live Combat | `/dm/combat/:id`, `/play/combat` | `CombatRunner.tsx`, `PlayerCombat.tsx`, command API + `server/combatService.ts` | command, combat service, realtime and E2E tests | Done |
| 19 | Realtime multiplayer state | both combat routes | `src/domain/data/realtime.ts`, authenticated `GET /events`, `server/broadcast.ts`; events notify, clients re-read authoritative state | `server/realtime.test.ts`, resilience + Golden Path E2E | **Done** — production uses SSE/EventSource; `BroadcastChannel` is development-only. |
| 20 | Initiative management | `/dm/combat/:id` | `src/domain/combat/setup.ts`, `initiative.roll` / `initiative.set`; state-changing rolls are server-owned | setup + command + combat service tests | Done |
| 21 | Round management | `/dm/combat/:id` | `src/domain/combat/turns.ts` through server-authoritative commands | turns/commands/concurrency tests | Done |
| 22 | Turn management | both combat routes | `src/domain/combat/turns.ts`, `turn.next` / `previous` / `jump` / `move` / `resort` | turns/commands/E2E tests | Done |
| 23 | HP management | combat routes, sheet | `src/domain/combat/actions.ts`, `health.damage` / `heal` / `override` commands | actions/commands/combat service tests | Done |
| 24 | Damage | combat routes | `health.damage`; server computes result from stored state via shared reducer | command concurrency + Golden Path | **Limited** — authoritative application is complete; free-form player attack damage is still client-chosen pending end-to-end action resolution. |
| 25 | Healing | combat routes | `health.heal` through the same authoritative command path | command + E2E tests | Done |
| 26 | Conditions | combat routes, sheet | `condition.add` / `condition.remove`; valid keys come from `Ruleset.conditions` | command/ruleset/E2E tests | Done |
| 27 | Death Saves where supported | combat routes | `deathSave.roll`; server rolls through injected `RandomSource`, outcome delegated to Ruleset | commands/combat service tests | Done |
| 28 | Dice rolling | `/play/dice`, combat, sheets | roll repository + `Ruleset.evaluateRoll`; viewer filtering server-side | rolls/authorize/E2E tests | Done |
| 29 | Rolls from Character actions | `/play/combat`, `/play/sheet/:id` | `Ruleset.characterActions`; action UI records rolls and authoritative damage command | player turn + E2E tests | **Limited** — free-form attack action is not yet resolved end to end by the server. |
| 30 | Rolls from Monster actions | `/dm/combat/:id` | `Ruleset.monsterActions` + roll log; DM-authorized surface | ruleset/roll tests | Done |
| 31 | Public rolls | combat routes | party-visible roll records, filtered at server boundary | roll/authorize/realtime/E2E tests | Done |
| 32 | Secret DM rolls | `/dm/combat/:id` | server filters payload and realtime audience; players are not even notified that a secret roll happened | authorize/realtime/adversarial/E2E privacy tests | Done |
| 33 | Combat log | both combat routes | persisted roll/event history + `useCombatLog` presentation | roll/combat/E2E tests | Done |
| 34 | DM edit / override / undo | `/dm/combat/:id` | `health.override`, `state.override`, `undo`; `server/combatService.ts` resolves reversible audit history and restores one participant only | command/combat service concurrency and undo tests | Done |
| 35 | Data sourced from 5e.tools for D&D | library/builder | redistributable SRD 5.1 bundles under `content/`, licence gate in `src/domain/content/licenses.ts`, deterministic importer | `src/domain/content/content.test.ts`, `server/content/import.test.ts` | **Met differently** — 5e.tools is not redistributed; SRD 5.1 CC BY 4.0 provides the legal production source. |
| 36 | Autosave | builder, encounter builder, monster editor | shared `src/app/useAutosave.ts` + `SaveStatus.tsx`; failures retain work and expose retry | `src/app/autosave.test.ts`, `src/app/states.test.ts`, E2E | Done |
| 37 | Graceful reconnect and state recovery | combat routes | EventSource reconnect + bounded replay + `sync.required` full re-read; `useConnection.ts` exposes reconnect/resync states | `server/realtime.test.ts`, `e2e/resilience.spec.ts` | Done |

## Production readiness

TC-P10 audited a container built from the repository against an empty PostgreSQL database and two
independent browser contexts. The persisted Golden Path covers account/session, campaign creation,
invite redemption, character building, encounter creation, combat, realtime convergence, privacy,
refresh, restart recovery and completion.

| Concern | Evidence |
| --- | --- |
| Two-client Golden Path | local stack: 37 E2E pass; production-shaped external-target run: 35 pass, 2 restart-owned checks skipped by name |
| Persistence after restart | same combat version, round, active participant and HP; recorded roll remains exactly once |
| Concurrency | two commands on one expected version → one `200`, one `409`; no last-write-wins |
| Retry safety | same `commandId` is replayed without reapplying state or adding a second audit row |
| Privacy | secret/private data absent from unauthorized API payloads, DOM, realtime stream, logs and metrics |
| Content | imported through the production image; encounter builder reads the imported creature library |
| Operational surface | Docker image, migrations, readiness/liveness, graceful shutdown, Prometheus metrics and CI jobs exist |

Current non-blocking follow-ups are tracked in `PROJECT_STATUS.md`: exercise Secure cookies against
real HTTPS before first public release, move free-form attack resolution fully server-side, remove
fixture bytes from the production bundle (production fallback is already refused), add a shared
realtime/rate-limit bus before horizontal scaling, and keep `/dev/showcase` development-only.

## §18 information architecture

| IA entry | Route | Status |
| --- | --- | --- |
| DM — Home | `/dm` | Done |
| DM — Campaigns | `/dm/campaigns` | Done |
| DM — Characters | `/dm/characters` | Done |
| DM — Monsters | `/dm/monsters` | Done |
| DM — Encounters | `/dm/encounters` | Done |
| DM — Active Combat | `/dm/combat`, `/dm/combat/:id` | Done |
| Campaign — Overview / Party / Encounters / Recent Combats / Settings | `/dm/campaigns/:id/...` | Done |
| Player — Home | `/play` | Done |
| Player — My Characters | `/play/characters` | Done — reached from Home rather than adding a sixth bottom-nav item |
| Player — Party / Campaign | `/play/party` | Done |
| Player — Active Combat | `/play/combat` | Done |

The approved design also shows DM **Spells** and **Items** library destinations. They remain outside
Phase 1 because the approved Phase 1 IA and imported catalogue do not yet define those product
surfaces; they are intentionally absent rather than permanent placeholders.

## Cross-cutting requirements

| Requirement | Current implementation | Coverage |
| --- | --- | --- |
| Game-system agnostic core | `src/domain/types.ts` names no D&D vocabulary; concrete adapters are behind the Ruleset registry; combat commands delegate rules questions to `Ruleset` | domain/ruleset/command boundary tests |
| Entity-based model | Campaign, Character, Monster, EncounterTemplate and CombatInstance remain separate persisted entities | domain/store tests |
| Encounter template vs combat instance | starting a fight creates a separate instance; runtime commands cannot mutate the template | setup/store/E2E tests |
| Device strategy | DM desktop/tablet shell, Player mobile-first touch shell | responsive/a11y E2E |
| Connectivity | realtime notifications never carry state; reconnect/replay leads to authoritative re-read | realtime/resilience tests |
| Accessibility | semantic headings, native dialogs, touch-target floor, word+glyph state communication | accessibility unit + Playwright checks |
| Visual fidelity | approved design-system CSS remains the visual contract, adapters carry types/ARIA rather than new visual decisions | fidelity tests + manual visual confirmation |
| Security boundary | UI permissions are convenience only; server authorization and response filtering are authoritative | authorize/adversarial/E2E tests |
