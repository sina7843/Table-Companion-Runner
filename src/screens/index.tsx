/**
 * Route skeletons for the Phase 1 screens not yet built, plus re-exports of the ones that
 * are, so `routes.tsx` keeps a single import.
 *
 * Each skeleton renders the real page chrome with the design system's loading skeleton
 * standing in for content. Nothing here renders a disabled future feature.
 */
import { Link, useParams } from 'react-router-dom';
import { Button, EmptyState, SectionHeader, Skeleton } from '../design-system';
import { DMPage } from '../app/DMShell';
import { PlayerPage } from '../app/PlayerShell';
import { CURRENT_USER_ID, useAsync, useRepositories, type CombatInstanceId } from '../domain';

/** Section header plus skeleton rows — the shape the real content will take. */
function PendingSection({
  title,
  rows = 5,
  height = 44,
}: {
  title: string;
  rows?: number;
  height?: number;
}) {
  return (
    <section>
      <SectionHeader sub title={title} />
      <Skeleton count={rows} height={height} gap={8} />
    </section>
  );
}

/* ── Screens built against real data. Re-exported so routes.tsx stays one import. ── */

export { DMHome } from './DMHome';
export { PlayerHome } from './PlayerHome';
export { SignIn, JoinCampaign, NewCampaign, NotFound } from './entry';
export { BuilderScreen } from './builder/BuilderScreen';

/* ── DM ─────────────────────────────────────────────────────────────────────── */

/**
 * The combat runner is TC-11. Until then this route resolves the fight it was sent to and
 * states what is actually true of it — an encounter that has just been started must not
 * land the DM on a screen claiming no combat is running.
 */
export function DMCombat() {
  const { combatId } = useParams();
  const { combats } = useRepositories();

  const state = useAsync(async () => {
    if (combatId) return combats.byId(combatId as CombatInstanceId);
    return combats.liveForUser(CURRENT_USER_ID);
  }, ['dm-combat', combatId ?? '']);

  const combat = state.status === 'ready' ? state.data : null;

  return (
    <DMPage eyebrow={combat?.location ?? 'Session'} title={combat?.name ?? 'Combat'}>
      <div className="tc-page">
        {state.status === 'loading' && <Skeleton count={6} height={44} gap={8} />}

        {state.status === 'ready' && !combat && (
          <EmptyState
            icon="sword"
            title="No combat is running"
            description="Start one from a prepared encounter, and it will pin itself to the top of the sidebar until it ends."
            actions={
              <Button variant="primary" icon="flag-banner" as={Link} to="/dm/encounters">
                Open encounters
              </Button>
            }
          />
        )}

        {combat && (
          <PendingSection
            title={`${combat.participants.length} combatants · ${
              combat.status === 'preparing' ? 'rolling initiative' : `round ${combat.round}`
            }`}
            rows={Math.min(8, Math.max(1, combat.participants.length))}
            height={48}
          />
        )}
      </div>
    </DMPage>
  );
}

/**
 * The encounter builder's route, held open for TC-10.
 *
 * The library and the detail page both link here, so the path has to resolve. It renders
 * the chrome and the skeleton the builder will fill — the same treatment every route
 * skeleton in this file gets — rather than a disabled feature.
 */
export function EncounterBuilderPending() {
  return (
    <DMPage eyebrow="Encounter template" title="Untitled encounter">
      <div className="tc-page">
        <PendingSection title="Monsters" rows={4} height={48} />
        <PendingSection title="Party" rows={4} height={48} />
      </div>
    </DMPage>
  );
}

export function DMCharacters() {
  return (
    <DMPage eyebrow="Library" title="Characters">
      <div className="tc-page">
        <PendingSection title="All characters" />
      </div>
    </DMPage>
  );
}

export function DMSpells() {
  return (
    <DMPage eyebrow="Library" title="Spells">
      <div className="tc-page">
        <PendingSection title="Spell library" />
      </div>
    </DMPage>
  );
}

export function DMItems() {
  return (
    <DMPage eyebrow="Library" title="Items">
      <div className="tc-page">
        <PendingSection title="Item library" />
      </div>
    </DMPage>
  );
}

/* ── Campaign, with its sub-navigation ──────────────────────────────────────── */

export { CampaignLayout, CampaignList } from './campaign/CampaignLayout';
export {
  CampaignOverview,
  CampaignParty,
  CampaignEncounters,
  CampaignCombats,
  CampaignSettings,
} from './campaign/CampaignScreens';

/* ── Player ─────────────────────────────────────────────────────────────────── */

export function PlayerCombat() {
  return (
    <PlayerPage title="Combat">
      <div className="tc-page">
        <EmptyState
          icon="sword"
          title="No combat is running"
          description="When your DM starts a fight, it appears here and this tab carries a badge on your turn."
        />
      </div>
    </PlayerPage>
  );
}

export function PlayerDice() {
  return (
    <PlayerPage title="Dice">
      <div className="tc-page">
        <PendingSection title="Your rolls" rows={4} height={52} />
      </div>
    </PlayerPage>
  );
}

export function PlayerParty() {
  return (
    <PlayerPage title="Party">
      <div className="tc-page">
        <PendingSection title="Party" rows={4} height={52} />
      </div>
    </PlayerPage>
  );
}

export function PlayerCharacters() {
  return (
    <PlayerPage
      title="My characters"
      actions={
        <Button variant="tertiary" size="sm" icon="plus" as={Link} to="/builder">
          New
        </Button>
      }
    >
      <div className="tc-page">
        <PendingSection title="Characters" rows={4} height={52} />
      </div>
    </PlayerPage>
  );
}
