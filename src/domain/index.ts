/**
 * The domain layer's public surface.
 *
 * UI code imports from here. It gets generic domain types, the permission helpers, the
 * `Ruleset` interface and the registry — never a concrete ruleset adapter. The D&D 5e
 * implementation is reachable only through `requireRuleset()`, which is what keeps the
 * product game-system agnostic in practice. `domain.test.ts` enforces the boundary.
 */

export * from './types.ts';
export * from './permissions.ts';

export type {
  BuilderField,
  BuilderFieldKind,
  BuilderGrant,
  BuilderIssue,
  BuilderOption,
  BuilderScoreSlot,
  BuilderStep,
  BuilderStepForm,
  EncounterCreature,
  EncounterDifficulty,
  FacetDefinition,
  LevelUpChange,
  LevelUpOutcome,
  ReviewGroup,
  RollableEntry,
  SheetContent,
  SheetSection,
  ValueEntry,
  ConditionDefinition,
  DiceRequest,
  RandomSource,
  RollEvaluation,
  Ruleset,
  RulesetCapabilities,
} from './ruleset/Ruleset.ts';
export { findRuleset, listGameSystems, requireRuleset } from './ruleset/registry.ts';

export type { RollMode } from './types.ts';
export type {
  ActivityRepository,
  CreateCampaignInput,
  CreateDraftInput,
  DraftRepository,
  CampaignRepository,
  CharacterRepository,
  CombatRepository,
  EncounterRepository,
  GameSystemRepository,
  MonsterQuery,
  MonsterRepository,
  RecentsRepository,
  Repositories,
  RollRepository,
  UserRepository,
} from './data/repositories.ts';
export {
  createFixtureRepositories,
  type FixtureOptions,
  type FixtureScenario,
} from './data/fixtureRepositories.ts';
export {
  RepositoryProvider,
  useAsync,
  useChannelStatus,
  useDataSourceInfo,
  useRealtime,
  useRepositories,
  type AsyncState,
} from './data/RepositoryProvider.tsx';
export { SessionGate, SessionProvider, useSession, useUserId } from './data/SessionProvider.tsx';
export {
  onSessionExpired,
  reportSessionExpired,
  resetSessionExpiryListeners,
} from './data/sessionExpiry.ts';
export {
  noopSink,
  TelemetryProvider,
  useTelemetry,
  type TelemetryEvent,
  type TelemetrySink,
} from './telemetry.ts';

/* ── The seams TC-13 made explicit ──────────────────────────────────────────── */

export { createDataSource, type DataSource, type DataSourceKind } from './data/dataSource.ts';
export { createHttpRepositories } from './data/httpRepositories.ts';
export { API_ROUTES, ApiError, type ApiConfig, type ApiRoute } from './data/apiContract.ts';
export {
  createLocalChannel,
  createNullChannel,
  createEventStreamChannel,
  type ConnectionState,
  type DomainEvent,
  type DomainEventKind,
  type OutgoingEvent,
  type RealtimeChannel,
} from './data/realtime.ts';
export { withRealtime } from './data/withRealtime.ts';

/*
 * `CURRENT_USER_ID` is deliberately NOT exported. A screen that needs the signed-in user
 * calls `useUserId()`; reaching into the fixture file was the one hard coupling between the
 * UI and the demo data, and removing the export is what keeps it removed.
 */
