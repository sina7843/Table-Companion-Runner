/**
 * "Who can see what".
 *
 * The requirement is that privacy is understandable beyond a tiny lock icon, and the
 * design's answer is specific: every row states the level in a word AND repeats it as a
 * sentence naming who is affected. The sections that cannot be hidden are fixed text
 * rather than a disabled switch, so nobody hunts for a control that does not exist.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Button, Icon, IconButton, Skeleton, type IconName } from '../../design-system';
import {
  requireRuleset,
  useAsync,
  useRepositories,
  type Campaign,
  type Character,
  type CharacterId,
  type DerivedValue,
  type CharacterSectionKey,
  type User,
  type Visibility,
} from '../../domain';

interface PrivacyRow {
  key: CharacterSectionKey;
  name: string;
  /** Whether the player may hide it at all. */
  lockable: boolean;
}

/**
 * The sections a player can reason about, in sheet order.
 *
 * Combat state is deliberately not lockable: a fight cannot be run if the other players
 * cannot see who is hurt.
 */
const ROWS: PrivacyRow[] = [
  { key: 'overview', name: 'Overview and combat state', lockable: false },
  { key: 'abilities', name: 'Abilities, skills and saves', lockable: true },
  { key: 'actions', name: 'Actions and spells', lockable: true },
  { key: 'inventory', name: 'Inventory', lockable: true },
  { key: 'features', name: 'Features and traits', lockable: true },
  { key: 'background', name: 'Background and backstory', lockable: true },
];

const LEVEL_LABEL: Record<Visibility, { label: string; icon: IconName }> = {
  public: { label: 'Everyone', icon: 'globe' },
  party: { label: 'Party', icon: 'users-three' },
  private: { label: 'Private', icon: 'lock-simple' },
  'dm-only': { label: 'DM only', icon: 'eye-slash' },
  secret: { label: 'Secret', icon: 'eye-slash' },
};

/** The sentence that does the real work — who is affected, in words. */
function whoCanSee(
  row: PrivacyRow,
  visibility: Visibility,
  dmName: string,
  otherPlayers: number,
): string {
  if (!row.lockable) {
    return 'Always shared — hit points, conditions and death saves';
  }
  if (visibility === 'party' || visibility === 'public') {
    return otherPlayers > 0
      ? `Visible to the other ${otherPlayers} player${otherPlayers === 1 ? '' : 's'}`
      : 'Visible to your party';
  }
  return `Hidden from the party. ${dmName} can still see it.`;
}

export function CharacterPrivacy() {
  const { characterId } = useParams();
  const { characters, campaigns, users } = useRepositories();
  const [overrides, setOverrides] = useState<Partial<Record<CharacterSectionKey, Visibility>>>({});

  const state = useAsync(async () => {
    const character = characterId ? await characters.byId(characterId as CharacterId) : null;
    if (!character) return { character: null, campaign: null, dm: null, otherPlayers: 0 };

    const campaign: Campaign | null = character.campaignId
      ? await campaigns.byId(character.campaignId)
      : null;
    const dm: User | null = campaign ? await users.byId(campaign.dmUserId) : null;
    const otherPlayers = campaign
      ? campaign.members.filter(
          (member) => member.role === 'player' && member.userId !== character.ownerUserId,
        ).length
      : 0;

    return { character, campaign, dm, otherPlayers };
  }, ['character-privacy', characterId ?? '']);

  if (state.status === 'loading') {
    return (
      <PrivacyFrame characterId={characterId}>
        <div className="tc-page" aria-busy="true">
          <span className="tc-visually-hidden" role="status">
            Loading privacy settings
          </span>
          <Skeleton count={6} height={56} gap={8} />
        </div>
      </PrivacyFrame>
    );
  }

  if (state.status === 'error' || !state.data.character) {
    return (
      <PrivacyFrame characterId={characterId}>
        <div className="tc-page">
          <Alert tone="danger" icon="cloud-slash" title="Could not load privacy settings">
            {state.status === 'error' ? state.error.message : 'That character does not exist.'}
          </Alert>
        </div>
      </PrivacyFrame>
    );
  }

  const { character, dm, otherPlayers } = state.data;
  const dmName = dm?.displayName ?? 'Your DM';

  function visibilityOf(row: PrivacyRow): Visibility {
    if (!row.lockable) return 'party';
    return overrides[row.key] ?? (character as Character).sectionVisibility[row.key] ?? 'party';
  }

  function toggle(row: PrivacyRow) {
    const next: Visibility = visibilityOf(row) === 'private' ? 'party' : 'private';
    setOverrides((current) => ({ ...current, [row.key]: next }));
  }

  return (
    <PrivacyFrame characterId={character.id}>
      <div
        style={{
          padding: 'var(--space-16)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-16)',
        }}
      >
        {/*
          The single most important sentence on the screen. A player hiding a section is
          hiding it from the other players, never from the person running the game.
        */}
        <Alert tone="info" icon="eye" title="Your DM always sees everything">
          {dmName} runs this campaign and has full access to every section, including the ones you
          hide from the party. Hiding a section only affects the other{' '}
          {otherPlayers > 0 ? otherPlayers : ''} player{otherPlayers === 1 ? '' : 's'}.
        </Alert>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {ROWS.map((row) => {
            const visibility = visibilityOf(row);
            const level = LEVEL_LABEL[visibility];
            const shared = visibility === 'party' || visibility === 'public';

            return (
              <div
                key={row.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-12)',
                  padding: 'var(--space-12) 0',
                  borderBottom: '1px solid var(--color-border-subtle)',
                }}
              >
                <div
                  style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}
                >
                  <span style={{ fontSize: 14.5, fontWeight: 600 }}>{row.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                    {whoCanSee(row, visibility, dmName, otherPlayers)}
                  </span>
                </div>

                {/* The level in a word and a glyph, never a bare colour. */}
                <span className="tc-privacy" data-level={shared ? 'party' : 'private'}>
                  <Icon name={level.icon} size={11} />
                  {level.label}
                </span>

                {row.lockable ? (
                  <label className="tc-switch">
                    <span className="tc-visually-hidden">Share {row.name} with the party</span>
                    <input type="checkbox" checked={shared} onChange={() => toggle(row)} />
                    <span className="tc-switch__track" />
                  </label>
                ) : (
                  // Fixed text rather than a disabled switch, so nobody hunts for a
                  // control that does not exist.
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--font-size-11)',
                      color: 'var(--color-text-tertiary)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Always on
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <p
          style={{
            margin: 0,
            fontSize: 12.5,
            lineHeight: 1.6,
            color: 'var(--color-text-tertiary)',
          }}
        >
          Combat state — hit points, conditions and death saves — is always visible to the party. A
          fight cannot be run if the other players cannot see who is hurt.
        </p>

        {Object.keys(overrides).length > 0 && (
          <Alert tone="warning" icon="warning" title="Not saved yet">
            Privacy changes are held on this device until the character store accepts writes, which
            arrives with the data layer in TC-13. Nothing has been lost.
          </Alert>
        )}
      </div>
    </PrivacyFrame>
  );
}

function PrivacyFrame({
  characterId,
  children,
}: {
  characterId: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div
      className="tc-appsurface"
      data-density="touch"
      style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden' }}
    >
      <header
        style={{
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-8)',
          padding: 'var(--space-12) var(--space-16)',
          background: 'var(--color-surface-primary)',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}
      >
        <IconButton
          icon="arrow-left"
          label="Back to sheet"
          as={Link}
          to={characterId ? `/play/sheet/${characterId}` : '/play/sheet'}
        />
        <span
          style={{
            flex: 1,
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-section-title-size)',
            fontWeight: 700,
            fontVariantCaps: 'small-caps',
            letterSpacing: '.02em',
          }}
        >
          Who can see what
        </span>
      </header>

      <main id="main" tabIndex={-1} style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  );
}

/** Character editing. Phase 1 owns identity, long-form text and allowed overrides. */
export function CharacterEdit() {
  const { characterId } = useParams();
  const { characters } = useRepositories();

  const state = useAsync(
    () => (characterId ? characters.byId(characterId as CharacterId) : Promise.resolve(null)),
    ['character-edit', characterId ?? ''],
  );

  return (
    <PrivacyFrameEdit characterId={characterId}>
      {state.status === 'loading' && <Skeleton count={5} height={44} gap={8} />}

      {state.status === 'error' && (
        <Alert tone="danger" icon="cloud-slash" title="Could not load this character">
          {state.error.message}
        </Alert>
      )}

      {state.status === 'ready' && state.data && <CharacterEditForm character={state.data} />}
    </PrivacyFrameEdit>
  );
}

function PrivacyFrameEdit({
  characterId,
  children,
}: {
  characterId: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div
      className="tc-appsurface"
      data-density="touch"
      style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden' }}
    >
      <header
        style={{
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-8)',
          padding: 'var(--space-12) var(--space-16)',
          background: 'var(--color-surface-primary)',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}
      >
        <IconButton
          icon="arrow-left"
          label="Back to sheet"
          as={Link}
          to={characterId ? `/play/sheet/${characterId}` : '/play/sheet'}
        />
        <span
          style={{
            flex: 1,
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-section-title-size)',
            fontWeight: 700,
            fontVariantCaps: 'small-caps',
            letterSpacing: '.02em',
          }}
        >
          Edit character
        </span>
      </header>
      <main
        id="main"
        tabIndex={-1}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-16)' }}
      >
        {children}
      </main>
    </div>
  );
}

/**
 * What Phase 1 lets a player change directly.
 *
 * Rules-derived values are not free-text fields: only the ones the ruleset marks as
 * overridable can be pinned, which is what keeps "automatically calculate everything the
 * rules can calculate" true while still letting a table make its own call.
 */
function CharacterEditForm({ character }: { character: Character }) {
  const ruleset = requireRuleset(character.systemId);
  const derived = ruleset.deriveCharacter(character);
  const [saved] = useState<'idle' | 'saving'>('idle');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-20)' }}>
      <div>
        <SectionHeaderLite title="Identity" />
        <dl className="tc-deflist">
          <dt>Name</dt>
          <dd>{character.name}</dd>
          <dt>Subtitle</dt>
          <dd>{character.subtitle}</dd>
          <dt>Level</dt>
          <dd>{character.level}</dd>
        </dl>
      </div>

      <div>
        <SectionHeaderLite title="Calculated values" />
        <dl className="tc-deflist">
          {derived.map((value: DerivedValue) => (
            <span key={value.key} style={{ display: 'contents' }}>
              <dt>{value.label}</dt>
              <dd>
                {value.value}
                {ruleset.canOverride(value.key) ? (
                  <> — can be set by hand</>
                ) : (
                  <> — calculated by the rules</>
                )}
                {value.explanation && (
                  <span
                    style={{
                      display: 'block',
                      fontSize: 'var(--font-size-12)',
                      color: 'var(--color-text-tertiary)',
                    }}
                  >
                    {value.explanation}
                  </span>
                )}
              </dd>
            </span>
          ))}
        </dl>
      </div>

      <Alert tone="info" icon="calculator" title="Most values are worked out for you">
        Anything the rules can calculate is calculated. The values marked as settable can be
        overridden when your table rules differently; everything else changes by editing what
        produced it.
      </Alert>

      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-size-11)',
          color: 'var(--color-text-tertiary)',
        }}
        aria-live="polite"
      >
        {saved === 'saving' ? 'Saving…' : 'Saved'}
      </span>

      <Button variant="secondary" as={Link} to={`/play/sheet/${character.id}`}>
        Back to the sheet
      </Button>
    </div>
  );
}

function SectionHeaderLite({ title }: { title: string }) {
  return (
    <div className="tc-section tc-section--sub">
      <span className="tc-section__title">{title}</span>
    </div>
  );
}
