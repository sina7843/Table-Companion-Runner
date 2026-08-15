import { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Button,
  EmptyState,
  Icon,
  IconButton,
  ListRow,
  SectionHeader,
  Skeleton,
  Tabs,
} from '../../design-system';
import { DMPage } from '../../app/DMShell';
import { campaignTabs } from '../../app/nav';
import {
  CURRENT_USER_ID,
  useAsync,
  useRepositories,
  type CampaignId,
  type CombatInstance,
} from '../../domain';
import { CampaignListBody, InviteModal, type CampaignContext } from './CampaignScreens';

/**
 * Resolves the campaign once and hands it to every tab through the outlet context, so
 * five screens do not each fetch the same record.
 *
 * The tab strip is the campaign's sub-navigation: Overview, Party, Encounters, Recent
 * combats, Settings. Lore, NPCs, Locations, Quests and Notes insert between Party and
 * Encounters when Phase 2 arrives — nothing here needs redesigning for that, and no
 * disabled placeholder tab is shown today.
 */
export function CampaignLayout() {
  const { campaignId = '' } = useParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { campaigns, gameSystems } = useRepositories();
  const [inviteOpen, setInviteOpen] = useState(false);

  const tabs = campaignTabs(campaignId);
  // Longest matching path wins, so /party does not also select the index tab, whose path
  // is a prefix of every other tab's.
  const current =
    tabs.reduce<(typeof tabs)[number] | undefined>(
      (best, tab) =>
        pathname.startsWith(tab.path) && tab.path.length > (best?.path.length ?? 0) ? tab : best,
      undefined,
    )?.id ?? 'overview';

  const state = useAsync(async () => {
    const campaign = await campaigns.byId(campaignId as CampaignId);
    if (!campaign) return { campaign: null, systemName: '' };
    const systems = await gameSystems.list();
    return {
      campaign,
      systemName: systems.find((system) => system.id === campaign.systemId)?.name ?? '',
    };
  }, ['campaign', campaignId]);

  if (state.status === 'loading') {
    return (
      <DMPage title="Campaign">
        <div className="tc-page" aria-busy="true">
          <span className="tc-visually-hidden" role="status">
            Loading the campaign
          </span>
          <Skeleton count={6} height={40} gap={8} />
        </div>
      </DMPage>
    );
  }

  if (state.status === 'error') {
    return (
      <DMPage title="Campaign">
        <div className="tc-page">
          <Alert
            tone="danger"
            icon="cloud-slash"
            title="Could not load this campaign"
            actions={
              <Button size="sm" variant="secondary" onClick={state.reload}>
                Try again
              </Button>
            }
          >
            {state.error.message}
          </Alert>
        </div>
      </DMPage>
    );
  }

  const { campaign, systemName } = state.data;

  if (!campaign) {
    return (
      <DMPage title="Campaign">
        <div className="tc-page">
          <EmptyState
            icon="compass"
            title="That campaign does not exist"
            description="It may have been removed, or the link may be stale."
            actions={
              <Button variant="secondary" as={Link} to="/dm/campaigns">
                All campaigns
              </Button>
            }
          />
        </div>
      </DMPage>
    );
  }

  const context: CampaignContext = {
    campaign,
    viewerUserId: CURRENT_USER_ID,
    reload: state.reload,
  };

  return (
    <>
      <DMPage
        eyebrow={systemName ? `Campaign · ${systemName}` : 'Campaign'}
        title={campaign.name}
        actions={
          <>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-size-11)',
                color: 'var(--color-text-tertiary)',
                letterSpacing: '.04em',
                whiteSpace: 'nowrap',
              }}
            >
              INVITE · {campaign.inviteCode}
            </span>
            <IconButton
              icon="copy"
              label="Copy invite code"
              size="sm"
              onClick={() => setInviteOpen(true)}
            />
            <Button
              size="sm"
              variant="tertiary"
              icon="gear"
              as={Link}
              to={`${tabs[4]?.path ?? ''}`}
            >
              Settings
            </Button>
          </>
        }
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
        <Outlet context={context} />
      </DMPage>

      <InviteModal campaign={campaign} open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </>
  );
}

/**
 * Every campaign the DM runs. Not a design screen — the design reaches campaigns from the
 * sidebar group — but the prompt calls for a list, so it is rows in the same language as
 * every other roster rather than a new card pattern.
 */
export function CampaignList() {
  const { campaigns, combats } = useRepositories();

  const state = useAsync(async () => {
    const mine = await campaigns.listForUser(CURRENT_USER_ID);
    const live = await Promise.all(mine.map((campaign) => combats.liveForCampaign(campaign.id)));
    const liveByCampaign = new Map<CampaignId, CombatInstance>();
    live.forEach((combat, index) => {
      const campaign = mine[index];
      if (combat && campaign) liveByCampaign.set(campaign.id, combat);
    });
    return { mine, liveByCampaign };
  }, ['campaign-list']);

  const actions = (
    <Button variant="primary" size="sm" icon="plus" as={Link} to="/campaigns/new">
      New campaign
    </Button>
  );

  return (
    <DMPage eyebrow="Campaigns" title="All campaigns" actions={actions}>
      <div className="tc-page">
        <section>
          <SectionHeader sub title="Your campaigns" />

          {state.status === 'loading' && <Skeleton count={3} height={44} gap={8} />}

          {state.status === 'error' && (
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
              {state.error.message}
            </Alert>
          )}

          {state.status === 'ready' && state.data.mine.length === 0 && (
            <EmptyState
              icon="users-three"
              title="No campaigns yet"
              description="A campaign holds your party, your encounters and everything you run at the table."
              actions={
                <Button variant="primary" icon="plus" as={Link} to="/campaigns/new">
                  Create your first campaign
                </Button>
              }
            />
          )}

          {state.status === 'ready' && state.data.mine.length > 0 && (
            <CampaignListBody
              campaigns={state.data.mine}
              liveByCampaign={state.data.liveByCampaign}
            />
          )}
        </section>

        {/* Characters outlive campaigns, so this is a genuine second entry point. */}
        <section>
          <SectionHeader sub title="Characters without a campaign" />
          <ListRow
            static
            leading={<Icon name="identification-card" />}
            title="Attach a character"
            meta="A character exists independently of any campaign. Open a campaign's Party tab to link one."
          />
        </section>
      </div>
    </DMPage>
  );
}
