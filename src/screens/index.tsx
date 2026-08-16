/**
 * The routed screens that live nowhere more specific, plus re-exports of the ones that do,
 * so `routes.tsx` keeps a single import.
 *
 * Nothing here renders a placeholder. A route that shows a skeleton forever is a screen
 * that lies about loading, so a Phase 1 destination either reads real data or does not
 * exist — see DECISIONS.md for the two that were removed rather than faked.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  ConditionChip,
  DiceButton,
  EmptyState,
  HPBar,
  ListRow,
  SectionHeader,
  SegmentedControl,
  Skeleton,
  Stat,
  type ConditionTone,
} from '../design-system';
import { DMPage } from '../app/DMShell';
import { PlayerPage } from '../app/PlayerShell';
import { RollReadout, useRoller } from '../app/useRoller';
import {
  listGameSystems,
  requireRuleset,
  useAsync,
  useRepositories,
  type Campaign,
  type Character,
  type GameSystemId,
  type RollMode,
  type User,
} from '../domain';
import { PartyTable } from './campaign/CampaignScreens';

/** Loading and failure, written once — five small screens do not need five copies. */
function ScreenState({
  state,
  what,
}: {
  state: { status: 'loading' } | { status: 'error'; error: Error; reload: () => void };
  what: string;
}) {
  if (state.status === 'loading') {
    return (
      <div className="tc-page" aria-busy="true">
        <span className="tc-visually-hidden" role="status">
          Loading {what}
        </span>
        <Skeleton count={5} height={44} gap={8} />
      </div>
    );
  }
  return (
    <div className="tc-page">
      <Alert
        tone="danger"
        icon="cloud-slash"
        title={`Could not load ${what}`}
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

/* ── Screens built against real data. Re-exported so routes.tsx stays one import. ── */

export { DMHome } from './DMHome';
export { PlayerHome } from './PlayerHome';
export { SignIn, JoinCampaign, NewCampaign, NotFound } from './entry';
export { BuilderScreen } from './builder/BuilderScreen';

/* ── DM ─────────────────────────────────────────────────────────────────────── */

/**
 * Every player character the DM is responsible for, grouped by the campaign it belongs to.
 *
 * Grouped rather than flattened because "which fight is this character in" is the question
 * the DM actually has, and it reuses the party table the campaign tab already owns — one
 * table definition, so a column added there appears here too.
 */
export function DMCharacters() {
  const { users, campaigns, characters } = useRepositories();

  const state = useAsync(async () => {
    const user = await users.current();
    const mine = await campaigns.listForUser(user.id);
    const groups = await Promise.all(
      mine.map(async (campaign) => ({
        campaign,
        roster: await characters.listForCampaign(campaign.id),
        members: await users.byIds(campaign.members.map((member) => member.userId)),
      })),
    );
    return { user, groups };
  }, ['dm-characters']);

  if (state.status !== 'ready') {
    return (
      <DMPage eyebrow="Library" title="Characters">
        <ScreenState state={state} what="the characters" />
      </DMPage>
    );
  }

  const { user, groups } = state.data;
  const total = groups.reduce((count, group) => count + group.roster.length, 0);

  return (
    <DMPage eyebrow="Library" title="Characters">
      <div className="tc-page">
        {groups.length === 0 ? (
          <EmptyState
            icon="identification-card"
            title="No campaigns yet"
            description="Characters arrive with the players who join a campaign. Create one and share its invite code."
            actions={
              <Button variant="primary" icon="plus" as={Link} to="/campaigns/new">
                New campaign
              </Button>
            }
          />
        ) : (
          groups.map(({ campaign, roster, members }) => (
            <section key={campaign.id}>
              <SectionHeader
                sub
                title={campaign.name}
                eyebrow={`${roster.length} ${roster.length === 1 ? 'character' : 'characters'}`}
                actions={
                  <Button
                    size="sm"
                    variant="tertiary"
                    icon="arrow-square-out"
                    as={Link}
                    to={`/dm/campaigns/${campaign.id}/party`}
                  >
                    Open party
                  </Button>
                }
              />
              <PartyTable
                campaign={campaign}
                viewerUserId={user.id}
                characters={roster}
                users={members}
              />
            </section>
          ))
        )}

        {groups.length > 0 && total === 0 && (
          <Alert tone="info" icon="users-three" title="No characters yet">
            Your campaigns have no characters attached. Players bring their own — share an invite
            code from the campaign's Party tab.
          </Alert>
        )}
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

/** The dice a table reaches for, in the order a die box is laid out. */
const DICE = ['1d20', '1d12', '1d10', '1d8', '1d6', '1d4', '1d100'];

/**
 * A plain die box.
 *
 * Rolls here are not attached to a fight: they are the "roll me a d6" a player is asked for
 * between turns. Anything that belongs to combat — an attack, a save, a death save — is
 * rolled from the combat screen, where it reaches the log and the DM.
 */
export function PlayerDice() {
  const { users, characters } = useRepositories();
  const [mode, setMode] = useState<RollMode>('normal');

  const state = useAsync(async () => {
    const user = await users.current();
    const owned = await characters.listForOwner(user.id);
    // The die box belongs to whatever system the player is actually playing; with no
    // character yet, the first registered system is the only honest answer.
    return { systemId: owned[0]?.systemId ?? (listGameSystems()[0]?.id as GameSystemId) };
  }, ['player-dice']);

  // The hook cannot be called conditionally, so the system resolves to a placeholder while
  // loading and the tray below simply is not rendered until it is real.
  const systemId = state.status === 'ready' ? state.data.systemId : undefined;
  const roller = useRoller(systemId ?? (listGameSystems()[0]?.id as GameSystemId));

  if (state.status !== 'ready') {
    return (
      <PlayerPage title="Dice">
        <ScreenState state={state} what="the dice" />
      </PlayerPage>
    );
  }

  const ruleset = requireRuleset(state.data.systemId);

  return (
    <PlayerPage title="Dice">
      <div className="tc-page">
        {ruleset.capabilities.advantage && (
          <SegmentedControl
            label="Roll mode"
            value={mode}
            onChange={(next) => setMode(next as RollMode)}
            full
            items={[
              { id: 'normal', label: 'Normal' },
              { id: 'advantage', label: 'Advantage' },
              { id: 'disadvantage', label: 'Disadvantage' },
            ]}
          />
        )}

        <RollReadout roller={roller} />

        <section>
          <SectionHeader sub title="Dice" />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))',
              gap: 'var(--space-8)',
            }}
          >
            {DICE.map((expression) => (
              <DiceButton
                key={expression}
                expression={expression}
                advantage={
                  // Advantage is a d20 mechanic; applying it to a damage die would be a lie.
                  expression === '1d20' && mode !== 'normal'
                    ? (mode as 'advantage' | 'disadvantage')
                    : undefined
                }
                onClick={() =>
                  roller.roll(expression, expression, expression === '1d20' ? mode : 'normal')
                }
              />
            ))}
          </div>
        </section>
      </div>
    </PlayerPage>
  );
}

/** One party member, at the density a phone can read at arm's length. */
function PartyMember({
  character,
  playerName,
  campaign,
}: {
  character: Character;
  playerName: string;
  campaign: Campaign | null;
}) {
  const armourClass = requireRuleset(character.systemId)
    .deriveCharacter(character)
    .find((value) => value.key === 'ac');

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-8)',
        padding: 'var(--space-12) 0',
        borderBottom: '1px solid var(--color-border-subtle)',
      }}
    >
      <ListRow
        as={Link}
        to={`/play/sheet/${character.id}`}
        leading={<Avatar name={character.name} entity="player" />}
        title={character.name}
        meta={[playerName, character.subtitle, campaign?.name].filter(Boolean).join(' · ')}
        trailing={armourClass ? <Stat label="AC" value={armourClass.value} /> : undefined}
      />
      {/* Health and conditions are shared with the party in every privacy model the
          design defines, so they need no visibility check — an inventory would. */}
      <HPBar
        current={character.health.current}
        max={character.health.max}
        temp={character.health.temporary}
        showUnit
      />
      {character.conditions.length > 0 && (
        <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
          {character.conditions.map((condition) => (
            <ConditionChip
              key={condition.id}
              label={condition.label}
              tone={condition.tone as ConditionTone}
              duration={condition.duration}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The party, from the player's side.
 *
 * Only what the design marks as always shared: who is here, how hurt they are, what is on
 * them. Sheets stay one tap away and enforce their own privacy there.
 */
export function PlayerParty() {
  const { users, characters, campaigns } = useRepositories();

  const state = useAsync(async () => {
    const user = await users.current();
    const [owned, mine] = await Promise.all([
      characters.listForOwner(user.id),
      campaigns.listForUser(user.id),
    ]);
    const campaign = mine.find((entry) => entry.id === owned[0]?.campaignId) ?? mine[0] ?? null;
    if (!campaign) return { campaign: null, roster: [], members: [] as User[] };

    const roster = await characters.listForCampaign(campaign.id);
    const members = await users.byIds(campaign.members.map((member) => member.userId));
    return { campaign, roster, members };
  }, ['player-party']);

  if (state.status !== 'ready') {
    return (
      <PlayerPage title="Party">
        <ScreenState state={state} what="the party" />
      </PlayerPage>
    );
  }

  const { campaign, roster, members } = state.data;

  if (!campaign) {
    return (
      <PlayerPage title="Party">
        <div className="tc-page">
          <EmptyState
            icon="users-three"
            title="Not in a campaign yet"
            description="Ask your DM for an invite code. Joining takes a moment and does not need a character first."
            actions={
              <Button variant="primary" icon="flag-banner" as={Link} to="/join">
                Join a campaign
              </Button>
            }
          />
        </div>
      </PlayerPage>
    );
  }

  const nameFor = (character: Character) => {
    const member = campaign.members.find((entry) => entry.characterId === character.id);
    return (
      members.find((user) => user.id === (member?.userId ?? character.ownerUserId))?.displayName ??
      'Unclaimed'
    );
  };

  return (
    <PlayerPage eyebrow={campaign.name} title="Party">
      <div className="tc-page">
        {roster.length === 0 ? (
          <EmptyState
            icon="users-three"
            title="No characters yet"
            description="Nobody has brought a character to this campaign. Yours would be the first."
            actions={
              <Button variant="primary" icon="plus" as={Link} to="/builder">
                Create character
              </Button>
            }
          />
        ) : (
          <section>
            <SectionHeader sub title="Party" eyebrow={`${roster.length} characters`} />
            {roster.map((character) => (
              <PartyMember
                key={character.id}
                character={character}
                playerName={nameFor(character)}
                campaign={campaign}
              />
            ))}
          </section>
        )}
      </div>
    </PlayerPage>
  );
}

/** Every character this player owns, in a campaign or not. */
export function PlayerCharacters() {
  const { users, characters, campaigns } = useRepositories();

  const state = useAsync(async () => {
    const user = await users.current();
    const [owned, mine] = await Promise.all([
      characters.listForOwner(user.id),
      campaigns.listForUser(user.id),
    ]);
    return { owned, byCampaign: new Map(mine.map((campaign) => [campaign.id, campaign])) };
  }, ['player-characters']);

  const newCharacter = (
    <Button variant="tertiary" size="sm" icon="plus" as={Link} to="/builder">
      New
    </Button>
  );

  if (state.status !== 'ready') {
    return (
      <PlayerPage title="My characters" actions={newCharacter}>
        <ScreenState state={state} what="your characters" />
      </PlayerPage>
    );
  }

  const { owned, byCampaign } = state.data;

  return (
    <PlayerPage title="My characters" actions={newCharacter}>
      <div className="tc-page">
        {owned.length === 0 ? (
          <EmptyState
            icon="identification-card"
            title="No characters yet"
            description="The builder asks one question at a time and works out every number it can. About five minutes for a first character."
            actions={
              <Button variant="primary" size="lg" block icon="plus" as={Link} to="/builder">
                Create character
              </Button>
            }
          />
        ) : (
          <section>
            <SectionHeader sub title="Characters" eyebrow={`${owned.length}`} />
            {owned.map((character) => (
              <ListRow
                key={character.id}
                as={Link}
                to={`/play/sheet/${character.id}`}
                leading={<Avatar name={character.name} entity="player" />}
                title={character.name}
                meta={[
                  character.subtitle,
                  character.campaignId
                    ? (byCampaign.get(character.campaignId)?.name ?? 'In a campaign')
                    : 'Not in a campaign',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                trailing={
                  character.pendingLevelUp ? (
                    <Badge tone="success" icon="arrow-up">
                      Level up
                    </Badge>
                  ) : undefined
                }
              />
            ))}
          </section>
        )}
      </div>
    </PlayerPage>
  );
}
