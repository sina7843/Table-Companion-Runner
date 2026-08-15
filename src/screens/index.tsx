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
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Icon,
  ListRow,
  SectionHeader,
  Skeleton,
  Tabs,
} from '../design-system';
import { requireRuleset, useAsync, useRepositories, type Monster } from '../domain';
import { DMPage } from '../app/DMShell';
import { PlayerPage } from '../app/PlayerShell';
import { useContextPanel, type PanelContent } from '../app/panelContext';
import { campaignTabs } from '../app/nav';

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

/* ── DM ─────────────────────────────────────────────────────────────────────── */

export function DMHome() {
  return (
    <DMPage
      title="Home"
      actions={
        <Button variant="primary" size="sm" icon="plus" as={Link} to="/campaigns/new">
          New campaign
        </Button>
      }
    >
      <div className="tc-page">
        <PendingSection title="Prepared for tonight" />
        <PendingSection title="Party changes since last session" />
        <PendingSection title="Recently opened" rows={2} height={26} />
      </div>
    </DMPage>
  );
}

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

export function CampaignLayout() {
  const { campaignId = '' } = useParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const tabs = campaignTabs(campaignId);

  // Longest matching path wins, so /party does not also select the index tab, whose
  // path is a prefix of every other tab's.
  const current =
    tabs.reduce<(typeof tabs)[number] | undefined>(
      (best, tab) =>
        pathname.startsWith(tab.path) && tab.path.length > (best?.path.length ?? 0) ? tab : best,
      undefined,
    )?.id ?? 'overview';

  return (
    <DMPage
      eyebrow="Campaign · D&D 5e (2024)"
      title="Lost Mine of Phandelver"
      subbar={
        <Tabs
          label="Campaign sections"
          items={tabs.map(({ id, label }) => ({ id, label }))}
          value={current}
          onChange={(id) => {
            const tab = tabs.find((entry) => entry.id === id);
            if (tab) navigate(tab.path);
          }}
        />
      }
    >
      <Outlet />
    </DMPage>
  );
}

export function CampaignOverview() {
  return (
    <div className="tc-page">
      <PendingSection title="Party" />
      <PendingSection title="Prepared encounters" rows={4} />
      <PendingSection title="Recent combats" rows={3} />
    </div>
  );
}

export function CampaignParty() {
  return (
    <div className="tc-page">
      <PendingSection title="Party" rows={4} />
    </div>
  );
}

export function CampaignEncounters() {
  return (
    <div className="tc-page">
      <PendingSection title="Encounters" />
    </div>
  );
}

export function CampaignCombats() {
  return (
    <div className="tc-page">
      <PendingSection title="Recent combats" />
    </div>
  );
}

export function CampaignSettings() {
  return (
    <div className="tc-page">
      <PendingSection title="Campaign settings" rows={4} height={56} />
    </div>
  );
}

/* ── Player ─────────────────────────────────────────────────────────────────── */

export function PlayerHome() {
  return (
    <PlayerPage eyebrow="Marta" title="Home">
      <div className="tc-page">
        <PendingSection title="Your character" rows={3} height={52} />
      </div>
    </PlayerPage>
  );
}

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

/* ── Entry, outside both shells ─────────────────────────────────────────────── */

function EntryFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="tc-appsurface"
      data-density="comfortable"
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-32)',
      }}
    >
      <main
        id="main"
        style={{ width: 340, display: 'flex', flexDirection: 'column', gap: 'var(--space-16)' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="tc-sidebar__mark" style={{ fontSize: 19 }}>
            Table<span>·</span>Companion
          </span>
          <span style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>{title}</span>
        </div>
        {children}
      </main>
    </div>
  );
}

export function SignIn() {
  return (
    <EntryFrame title="The operating system for your tabletop campaign.">
      <Skeleton count={3} height={40} gap={16} />
      <Button variant="primary" block as={Link} to="/dm">
        Continue as DM
      </Button>
      <Button variant="secondary" block icon="link" as={Link} to="/play">
        Continue as Player
      </Button>
    </EntryFrame>
  );
}

export function JoinCampaign() {
  return (
    <EntryFrame title="Join with an invite code.">
      <Skeleton count={2} height={40} gap={16} />
      <Button variant="primary" block as={Link} to="/play">
        Join
      </Button>
    </EntryFrame>
  );
}

export function NewCampaign() {
  return (
    <EntryFrame title="New campaign · step 1 of 2">
      <Skeleton count={3} height={56} gap={12} />
      <Button variant="primary" block iconRight="arrow-right" as={Link} to="/dm">
        Name the campaign
      </Button>
    </EntryFrame>
  );
}

export function NotFound() {
  return (
    <EntryFrame title="That page does not exist.">
      <EmptyState
        icon="compass"
        title="Nothing here"
        description="The link may be stale, or the campaign may have been removed."
        actions={
          <Button variant="secondary" as={Link} to="/">
            Back to the start
          </Button>
        }
      />
    </EntryFrame>
  );
}
