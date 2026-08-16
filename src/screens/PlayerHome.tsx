import { Link } from 'react-router-dom';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  ConditionChip,
  ConnectionStatus,
  EmptyState,
  HPBar,
  IconButton,
  SectionHeader,
  Skeleton,
  Stat,
  type ConditionTone,
} from '../design-system';
import { PlayerPage } from '../app/PlayerShell';
import { useConnection } from '../app/useConnection';
import {
  requireRuleset,
  useAsync,
  useRepositories,
  type Character,
  type CombatInstance,
} from '../domain';

/**
 * The player home shows one player's own character. In the fixture world the signed-in
 * user is the DM, so this picks the first character they own — TC-13's auth layer
 * replaces this with the real session identity.
 *
 * ponytail: a real "current player" needs sessions, which do not exist yet. Threading a
 * fake one through the whole app to avoid this line would be worse.
 */
function pickCharacter(characters: Character[]): Character | null {
  return characters.find((character) => character.campaignId) ?? characters[0] ?? null;
}

/**
 * The live block. Absent rather than empty when nothing is running — the design is
 * explicit that the character then becomes the first thing on the screen.
 */
function LiveBlock({ combat, character }: { combat: CombatInstance; character: Character | null }) {
  const mine = combat.participants.find(
    (participant) =>
      participant.source.kind === 'character' && participant.source.characterId === character?.id,
  );
  const isMyTurn = mine !== undefined && combat.activeParticipantId === mine.id;
  const turnIndex = combat.participants.findIndex((p) => p.id === combat.activeParticipantId);

  return (
    <div
      style={{
        padding: 'var(--space-16)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-12)',
        borderBottom: '1px solid var(--color-border-default)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-size-10)',
            letterSpacing: 'var(--tracking-caps)',
            textTransform: 'uppercase',
            color: 'var(--color-text-accent)',
          }}
        >
          Live now
        </span>
        {isMyTurn && (
          <Badge tone="accent" solid>
            Your turn
          </Badge>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: '-.015em',
          }}
        >
          {combat.name}
        </span>
        <span style={{ fontSize: 'var(--font-size-13)', color: 'var(--color-text-tertiary)' }}>
          {[
            combat.location,
            `Round ${combat.round}`,
            turnIndex >= 0 && `turn ${turnIndex + 1} of ${combat.participants.length}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>

      {/* The whole point of the screen when a fight is running. */}
      <Button variant="primary" size="lg" block icon="sword" as={Link} to="/play/combat">
        {isMyTurn ? 'Take your turn' : 'Open combat'}
      </Button>
    </div>
  );
}

/**
 * The player's home.
 *
 * Four things, ranked, and nothing else: the fight that is happening, the character in
 * it, that character's health, and one advancement offer. No widgets, no statistics.
 */
export function PlayerHome() {
  const { users, characters, combats, campaigns } = useRepositories();
  const connection = useConnection();

  const state = useAsync(async () => {
    const user = await users.current();
    const [owned, live, mine] = await Promise.all([
      characters.listForOwner(user.id),
      combats.liveForUser(user.id),
      campaigns.listForUser(user.id),
    ]);
    const character = pickCharacter(owned);
    const campaign = mine.find((entry) => entry.id === character?.campaignId) ?? null;
    return { user, character, live, campaign, owned };
  }, ['player-home']);

  if (state.status === 'loading') {
    return (
      <PlayerPage title="Home">
        <div className="tc-page" aria-busy="true">
          <span className="tc-visually-hidden" role="status">
            Loading your character
          </span>
          <Skeleton count={1} height={120} />
          <Skeleton count={3} height={52} gap={12} />
        </div>
      </PlayerPage>
    );
  }

  if (state.status === 'error') {
    return (
      <PlayerPage title="Home">
        <div className="tc-page">
          <Alert
            tone="danger"
            icon="cloud-slash"
            title="Could not load your character"
            actions={
              <Button size="sm" variant="secondary" onClick={state.reload}>
                Try again
              </Button>
            }
          >
            {state.error.message} Your character is safe.
          </Alert>
        </div>
      </PlayerPage>
    );
  }

  const { user, character, live, campaign, owned } = state.data;

  // First run for a player: no character anywhere. Two paths, because a player arriving
  // from an invite link and one arriving on their own want different things.
  if (!character) {
    return (
      <PlayerPage eyebrow={user.displayName} title="Home">
        <div
          style={{
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            padding: 'var(--space-16)',
          }}
        >
          <EmptyState
            icon="identification-card"
            title="No characters yet"
            description="The builder asks one question at a time and fills in every number it can work out for you. About five minutes for a first character."
            actions={
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-8)',
                  width: '100%',
                }}
              >
                <Button variant="primary" size="lg" block icon="plus" as={Link} to="/builder">
                  Create character
                </Button>
                <Button variant="tertiary" block icon="flag-banner" as={Link} to="/join">
                  Join a campaign
                </Button>
              </div>
            }
          />
        </div>
      </PlayerPage>
    );
  }

  const ruleset = requireRuleset(character.systemId);
  const armourClass = ruleset.deriveCharacter(character).find((value) => value.key === 'ac');

  return (
    <PlayerPage
      eyebrow={user.displayName}
      title="Home"
      actions={
        <>
          <ConnectionStatus state={connection.state} />
          {/*
            Not in the bottom bar — five destinations is the design's thumb-reach limit — so
            the account lives here, at the top of the one screen every player starts on.
          */}
          <IconButton icon="user-circle" label="Account" as={Link} to="/dm/account" />
        </>
      }
    >
      {live && <LiveBlock combat={live} character={character} />}

      <div style={{ padding: 'var(--space-16) var(--space-16) 0' }}>
        <SectionHeader
          sub
          title="Your character"
          // My characters is not in the bottom bar — five items is the design's limit — so
          // this is how a player with more than one reaches the rest of them.
          actions={
            owned.length > 1 ? (
              <Button size="sm" variant="tertiary" as={Link} to="/play/characters">
                All {owned.length}
              </Button>
            ) : undefined
          }
        />
      </div>

      <div
        style={{
          padding: '0 var(--space-16) var(--space-16)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-12)',
        }}
      >
        <Link
          to={`/play/sheet/${character.id}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-12)',
            border: 0,
            color: 'inherit',
          }}
        >
          <Avatar name={character.name} entity="player" size="lg" />
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ fontSize: 'var(--font-size-15)', fontWeight: 600 }}>
              {character.name}
            </span>
            <span style={{ fontSize: 'var(--font-size-12)', color: 'var(--color-text-tertiary)' }}>
              {[character.subtitle, campaign?.name ?? 'Not in a campaign'].join(' · ')}
            </span>
          </span>
          {armourClass && <Stat label="AC" value={armourClass.value} />}
        </Link>

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

      {/* One advancement offer, and only when there is genuinely one waiting. */}
      {character.pendingLevelUp && ruleset.capabilities.levelling && (
        <div style={{ padding: '0 var(--space-16) var(--space-16)' }}>
          <Alert
            tone="success"
            icon="arrow-up"
            title={`Level ${character.level + 1} available`}
            actions={
              <Button size="sm" variant="secondary" icon="arrow-up" as={Link} to="/builder">
                Start level up
              </Button>
            }
          >
            You have enough experience to advance.{' '}
            {ruleset.levelUpSteps(character, character.level + 1).length} decisions, about two
            minutes.
          </Alert>
        </div>
      )}
    </PlayerPage>
  );
}
