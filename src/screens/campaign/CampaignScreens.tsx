/**
 * The campaign screens: overview, party, encounters, recent combats, settings.
 *
 * The design's framing for the overview is five questions and five answers — what
 * campaign is this, who is in the party, is combat running, what is prepared, what
 * happened recently. Nothing else is on the page.
 */
import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  EmptyState,
  Icon,
  IconButton,
  ListRow,
  Modal,
  SectionHeader,
  Skeleton,
  Table,
} from '../../design-system';
import { useContextPanel } from '../../app/panelContext';
import {
  id,
  useAsync,
  useRepositories,
  viewerFor,
  type Campaign,
  type CampaignId,
  type Character,
  type CombatInstance,
  type EncounterTemplate,
  type User,
} from '../../domain';
import {
  buildPartyRows,
  characterPanel,
  combatSummary,
  partyColumns,
  relativeTime,
  type PartyRow,
} from './shared';

/** What `CampaignLayout` resolves once and every tab reads. */
export interface CampaignContext {
  campaign: Campaign;
  /** Null when signed out, which every permission rule reads as "not the DM". */
  viewerUserId: User['id'] | null;
  reload: () => void;
}

export function useCampaign(): CampaignContext {
  return useOutletContext<CampaignContext>();
}

/** Wide tables scroll inside their own container rather than the page. */
function TableScroll({ children }: { children: React.ReactNode }) {
  return <div style={{ overflowX: 'auto', maxWidth: '100%' }}>{children}</div>;
}

function encounterMeta(encounter: EncounterTemplate): string {
  const creatures = encounter.entries.reduce((sum, entry) => sum + entry.count, 0);
  // Difficulty is deliberately absent: it is rated against the party, and this tab has
  // not loaded one. The encounter screens state it where the party is known.
  return [`${creatures} creatures`, encounter.location].filter(Boolean).join(' · ');
}

/* ── Party table, shared by the overview column and the Party tab ───────────── */

/** Exported because the DM's cross-campaign Characters list is the same table, per campaign. */
export function PartyTable({
  campaign,
  viewerUserId,
  characters,
  users,
  showPrivacy,
}: {
  campaign: Campaign;
  viewerUserId: User['id'] | null;
  characters: Character[];
  users: User[];
  showPrivacy?: boolean;
}) {
  const { show } = useContextPanel();
  // Signed out resolves to a player, which is the safe end of every permission rule.
  const viewer = viewerFor(campaign, viewerUserId ?? id<'User'>('anonymous'));
  const rows = buildPartyRows(characters, campaign, users);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon="users-three"
        title="No characters yet"
        description="Send the invite code to your players, or attach a character you already have."
      />
    );
  }

  return (
    <TableScroll>
      <Table
        label="Party"
        columns={partyColumns({
          showPrivacy,
          onOpen: (row: PartyRow) => show(characterPanel(row, viewer)),
        })}
        rows={rows}
        rowKey={(row) => row.character.id}
        onRowClick={(row) => show(characterPanel(row, viewer))}
      />
    </TableScroll>
  );
}

/* ── Overview ───────────────────────────────────────────────────────────────── */

export function CampaignOverview() {
  const { campaign, viewerUserId } = useCampaign();
  const { characters, encounters, combats, users } = useRepositories();

  const state = useAsync(async () => {
    const [party, prepared, fought, live] = await Promise.all([
      characters.listForCampaign(campaign.id),
      encounters.listForCampaign(campaign.id),
      combats.listForCampaign(campaign.id),
      combats.liveForCampaign(campaign.id),
    ]);
    const members = await users.byIds(campaign.members.map((member) => member.userId));
    return { party, prepared, fought, live, members };
  }, ['campaign-overview', campaign.id]);

  if (state.status === 'loading') {
    return (
      <div className="tc-page" aria-busy="true">
        <span className="tc-visually-hidden" role="status">
          Loading the campaign
        </span>
        <Skeleton count={6} height={40} gap={8} />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
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
    );
  }

  const { party, prepared, fought, live, members } = state.data;
  const partyLevel = party.length > 0 ? Math.max(...party.map((entry) => entry.level)) : null;

  return (
    <>
      {/* Is combat running? The banner answers it before anything else on the page. */}
      {live && (
        <div className="tc-banner tc-banner--info">
          <Icon name="broadcast" />
          <span>
            {live.name} is live — round {live.round}.
          </span>
          <span className="tc-banner__spacer" />
          <Button
            size="sm"
            variant="primary"
            icon="broadcast"
            as={Link}
            to={`/dm/combat/${live.id}`}
          >
            Return to combat
          </Button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
        <div style={{ borderRight: '1px solid var(--color-border-subtle)' }}>
          <div style={{ padding: 'var(--space-16) var(--space-20)' }}>
            <SectionHeader
              sub
              title="Party"
              eyebrow={
                party.length > 0
                  ? `${party.length} characters${partyLevel ? ` · level ${partyLevel}` : ''}`
                  : undefined
              }
              actions={
                <Button size="sm" variant="tertiary" iconRight="arrow-right" as={Link} to="party">
                  Party
                </Button>
              }
            />
            <PartyTable
              campaign={campaign}
              viewerUserId={viewerUserId}
              characters={party}
              users={members}
            />
          </div>

          <div
            style={{
              padding: 'var(--space-16) var(--space-20)',
              borderTop: '1px solid var(--color-border-subtle)',
            }}
          >
            <SectionHeader
              sub
              title="Recent combats"
              actions={
                <Button size="sm" variant="tertiary" iconRight="arrow-right" as={Link} to="combats">
                  All {fought.length}
                </Button>
              }
            />
            <RecentCombatsList combats={fought.slice(0, 3)} />
          </div>
        </div>

        <div>
          <div style={{ padding: 'var(--space-16) var(--space-20)' }}>
            <SectionHeader
              sub
              title="Prepared encounters"
              actions={
                <Button size="sm" variant="secondary" icon="plus" as={Link} to="/dm/encounters">
                  New
                </Button>
              }
            />
            {prepared.length === 0 ? (
              <EmptyState
                icon="flag-banner"
                title="Nothing prepared"
                description="An encounter built now is one tap from the table tonight."
              />
            ) : (
              prepared.map((encounter) => (
                <ListRow
                  key={encounter.id}
                  leading={<Icon name="flag-banner" />}
                  title={encounter.name}
                  meta={encounterMeta(encounter)}
                  trailing={
                    <Button size="sm" variant="secondary" icon="sword">
                      Start combat
                    </Button>
                  }
                  onClick={() => undefined}
                />
              ))
            )}
          </div>

          <div
            style={{
              padding: 'var(--space-16) var(--space-20)',
              borderTop: '1px solid var(--color-border-subtle)',
            }}
          >
            <SectionHeader sub title="Players" />
            {campaign.members.map((member) => {
              const user = members.find((entry) => entry.id === member.userId);
              const character = party.find((entry) => entry.id === member.characterId);
              return (
                <ListRow
                  key={member.userId}
                  static
                  leading={
                    <Avatar
                      name={user?.displayName ?? '?'}
                      entity={member.role === 'dm' ? 'npc' : 'player'}
                    />
                  }
                  title={user?.displayName ?? 'Unknown'}
                  meta={
                    member.role === 'dm'
                      ? 'Dungeon master'
                      : (character?.name ?? 'No character attached yet')
                  }
                  trailing={
                    member.role === 'dm' ? (
                      <Badge tone="accent">DM</Badge>
                    ) : character ? undefined : (
                      // Per-member presence is not something this product knows. It used to
                      // draw "Live" against every player, which was a fixture-era assumption
                      // that stayed true only because nothing could contradict it — the
                      // realtime hub tracks connections, not who is at the table. What is
                      // real about a member is whether they have a character yet, so that is
                      // what the row says.
                      <Badge tone="neutral">No character</Badge>
                    )
                  }
                />
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Party tab ──────────────────────────────────────────────────────────────── */

/**
 * The same table at full width, plus per-character privacy state and the two ways a
 * character joins: an invite for someone else's, or attaching one of your own.
 *
 * A character exists independently of any campaign, so attaching is a link rather than a
 * move — the requirement is that a player brings a character they already have.
 */
export function CampaignParty() {
  const { campaign, viewerUserId } = useCampaign();
  const { characters, users } = useRepositories();
  const [attachOpen, setAttachOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [attaching, setAttaching] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const state = useAsync(async () => {
    const [party, unattached] = await Promise.all([
      characters.listForCampaign(campaign.id),
      // Signed out has no characters of its own to attach, so the list is simply empty.
      viewerUserId ? characters.listUnattached(viewerUserId) : Promise.resolve([]),
    ]);
    const members = await users.byIds(campaign.members.map((member) => member.userId));
    return { party, unattached, members };
  }, ['campaign-party', campaign.id, viewerUserId ?? '']);

  async function attach(character: Character) {
    setAttaching(character.id);
    setFailure(null);
    try {
      await characters.attachToCampaign(character.id, campaign.id);
      setAttachOpen(false);
      state.reload();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'That character could not be attached.');
    } finally {
      setAttaching(null);
    }
  }

  if (state.status === 'loading') {
    return (
      <div className="tc-page" aria-busy="true">
        <span className="tc-visually-hidden" role="status">
          Loading the party
        </span>
        <Skeleton count={5} height={40} gap={8} />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="tc-page">
        <Alert
          tone="danger"
          icon="cloud-slash"
          title="Could not load the party"
          actions={
            <Button size="sm" variant="secondary" onClick={state.reload}>
              Try again
            </Button>
          }
        >
          {state.error.message}
        </Alert>
      </div>
    );
  }

  const { party, unattached, members } = state.data;

  return (
    <div className="tc-page">
      {failure && (
        <Alert tone="danger" title="Could not attach that character">
          {failure}
        </Alert>
      )}

      <section>
        <SectionHeader
          sub
          title="Party"
          eyebrow={`${party.length} characters`}
          actions={
            <>
              <Button size="sm" variant="tertiary" icon="link" onClick={() => setInviteOpen(true)}>
                Invite a player
              </Button>
              <Button size="sm" variant="secondary" icon="plus" onClick={() => setAttachOpen(true)}>
                Attach a character
              </Button>
            </>
          }
        />

        <PartyTable
          campaign={campaign}
          viewerUserId={viewerUserId}
          characters={party}
          users={members}
          showPrivacy
        />

        {/* The invite row the design adds to this table. */}
        <ListRow
          static
          leading={<Icon name="user-plus" />}
          title="Invite a player"
          meta={`Share the code ${campaign.inviteCode} — joining does not require a character.`}
          trailing={
            <Button size="sm" variant="secondary" icon="link" onClick={() => setInviteOpen(true)}>
              Show invite
            </Button>
          }
        />
      </section>

      <InviteModal campaign={campaign} open={inviteOpen} onClose={() => setInviteOpen(false)} />

      <Modal
        open={attachOpen}
        onClose={() => setAttachOpen(false)}
        title="Attach a character"
        description="A character exists independently of any campaign. Attaching links it here without moving it."
        footer={
          <>
            <Button variant="tertiary" onClick={() => setAttachOpen(false)}>
              Cancel
            </Button>
            <Button variant="secondary" icon="plus" as={Link} to="/builder">
              Create a new character
            </Button>
          </>
        }
      >
        {unattached.length === 0 ? (
          <EmptyState
            icon="identification-card"
            title="No unattached characters"
            description="Every character you own is already in a campaign. Create a new one to bring it here."
          />
        ) : (
          unattached.map((character) => (
            <ListRow
              key={character.id}
              leading={<Avatar name={character.name} entity="player" />}
              title={character.name}
              meta={character.subtitle}
              trailing={
                <Button
                  size="sm"
                  variant="secondary"
                  loading={attaching === character.id}
                  onClick={() => void attach(character)}
                >
                  Attach
                </Button>
              }
            />
          ))
        )}
      </Modal>
    </div>
  );
}

/* ── Invite ─────────────────────────────────────────────────────────────────── */

export function InviteModal({
  campaign,
  open,
  onClose,
}: {
  campaign: Campaign;
  open: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(campaign.inviteCode);
      setCopied(true);
    } catch {
      // Clipboard access can be refused; the code is on screen either way, which is why
      // it is shown as text rather than hidden behind the button.
      setCopied(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invite a player"
      description="Players join with this code. They do not need a character first."
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)' }}>
          <span
            className="tc-input tc-input--mono"
            data-readonly="true"
            style={{ flex: 1, letterSpacing: '.04em' }}
          >
            {campaign.inviteCode}
          </span>
          <Button variant="secondary" icon={copied ? 'check' : 'copy'} onClick={() => void copy()}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <p style={{ fontSize: 'var(--font-size-13)', color: 'var(--color-text-secondary)' }}>
          Anyone with this code can join {campaign.name}. Regenerate it from Settings if it reaches
          someone it should not have.
        </p>
      </div>
    </Modal>
  );
}

/* ── Encounters, recent combats, settings ───────────────────────────────────── */

export function CampaignEncounters() {
  const { campaign } = useCampaign();
  const { encounters } = useRepositories();
  const state = useAsync(
    () => encounters.listForCampaign(campaign.id),
    ['campaign-encounters', campaign.id],
  );

  return (
    <div className="tc-page">
      <section>
        <SectionHeader sub title="Prepared encounters" />

        {state.status === 'loading' && <Skeleton count={4} height={44} gap={8} />}

        {state.status === 'error' && (
          <Alert
            tone="danger"
            title="Could not load encounters"
            actions={
              <Button size="sm" variant="secondary" onClick={state.reload}>
                Try again
              </Button>
            }
          >
            {state.error.message}
          </Alert>
        )}

        {state.status === 'ready' && state.data.length === 0 && (
          <EmptyState
            icon="flag-banner"
            title="No encounters yet"
            description="An encounter is a reusable template. Starting it creates a separate combat, so you can run the same fight twice."
            actions={
              <Button variant="primary" icon="plus" as={Link} to="/dm/encounters/new">
                Build an encounter
              </Button>
            }
          />
        )}

        {state.status === 'ready' &&
          state.data.map((encounter) => (
            <ListRow
              key={encounter.id}
              as={Link}
              to={`/dm/encounters/${encounter.id}`}
              leading={<Icon name="flag-banner" />}
              title={encounter.name}
              meta={encounterMeta(encounter)}
              trailing={
                <Badge tone="neutral" icon={encounter.lastRunAt ? 'check' : undefined}>
                  {encounter.lastRunAt ? 'Run before' : 'Prepared'}
                </Badge>
              }
            />
          ))}
      </section>
    </div>
  );
}

function RecentCombatsList({ combats }: { combats: CombatInstance[] }) {
  if (combats.length === 0) {
    return (
      <EmptyState
        icon="sword"
        title="No combats yet"
        description="Every fight you run is kept here with its log."
      />
    );
  }

  return (
    <>
      {combats.map((combat) => (
        <ListRow
          key={combat.id}
          leading={<Icon name={combat.status === 'live' ? 'broadcast' : 'sword'} />}
          title={combat.name}
          meta={combatSummary(combat)}
          trailing={
            combat.status === 'live' ? (
              <Badge tone="success" solid>
                Live
              </Badge>
            ) : (
              <Button size="sm" variant="tertiary">
                Log
              </Button>
            )
          }
          onClick={() => undefined}
        />
      ))}
    </>
  );
}

export function CampaignCombats() {
  const { campaign } = useCampaign();
  const { combats } = useRepositories();
  const state = useAsync(
    () => combats.listForCampaign(campaign.id),
    ['campaign-combats', campaign.id],
  );

  return (
    <div className="tc-page">
      <section>
        <SectionHeader sub title="Recent combats" />

        {state.status === 'loading' && <Skeleton count={4} height={44} gap={8} />}

        {state.status === 'error' && (
          <Alert
            tone="danger"
            title="Could not load combats"
            actions={
              <Button size="sm" variant="secondary" onClick={state.reload}>
                Try again
              </Button>
            }
          >
            {state.error.message}
          </Alert>
        )}

        {state.status === 'ready' && (
          <RecentCombatsList
            combats={state.data.toSorted((a, b) =>
              (b.startedAt ?? '').localeCompare(a.startedAt ?? ''),
            )}
          />
        )}
      </section>
    </div>
  );
}

/**
 * Settings shell. What Phase 1 genuinely owns — identity, the ruleset, the invite and the
 * one DM — with nothing invented around it.
 */
export function CampaignSettings() {
  const { campaign } = useCampaign();
  const { gameSystems, users } = useRepositories();
  const [inviteOpen, setInviteOpen] = useState(false);

  const state = useAsync(async () => {
    const [systems, dm] = await Promise.all([gameSystems.list(), users.byId(campaign.dmUserId)]);
    return { system: systems.find((entry) => entry.id === campaign.systemId) ?? null, dm };
  }, ['campaign-settings', campaign.id]);

  return (
    <div className="tc-page">
      <section>
        <SectionHeader sub title="Campaign" />
        <dl className="tc-deflist">
          <dt>Name</dt>
          <dd>{campaign.name}</dd>
          <dt>Game system</dt>
          <dd>
            {state.status === 'ready' ? (state.data.system?.name ?? campaign.systemId) : 'Loading…'}
          </dd>
          <dt>Created</dt>
          <dd>{relativeTime(campaign.createdAt)}</dd>
        </dl>
      </section>

      <section>
        <SectionHeader
          sub
          title="Invite"
          actions={
            <Button size="sm" variant="secondary" icon="link" onClick={() => setInviteOpen(true)}>
              Show invite
            </Button>
          }
        />
        <ListRow
          static
          leading={<Icon name="link" />}
          title={campaign.inviteCode}
          meta="Anyone with this code can join. Joining does not require a character."
        />
      </section>

      <section>
        <SectionHeader sub title="Dungeon master" />
        <ListRow
          static
          leading={<Avatar name={state.data?.dm?.displayName ?? '?'} entity="npc" />}
          title={state.data?.dm?.displayName ?? 'Loading…'}
          // Phase 1 is one DM per campaign; co-DM is a later phase, and the design's rule
          // is that a future feature is absent rather than shown disabled.
          meta="One dungeon master per campaign"
          trailing={<Badge tone="accent">DM</Badge>}
        />
      </section>

      <InviteModal campaign={campaign} open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </div>
  );
}

/* ── Campaign list ──────────────────────────────────────────────────────────── */

export function CampaignListBody({
  campaigns,
  liveByCampaign,
}: {
  campaigns: Campaign[];
  liveByCampaign: Map<CampaignId, CombatInstance>;
}) {
  return (
    <>
      {campaigns.map((campaign) => {
        const live = liveByCampaign.get(campaign.id);
        return (
          <ListRow
            key={campaign.id}
            leading={<Icon name="users-three" />}
            title={campaign.name}
            meta={[
              `${campaign.members.length} members`,
              live ? `${live.name} is live` : `created ${relativeTime(campaign.createdAt)}`,
            ].join(' · ')}
            trailing={
              live ? (
                <Badge tone="success" icon="broadcast" solid>
                  Live
                </Badge>
              ) : (
                <IconButton icon="arrow-right" label={`Open ${campaign.name}`} size="sm" />
              )
            }
            as={Link}
            to={`/dm/campaigns/${campaign.id}`}
          />
        );
      })}
    </>
  );
}
