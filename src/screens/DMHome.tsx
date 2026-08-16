import { Link } from 'react-router-dom';
import {
  Alert,
  Avatar,
  AvatarGroup,
  Badge,
  Button,
  Chip,
  EmptyState,
  Icon,
  ListRow,
  SectionHeader,
  Skeleton,
  type IconName,
} from '../design-system';
import { DMPage } from '../app/DMShell';
import {
  useUserId,
  useAsync,
  useRepositories,
  type Campaign,
  type CampaignActivity,
  type CombatInstance,
  type EncounterTemplate,
  type EntityKind,
  type RecentItem,
} from '../domain';

/** One glyph per entity kind. Generic mapping — no system knows about these. */
const KIND_ICON: Record<EntityKind, IconName> = {
  campaign: 'users-three',
  character: 'identification-card',
  monster: 'skull',
  encounter: 'flag-banner',
  combat: 'broadcast',
  spell: 'magic-wand',
};

const ACTIVITY_BADGE: Record<
  CampaignActivity['kind'],
  { tone: 'success' | 'warning' | 'neutral'; label: string; icon: IconName }
> = {
  levelled: { tone: 'success', label: 'Levelled', icon: 'arrow-up' },
  'level-up-pending': { tone: 'warning', label: 'Pending', icon: 'warning' },
  'privacy-changed': { tone: 'neutral', label: 'Private', icon: 'lock-simple' },
  'character-edited': { tone: 'neutral', label: 'Edited', icon: 'pencil-simple' },
  'character-created': { tone: 'neutral', label: 'New', icon: 'plus' },
};

function timeOfDay(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * The live-combat band.
 *
 * The design allows exactly one loud element on this screen, and this is it — because it
 * is the only thing on the page that is time-critical. Round, turn, who is connected, and
 * a single action back into the fight.
 */
function LiveCombatBand({
  combat,
  campaign,
}: {
  combat: CombatInstance;
  campaign: Campaign | null;
}) {
  const players = combat.participants.filter((p) => p.entityType === 'player');
  const turnIndex = combat.participants.findIndex((p) => p.id === combat.activeParticipantId);

  return (
    <div
      style={{
        padding: 'var(--space-20) var(--space-24)',
        borderBottom: '1px solid var(--color-border-default)',
        background: 'var(--color-surface-primary)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-20)',
        flexWrap: 'wrap',
      }}
    >
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-6)',
        }}
      >
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)', flexWrap: 'wrap' }}
        >
          <Badge tone="success" icon="broadcast" solid>
            Live now
          </Badge>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-size-10)',
              letterSpacing: 'var(--tracking-caps)',
              textTransform: 'uppercase',
              color: 'var(--color-text-tertiary)',
            }}
          >
            Round {combat.round}
            {turnIndex >= 0 && ` · turn ${turnIndex + 1} of ${combat.participants.length}`}
            {` · ${players.length} of ${players.length} players connected`}
          </span>
        </div>

        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: '-.015em',
          }}
        >
          {combat.name}
        </span>

        <span style={{ fontSize: 'var(--font-size-13)', color: 'var(--color-text-secondary)' }}>
          {[
            campaign?.name,
            combat.location,
            combat.startedAt && `started ${timeOfDay(combat.startedAt)}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>

      <AvatarGroup label={`${players.length} of ${players.length} players connected`}>
        {players.map((player) => (
          <Avatar
            key={player.id}
            name={player.name}
            entity="player"
            status="var(--color-connection-live)"
          />
        ))}
      </AvatarGroup>

      {/* The single action the band exists for. */}
      <Button variant="primary" size="lg" icon="broadcast" as={Link} to={`/dm/combat/${combat.id}`}>
        Return to combat
      </Button>
    </div>
  );
}

/**
 * The DM's home.
 *
 * Deliberately free of analytics: no session counts, no XP graphs, no "campaign health".
 * Two columns of actual work — what is prepared for tonight, and what the party changed
 * since the DM last looked — then a row of recall chips. Structure comes from rules and
 * section heads; nothing here is a rounded floating card.
 */
export function DMHome() {
  const { campaigns, combats, encounters, activity, recents } = useRepositories();
  const userId = useUserId();

  const state = useAsync(async () => {
    // The session resolves through the data layer, so the read waits for it rather than
    // reaching into fixture data for an id.
    if (!userId) {
      return {
        campaigns: [],
        live: null,
        recall: [],
        changes: [],
        focus: null,
        prepared: [],
      };
    }

    const [mine, live, recall, changes] = await Promise.all([
      campaigns.listForUser(userId),
      combats.liveForUser(userId),
      recents.listForUser(userId),
      activity.listForUser(userId),
    ]);

    // Prepared encounters come from the campaign in play, or the most recent campaign.
    const focus = mine.find((campaign) => campaign.id === live?.campaignId) ?? mine[0] ?? null;
    const prepared = focus ? await encounters.listForCampaign(focus.id) : [];

    return { campaigns: mine, live, recall, changes, focus, prepared };
  }, ['dm-home', userId ?? '']);

  const actions = (
    <Button variant="primary" size="sm" icon="plus" as={Link} to="/campaigns/new">
      New campaign
    </Button>
  );

  if (state.status === 'loading') {
    return (
      <DMPage title="Home" actions={actions}>
        <div className="tc-page" aria-busy="true">
          <span className="tc-visually-hidden" role="status">
            Loading your campaigns
          </span>
          <Skeleton count={1} height={96} />
          <Skeleton count={5} height={44} gap={8} />
        </div>
      </DMPage>
    );
  }

  if (state.status === 'error') {
    return (
      <DMPage title="Home" actions={actions}>
        <div className="tc-page">
          <Alert
            tone="danger"
            icon="cloud-slash"
            title="Could not load your campaigns"
            actions={
              <Button size="sm" variant="secondary" onClick={state.reload}>
                Try again
              </Button>
            }
          >
            {state.error.message} Your campaigns and characters are safe.
          </Alert>
        </div>
      </DMPage>
    );
  }

  const { live, focus, prepared, recall, changes } = state.data;

  // First run: no campaigns at all. Name the thing, offer the action, nothing else.
  if (state.data.campaigns.length === 0) {
    return (
      <DMPage title="Home" actions={actions}>
        <div className="tc-page">
          <EmptyState
            icon="users-three"
            title="No campaigns yet"
            description="A campaign holds your party, your encounters and everything you run at the table. Choosing a game system takes about a minute."
            actions={
              <Button variant="primary" size="lg" icon="plus" as={Link} to="/campaigns/new">
                Create your first campaign
              </Button>
            }
          />
        </div>
      </DMPage>
    );
  }

  return (
    <DMPage title="Home" actions={actions}>
      {/* If nothing is live the band is absent rather than empty. */}
      {live && <LiveCombatBand combat={live} campaign={focus} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <div
          style={{
            padding: 'var(--space-16) var(--space-24)',
            borderRight: '1px solid var(--color-border-subtle)',
          }}
        >
          <SectionHeader
            sub
            title="Prepared for tonight"
            actions={
              <Button
                size="sm"
                variant="tertiary"
                iconRight="arrow-right"
                as={Link}
                to="/dm/encounters"
              >
                All encounters
              </Button>
            }
          />
          {prepared.length === 0 ? (
            <EmptyState
              icon="flag-banner"
              title="Nothing prepared"
              description="Build an encounter now and it will be one tap from the table tonight."
              actions={
                <Button size="sm" variant="secondary" icon="plus" as={Link} to="/dm/encounters/new">
                  New encounter
                </Button>
              }
            />
          ) : (
            prepared.map((encounter: EncounterTemplate) => (
              <ListRow
                key={encounter.id}
                as={Link}
                to={`/dm/encounters/${encounter.id}`}
                leading={<Icon name="flag-banner" />}
                title={encounter.name}
                meta={[
                  `${encounter.entries.reduce((sum, entry) => sum + entry.count, 0)} creatures`,
                  encounter.location,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                trailing={
                  <Badge tone="neutral" icon={encounter.lastRunAt ? 'check' : undefined}>
                    {encounter.lastRunAt ? 'Run before' : 'Prepared'}
                  </Badge>
                }
              />
            ))
          )}
        </div>

        <div style={{ padding: 'var(--space-16) var(--space-24)' }}>
          <SectionHeader sub title="Party changes since last session" />
          {changes.length === 0 ? (
            <EmptyState
              icon="check"
              title="Nothing to catch up on"
              description="Level-ups, privacy changes and character edits show up here before you sit down."
            />
          ) : (
            changes.map((entry: CampaignActivity) => {
              const badge = ACTIVITY_BADGE[entry.kind];
              return (
                <ListRow
                  key={entry.id}
                  leading={<Icon name={badge.icon} />}
                  title={entry.summary}
                  meta={entry.detail}
                  trailing={<Badge tone={badge.tone}>{badge.label}</Badge>}
                  onClick={() => undefined}
                />
              );
            })
          )}
        </div>
      </div>

      {recall.length > 0 && (
        <div
          style={{
            padding: 'var(--space-16) var(--space-24)',
            borderTop: '1px solid var(--color-border-subtle)',
          }}
        >
          <SectionHeader sub title="Recently opened" />
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-6)',
              flexWrap: 'wrap',
              marginTop: 'var(--space-10)',
            }}
          >
            {recall.map((item: RecentItem) => (
              <Chip key={item.id} icon={KIND_ICON[item.kind]} as={Link} to={item.href}>
                {item.label}
              </Chip>
            ))}
          </div>
        </div>
      )}
    </DMPage>
  );
}
