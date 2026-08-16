# Table Companion — Requirements traceability

Every item in `Requirements.md` §6 (Phase 1 Scope), traced to the routes, components and tests
that implement it. Written at TC-17; anything not fully implemented says so in the Status column
rather than being omitted.

Status values: **Done** — implemented and covered. **Partial** — the requirement works but a
named part of it is not built. **Blocked** — not built, with the blocker named.

## §6 Phase 1 scope

| # | Requirement | Routes | Implementation | Tests | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Authentication / Users | `/`, `/join` | [entry.tsx](src/screens/entry.tsx), [account.tsx](src/screens/account.tsx), [SessionProvider.tsx](src/domain/data/SessionProvider.tsx), [sessionExpiry.ts](src/domain/data/sessionExpiry.ts), [server/auth.ts](server/auth.ts), [server/authorize.ts](server/authorize.ts) | [auth.test.ts](server/auth.test.ts), [authorize.test.ts](server/authorize.test.ts), [account.test.ts](server/account.test.ts), [account.test.ts](src/domain/account.test.ts) | Done — TC-P02. Scrypt credentials, HttpOnly SameSite=Strict session cookies, invite redemption, and every `permissions.ts` rule enforced server-side. Account lifecycle completed at TC-P07: `/signup` creates an account, `/dm/account` renames and signs out through `PUT /me`, and a session that ends is detected, explained and returned from. |
| 2 | Game System selection | `/builder` step 1, `/campaigns/new` | [registry.ts](src/domain/ruleset/registry.ts), [gameSystems](src/domain/data/fixtureRepositories.ts) | [domain.test.ts](src/domain/domain.test.ts), [rulesetContract.test.ts](src/domain/rulesetContract.test.ts) | Done |
| 3 | Campaigns | `/dm/campaigns`, `/dm/campaigns/:id`, `/campaigns/new` | [CampaignLayout.tsx](src/screens/campaign/CampaignLayout.tsx), [CampaignScreens.tsx](src/screens/campaign/CampaignScreens.tsx) | [domain.test.ts](src/domain/domain.test.ts) | Done |
| 4 | Party management | `/dm/campaigns/:id/party`, `/dm/characters`, `/play/party` | `CampaignParty`, `PartyTable`, [shared.tsx](src/screens/campaign/shared.tsx) (`buildPartyRows`, `partyColumns`), `PlayerParty` | [domain.test.ts](src/domain/domain.test.ts) | Done |
| 5 | Character creation | `/builder`, `/builder/:draftId` | [BuilderScreen.tsx](src/screens/builder/BuilderScreen.tsx), [fields.tsx](src/screens/builder/fields.tsx), `Ruleset.builderSteps` / `builderStepForm` | [builder.test.ts](src/domain/builder.test.ts) | Done |
| 6 | Character management | `/play/sheet/:id/edit`, `/play/characters` | [Privacy.tsx](src/screens/character/Privacy.tsx) (`CharacterEdit`), `PlayerCharacters` | [sheet.test.ts](src/domain/sheet.test.ts) | Done |
| 7 | Character level-up | `/play/sheet/:id/level-up` | [LevelUp.tsx](src/screens/character/LevelUp.tsx), `Ruleset.levelUpSteps` / `levelUpStepForm` / `applyLevelUp` | [sheet.test.ts](src/domain/sheet.test.ts), [rulesetContract.test.ts](src/domain/rulesetContract.test.ts) | Done |
| 8 | Character Sheets | `/play/sheet/:id`, `/dm/characters/:id` | [CharacterSheet.tsx](src/screens/character/CharacterSheet.tsx), [sheet.ts](src/domain/ruleset/dnd5e/sheet.ts) | [sheet.test.ts](src/domain/sheet.test.ts) | Done |
| 9 | Character privacy controls | `/play/sheet/:id/privacy` | [Privacy.tsx](src/screens/character/Privacy.tsx), [permissions.ts](src/domain/permissions.ts) (`visibleSections`, `viewerFor`) | [sheet.test.ts](src/domain/sheet.test.ts), [domain.test.ts](src/domain/domain.test.ts) | Done |
| 10 | Monster library | `/dm/monsters` | [MonsterLibrary.tsx](src/screens/monsters/MonsterLibrary.tsx), [monsterLibrary.ts](src/domain/data/monsterLibrary.ts) | [library.test.ts](src/domain/library.test.ts) | Done |
| 11 | Monster Sheets | `/dm/monsters/:id` | [MonsterPage.tsx](src/screens/monsters/MonsterPage.tsx), [MonsterSheet.tsx](src/screens/monsters/MonsterSheet.tsx) | [monsterSheet.test.ts](src/domain/monsterSheet.test.ts) | Done |
| 12 | Custom / Homebrew Monsters | `/dm/monsters/new` | [MonsterEditor.tsx](src/screens/monsters/MonsterEditor.tsx), [homebrew.ts](src/domain/ruleset/dnd5e/homebrew.ts) | [homebrew.test.ts](src/domain/homebrew.test.ts) | Done |
| 13 | Monster cloning | `/dm/monsters/:id/clone` | `MonsterEditor mode="clone"`, `monsters.cloneFrom` | [homebrew.test.ts](src/domain/homebrew.test.ts) | Done |
| 14 | Monster editing | `/dm/monsters/:id/edit` | `MonsterEditor mode="edit"` | [homebrew.test.ts](src/domain/homebrew.test.ts) | Done |
| 15 | Encounter builder | `/dm/encounters/new`, `/dm/encounters/:id/edit` | [EncounterBuilder.tsx](src/screens/encounters/EncounterBuilder.tsx), [composition.ts](src/screens/encounters/composition.ts) | [composition.test.ts](src/screens/encounters/composition.test.ts), [encounters.test.ts](src/domain/encounters.test.ts) | Done |
| 16 | Saved Encounters | `/dm/encounters`, `/dm/encounters/:id` | [EncounterLibrary.tsx](src/screens/encounters/EncounterLibrary.tsx), [EncounterDetail.tsx](src/screens/encounters/EncounterDetail.tsx) | [encounters.test.ts](src/domain/encounters.test.ts) | Done |
| 17 | Reusable Encounters | `/dm/encounters/:id` → Start combat | [setup.ts](src/screens/combat/setup.ts) (`copyTemplate`), `combats.startFromTemplate` | [setup.test.ts](src/screens/combat/setup.test.ts) | Done |
| 18 | Live Combat | `/dm/combat/:id`, `/play/combat` | [CombatRunner.tsx](src/screens/combat/CombatRunner.tsx), [PlayerCombat.tsx](src/screens/player/PlayerCombat.tsx) | [turns.test.ts](src/screens/combat/turns.test.ts), [turn.test.ts](src/screens/player/turn.test.ts) | Done |
| 19 | Realtime multiplayer state | both combat routes | [realtime.ts](src/domain/data/realtime.ts), [withRealtime.ts](src/domain/data/withRealtime.ts), `useRealtime` | [seams.test.ts](src/domain/seams.test.ts), [connection.test.ts](src/app/connection.test.ts) | **Partial** — the seam, the local channel and the socket client are built and tested; no server exists to talk to. See Known limitations. |
| 20 | Initiative management | `/dm/combat/:id` | [setup.ts](src/screens/combat/setup.ts), `Ruleset.initiativeRequest` / `initiativeOrder` | [setup.test.ts](src/screens/combat/setup.test.ts) | Done |
| 21 | Round management | `/dm/combat/:id` | [turns.ts](src/screens/combat/turns.ts) (`advance`, `rewind`) | [turns.test.ts](src/screens/combat/turns.test.ts) | Done |
| 22 | Turn management | both combat routes | [turns.ts](src/screens/combat/turns.ts), [turn.ts](src/screens/player/turn.ts) | [turns.test.ts](src/screens/combat/turns.test.ts), [turn.test.ts](src/screens/player/turn.test.ts) | Done |
| 23 | HP management | combat routes, sheet | [HitPoints.tsx](src/design-system/components/HitPoints.tsx) (`HPControl`), [actions.ts](src/screens/combat/actions.ts) | [actions.test.ts](src/screens/combat/actions.test.ts) | Done |
| 24 | Damage | combat routes | [actions.ts](src/screens/combat/actions.ts) (`applyDamage`) | [actions.test.ts](src/screens/combat/actions.test.ts) | Done |
| 25 | Healing | combat routes | [actions.ts](src/screens/combat/actions.ts) (`applyHealing`) | [actions.test.ts](src/screens/combat/actions.test.ts) | Done |
| 26 | Conditions | combat routes, sheet | `Ruleset.conditions`, [Combat.tsx](src/design-system/components/Combat.tsx) (`ConditionChip`) | [actions.test.ts](src/screens/combat/actions.test.ts), [rulesetContract.test.ts](src/domain/rulesetContract.test.ts) | Done |
| 27 | Death Saves where ruleset supports them | combat routes | `Ruleset.deathSaveRequest` / `applyDeathSave` / `deathSaveOutcome`, `capabilities.deathSaves` | [actions.test.ts](src/screens/combat/actions.test.ts), [rulesetContract.test.ts](src/domain/rulesetContract.test.ts) | Done |
| 28 | Dice rolling | `/play/dice`, both combat routes, sheet | [useRoller.tsx](src/app/useRoller.tsx), `Ruleset.evaluateRoll` | [rolls.test.ts](src/domain/rolls.test.ts) | Done |
| 29 | Rolls from Character actions | `/play/combat`, `/play/sheet/:id` | [turn.ts](src/screens/player/turn.ts) (`quickActions`), `Ruleset.characterActions` | [turn.test.ts](src/screens/player/turn.test.ts) | Done |
| 30 | Rolls from Monster actions | `/dm/combat/:id` | [actions.ts](src/screens/combat/actions.ts), `Ruleset.monsterActions` | [actions.test.ts](src/screens/combat/actions.test.ts) | Done |
| 31 | Public rolls | both combat routes | [useCombatLog.tsx](src/screens/combat/useCombatLog.tsx) (`visibility: 'party'`) | [rolls.test.ts](src/domain/rolls.test.ts) | Done |
| 32 | Secret DM rolls | `/dm/combat/:id` | `useCombatLog` secret list, [permissions.ts](src/domain/permissions.ts) (`isPlayerVisibleRoll`, `visibleRolls`) | [rolls.test.ts](src/domain/rolls.test.ts) — asserts the DM split and the player filter cannot diverge | Done |
| 33 | Combat log | both combat routes | [useCombatLog.tsx](src/screens/combat/useCombatLog.tsx), `RollLog` in [CombatRunner.tsx](src/screens/combat/CombatRunner.tsx) | [rolls.test.ts](src/domain/rolls.test.ts) | Done |
| 34 | DM edit / override / undo | `/dm/combat/:id` | [actions.ts](src/screens/combat/actions.ts) (`revertHealth`), targeted undo in `CombatRunner` | [actions.test.ts](src/screens/combat/actions.test.ts) | Done |
| 35 | Data sourced from 5e.tools for D&D | `/dm/monsters` | [content/](content/) bundles → [server/content/import.ts](server/content/import.ts) → `content_records`; read back through [ruleset/dnd5e/content.ts](src/domain/ruleset/dnd5e/content.ts) | [content.test.ts](src/domain/content/content.test.ts), [import.test.ts](server/content/import.test.ts) | **Met differently, and documented** — TC-P06. There is a real ingest pipeline, and the source is the SRD 5.1 under CC BY 4.0 rather than 5e.tools, which no licence permits redistributing. The blocker is recorded in [content/README.md](content/README.md) and enforced by the importer. |
| 36 | Autosave | builder, encounter builder, monster editor | one [useAutosave.ts](src/app/useAutosave.ts) behind all three, with [SaveStatus.tsx](src/app/SaveStatus.tsx) | [autosave.test.ts](src/app/autosave.test.ts), [states.test.ts](src/app/states.test.ts) | Done — and at TC-P07 a failed save stopped reporting `Saved`. The edit is kept, the failure is said, and the retry sends the same value. |
| 37 | Graceful reconnect and state recovery | both combat routes | [useConnection.ts](src/app/useConnection.ts), `ConnectionStatus`, restored banner, and the shell status region | [connection.test.ts](src/app/connection.test.ts), [states.test.ts](src/app/states.test.ts) | Done — and at TC-P07 every screen stopped asserting a connection state it could not know. |

## Production readiness

Audited at TC-P10 against a container built from the `Dockerfile`, an empty database migrated
and imported through it, and two independent browsers. Every §6 row above is backed by real
authentication, server-side authorization, PostgreSQL persistence and runtime validation; the
combat and roll rows are additionally backed by an authenticated event stream.

| | Evidence |
| --- | --- |
| Golden Path, two independent clients | 35 passed, 2 skipped by name, 0 failed, against the production stack |
| Refresh | Same version, active participant and round |
| Backend restart | Same version, round, active participant, hit points; one roll, not two |
| Concurrency | Two commands on one version → `200` and `409`; the fight moved by exactly one |
| Privacy | Absent from the player's API payload, stream, DOM, the server's 617 log lines and `/metrics` |
| Requirement 35 (5e.tools) | Met differently and documented — SRD 5.1 under CC BY 4.0, enforced by the importer |

The one §6 capability with a stated limit is the free-form attack roll, which the client still
evaluates. TC-P10 audited it as non-blocking: it is bounded to creatures, so it is a cheating
vector rather than an escalation or a leak. See `IMPLEMENTATION_STATUS.md` (F-2).

## §18 Information architecture

| IA entry | Route | Status |
| --- | --- | --- |
| DM — Home | `/dm` | Done |
| DM — Campaigns | `/dm/campaigns` | Done |
| DM — Characters | `/dm/characters` | Done |
| DM — Monsters | `/dm/monsters` | Done |
| DM — Encounters | `/dm/encounters` | Done |
| DM — Active Combat | `/dm/combat`, `/dm/combat/:id` | Done |
| Campaign — Overview / Party / Encounters / Recent Combats / Settings | `/dm/campaigns/:id`, `…/party`, `…/encounters`, `…/combats`, `…/settings` | Done |
| Player — Home | `/play` | Done |
| Player — My Characters | `/play/characters` | Done — reached from Home rather than the bottom bar, which the design caps at five |
| Player — Campaigns | `/play/party` | Done — a Phase 1 player belongs to one campaign, so this is the party rather than a list |
| Player — Active Combat | `/play/combat` | Done |

The approved design's DM sidebar also shows **Spells** and **Items** under Library.
Requirements §18.1 does not place them in the Phase 1 IA and no ingested content exists to fill
them, so both were removed rather than shipped as permanent skeletons. This is the one place the
implemented navigation is narrower than the approved design; the rationale is in `DECISIONS.md`
and the removal is guarded by [routes.test.ts](src/app/routes.test.ts).

## Cross-cutting requirements

| Requirement | Implementation | Tests |
| --- | --- | --- |
| §3.1 Game-system agnostic | [types.ts](src/domain/types.ts) names no D&D concept; only [registry.ts](src/domain/ruleset/registry.ts) imports an adapter | [domain.test.ts](src/domain/domain.test.ts) walks every source file and fails on a boundary crossing |
| §3.2 Entity-based | [types.ts](src/domain/types.ts) — `Character`, `Monster`, `EncounterTemplate`, `CombatInstance` as distinct entities | [domain.test.ts](src/domain/domain.test.ts) |
| §11.3 Encounter vs Combat Instance | [setup.ts](src/screens/combat/setup.ts) — `copyTemplate` / `copyCombat`; the combat transforms cannot name an `EncounterTemplate` | [setup.test.ts](src/screens/combat/setup.test.ts) |
| §5 Device strategy | [DMShell.tsx](src/app/DMShell.tsx) (compact ≥1280), [PlayerShell.tsx](src/app/PlayerShell.tsx) (touch density) | [connection.test.ts](src/app/connection.test.ts) |
| §15 Offline / connectivity | [useConnection.ts](src/app/useConnection.ts) | [connection.test.ts](src/app/connection.test.ts) |
| Accessibility, keyboard, touch | [touch-targets.css](src/design-system/components/css/touch-targets.css), [adapters.css](src/design-system/components/adapters.css) hover escapes | [accessibility.test.ts](src/design-system/accessibility.test.ts) |
| Visual fidelity to the approved design | [design-system/](src/design-system/) CSS is a verbatim copy | [fidelity.test.ts](src/design-system/fidelity.test.ts), [types.test.ts](src/design-system/components/types.test.ts) |
| Data / realtime seams | [dataSource.ts](src/domain/data/dataSource.ts), [apiContract.ts](src/domain/data/apiContract.ts), [httpRepositories.ts](src/domain/data/httpRepositories.ts) | [seams.test.ts](src/domain/seams.test.ts) |
| Navigation matches the route graph | [nav.ts](src/app/nav.ts) | [routes.test.ts](src/app/routes.test.ts) |
