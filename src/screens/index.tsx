/**
 * Route skeletons for the Phase 1 screens.
 *
 * TC-02 builds the shell and the routing graph, not the screens themselves. Each entry
 * here renders the real page chrome — top bar, section headers, sub-navigation — with the
 * design system's loading skeleton standing in for content that arrives in TC-04 onward.
 *
 * Nothing here renders a disabled future feature. Every route below is a real Phase 1
 * destination; the ones that legitimately have nothing to show use `EmptyState` and say
 * so plainly. They live in one file on purpose — later prompts extract the screen they
 * own into its own module as it grows real content.
 */
import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Icon,
  ListRow,
  SectionHeader,
  Skeleton,
} from '../design-system';
import { requireRuleset, useAsync, useRepositories, type Monster } from '../domain';
import { DMPage } from '../app/DMShell';
import { PlayerPage } from '../app/PlayerShell';
import { useContextPanel, type PanelContent } from '../app/panelContext';

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

/* ── DM ─────────────────────────────────────────────────────────────────────── */

export function DMCombat() {
  return (
    <DMPage eyebrow="Session" title="Combat">
      <div className="tc-page">
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
      </div>
    </DMPage>
  );
}

export function DMEncounters() {
  return (
    <DMPage eyebrow="Session" title="Encounters">
      <div className="tc-page">
        <PendingSection title="Prepared encounters" />
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

/**
 * Renders whatever the ruleset says it derives for this creature.
 *
 * Note what is absent: this component knows nothing about armour class, speed or
 * initiative. It asks the registry for the adapter that owns the creature's system and
 * renders the labelled values it hands back. Swapping in a different system changes what
 * appears here without changing a line of this file.
 */
function MonsterPanelBody({ monster }: { monster: Monster }) {
  const derived = requireRuleset(monster.systemId).deriveMonster(monster);

  return (
    <div style={{ padding: 'var(--space-16)' }}>
      <SectionHeader sub title="Stat block" />
      <dl className="tc-deflist">
        {derived.map((value) => (
          <Fragment key={value.key}>
            <dt>{value.label}</dt>
            <dd>{value.value}</dd>
          </Fragment>
        ))}
      </dl>
      <div style={{ marginTop: 'var(--space-16)' }}>
        <SectionHeader sub title="Actions" />
        {monster.actions.map((action) => (
          <ListRow
            key={action.name}
            static
            title={action.name}
            meta={action.damage ?? action.description}
          />
        ))}
      </div>
    </div>
  );
}

/** Builds the panel payload for a monster, at module scope so no JSX sits in a handler. */
function monsterPanel(monster: Monster): PanelContent {
  return {
    eyebrow: 'Monster',
    title: monster.name,
    body: <MonsterPanelBody monster={monster} />,
  };
}

/**
 * Reads the monster library through the repository seam and opens each row in the shared
 * context panel. This is the screen that proves the TC-03 boundaries hold end to end:
 * generic UI, generic domain objects, ruleset behind the registry.
 */
export function DMMonsters() {
  const { show } = useContextPanel();
  const { monsters } = useRepositories();
  const state = useAsync(() => monsters.list(), ['monsters']);

  return (
    <DMPage eyebrow="Library" title="Monsters">
      <div className="tc-page">
        <section>
          <SectionHeader
            sub
            title="Monster library"
            actions={
              state.status === 'ready' ? <Badge tone="neutral">{state.data.length}</Badge> : null
            }
          />

          {state.status === 'loading' && <Skeleton count={5} height={44} gap={8} />}

          {state.status === 'error' && (
            <Alert tone="danger" title="Could not load the monster library">
              {state.error.message} Nothing has been lost — try again.
            </Alert>
          )}

          {state.status === 'ready' && state.data.length === 0 && (
            <EmptyState
              icon="skull"
              title="No monsters yet"
              description="Imported library content and your own homebrew both appear here."
            />
          )}

          {state.status === 'ready' &&
            state.data.map((monster) => (
              <ListRow
                key={monster.id}
                leading={<Icon name="skull" />}
                title={monster.name}
                meta={`${monster.challengeLabel} · ${monster.subtitle}`}
                trailing={
                  monster.origin === 'homebrew' ? <Badge tone="accent">Homebrew</Badge> : null
                }
                onClick={() => show(monsterPanel(monster))}
              />
            ))}
        </section>
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

export function PlayerSheet() {
  return (
    <PlayerPage title="Aria Nightfall">
      <div className="tc-page">
        <PendingSection title="Actions" rows={5} height={52} />
      </div>
    </PlayerPage>
  );
}

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
        <Button variant="tertiary" size="sm" icon="plus" as={Link} to="/play/builder">
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

export function PlayerBuilder() {
  return (
    <PlayerPage eyebrow="New character · step 1 of 10" title="Ruleset">
      <div className="tc-page">
        <PendingSection title="Choose a ruleset" rows={3} height={52} />
      </div>
    </PlayerPage>
  );
}
