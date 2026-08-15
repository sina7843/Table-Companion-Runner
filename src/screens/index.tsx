/**
 * Route skeletons for the Phase 1 screens not yet built, plus re-exports of the ones that
 * are, so `routes.tsx` keeps a single import.
 *
 * Each skeleton renders the real page chrome with the design system's loading skeleton
 * standing in for content. Nothing here renders a disabled future feature.
 */
import { Link } from 'react-router-dom';
import { Button, SectionHeader, Skeleton } from '../design-system';
import { DMPage } from '../app/DMShell';
import { PlayerPage } from '../app/PlayerShell';

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
