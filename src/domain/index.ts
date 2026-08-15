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
  ReviewGroup,
  ConditionDefinition,
  DiceRequest,
  RandomSource,
  RollEvaluation,
  Ruleset,
  RulesetCapabilities,
} from './ruleset/Ruleset.ts';
export { findRuleset, listGameSystems, requireRuleset } from './ruleset/registry.ts';

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
  useRepositories,
  type AsyncState,
} from './data/RepositoryProvider.tsx';
export { CURRENT_USER_ID } from './data/fixtures.ts';
