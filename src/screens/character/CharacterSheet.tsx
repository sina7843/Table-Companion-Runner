/**
 * The character sheet.
 *
 * Not a paper sheet. The four things asked for during play — health, armour class,
 * initiative and conditions — are fixed at the top and never scroll away. Everything else
 * is tabbed, ordered by how often a player touches it, and every row is rollable where
 * the ruleset makes it rollable.
 *
 * Mobile stacks identity, health, stats and tabs. Desktop splits them into a fixed 360px
 * identity column and a scrolling content column — the same tab set, the same rows, the
 * same order, so a player who learned the phone knows the desktop. The width buys
 * simultaneity, not extra features.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  ConditionChip,
  DiceButton,
  EmptyState,
  HPBar,
  HPControl,
  IconButton,
  SectionHeader,
  Skeleton,
  Stat,
  StatGrid,
  Tabs,
  type ConditionTone,
} from '../../design-system';
import { BP, useMediaQuery } from '../../app/useMediaQuery';
import { RollReadout, useRoller } from '../../app/useRoller';
import {
  canSeeCharacterSection,
  useUserId,
  id,
  requireRuleset,
  useAsync,
  useRepositories,
  viewerFor,
  type Character,
  type CharacterId,
  type RollableEntry,
  type Ruleset,
  type ValueEntry,
  type Viewer,
} from '../../domain';

/* ── Rows ───────────────────────────────────────────────────────────────────── */

/**
 * A rollable row. Decisions are buttons and results are read-only rows — nothing that
 * requires a choice is styled as a result, and nothing automatic is styled as a control.
 */
function ActionRow({
  entry,
  onRoll,
}: {
  entry: RollableEntry;
  onRoll: (label: string, expression: string) => void;
}) {
  return (
    <div className="tc-action" data-prepared={entry.prepared === false ? 'false' : undefined}>
      {entry.tier && (
        <span className="tc-action__level">{entry.tier === 'Cantrip' ? 'C' : '1'}</span>
      )}
      <span className="tc-action__main">
        <span className="tc-action__name">
          {entry.name}
          {entry.prepared === false && <Badge tone="neutral">Not prepared</Badge>}
        </span>
        <span className="tc-action__meta">
          {entry.meta?.map((line) => (
            <span key={line}>{line}</span>
          ))}
          {entry.tags?.map((tag) => (
            <b key={tag}>{tag}</b>
          ))}
        </span>
        {entry.description && (
          <span style={{ fontSize: 'var(--font-size-12)', color: 'var(--color-text-secondary)' }}>
            {entry.description}
          </span>
        )}
      </span>
      {entry.rolls && entry.rolls.length > 0 && (
        <span className="tc-action__rolls">
          {entry.rolls.map((roll) => (
            <DiceButton
              key={roll.label}
              expression={roll.expression}
              label={roll.label}
              primary={roll.label === 'Attack'}
              onClick={() => onRoll(`${entry.name} — ${roll.label}`, roll.expression)}
            />
          ))}
        </span>
      )}
    </div>
  );
}

/** Skills and saves, two-up on desktop. Proficiency is a word, never colour alone. */
function ValueList({
  values,
  onRoll,
}: {
  values: ValueEntry[];
  onRoll: (label: string, expression: string) => void;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '0 var(--space-24)',
      }}
    >
      {values.map((value) => (
        <div className="tc-kv" key={value.key}>
          <span className="tc-kv__k">
            {value.label}
            {value.proficient && (
              <>
                {' '}
                <Badge tone="accent">Proficient</Badge>
              </>
            )}
          </span>
          <span className="tc-kv__v">
            {value.expression ? (
              <button
                type="button"
                className="tc-btn tc-btn--tertiary tc-btn--sm"
                onClick={() => onRoll(value.label, value.expression ?? '')}
              >
                {value.value}
              </button>
            ) : (
              value.value
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── The sheet ──────────────────────────────────────────────────────────────── */

export function CharacterSheet() {
  const { characterId } = useParams();
  const { characters, campaigns } = useRepositories();
  const userId = useUserId();
  const isDesktop = useMediaQuery(BP.lg);

  const [tab, setTab] = useState('actions');
  // The shared roll primitive: one implementation of the arithmetic and the readout,
  // so this screen and the monster sheet cannot disagree about what a critical is.
  const roller = useRoller(id<'GameSystem'>('dnd5e-2024'));

  const state = useAsync(async () => {
    const character = characterId ? await characters.byId(characterId as CharacterId) : null;
    if (!character) {
      // Fall back to the signed-in user's own character, which is what /play/sheet means.
      const owned = userId ? await characters.listForOwner(userId) : [];
      const mine = owned.find((entry) => entry.campaignId) ?? owned[0] ?? null;
      if (!mine) return { character: null, campaign: null };
      const campaign = mine.campaignId ? await campaigns.byId(mine.campaignId) : null;
      return { character: mine, campaign };
    }
    const campaign = character.campaignId ? await campaigns.byId(character.campaignId) : null;
    return { character, campaign };
  }, ['character-sheet', characterId ?? 'mine']);

  if (state.status === 'loading') {
    return (
      <SheetFrame>
        <div className="tc-page" aria-busy="true">
          <span className="tc-visually-hidden" role="status">
            Loading the character sheet
          </span>
          <Skeleton count={6} height={44} gap={8} />
        </div>
      </SheetFrame>
    );
  }

  if (state.status === 'error') {
    return (
      <SheetFrame>
        <div className="tc-page">
          <Alert tone="danger" icon="cloud-slash" title="Could not load this character">
            {state.error.message}
          </Alert>
        </div>
      </SheetFrame>
    );
  }

  const { character, campaign } = state.data;

  if (!character) {
    return (
      <SheetFrame>
        <div className="tc-page">
          <EmptyState
            icon="identification-card"
            title="No character yet"
            description="Build one and it appears here, ready for the table."
            actions={
              <Button variant="primary" icon="plus" as={Link} to="/builder">
                Create character
              </Button>
            }
          />
        </div>
      </SheetFrame>
    );
  }

  const ruleset = requireRuleset(character.systemId);
  // Signed out reads as a player who owns nothing, which is the safe end of every rule in
  // `permissions.ts` — never the DM branch.
  const reader = userId ?? id<'User'>('anonymous');
  const viewer: Viewer = campaign
    ? viewerFor(campaign, reader)
    : { userId: reader, role: 'player' };

  // Sections the viewer is not allowed to read simply do not exist for them — the design
  // hides the tab rather than showing a locked one.
  const sections = ruleset
    .sheetSections(character)
    .filter(
      (section) =>
        !section.privacyKey || canSeeCharacterSection(viewer, character, section.privacyKey),
    );

  const activeId = sections.some((section) => section.id === tab) ? tab : (sections[0]?.id ?? '');
  const content = ruleset.sheetContent(character, activeId);

  const identity = (
    <IdentityBlock character={character} ruleset={ruleset} viewer={viewer} inline={isDesktop} />
  );

  const body = (
    <>
      <Tabs
        label="Character sheet sections"
        items={sections.map((section) => ({
          id: section.id,
          label: section.label,
          count: section.count,
        }))}
        value={activeId}
        onChange={setTab}
      />

      <div style={{ paddingTop: 'var(--space-12)' }}>
        {roller.last && (
          <div style={{ marginBottom: 'var(--space-12)' }}>
            <RollReadout roller={roller} />
          </div>
        )}

        {content.resources && content.resources.length > 0 && (
          <div style={{ marginBottom: 'var(--space-12)' }}>
            <SectionHeader sub title="Spell slots" />
            <div style={{ display: 'flex', gap: 'var(--space-12)', flexWrap: 'wrap' }}>
              {content.resources.map((pool) => (
                <span className="tc-slots" key={pool.key}>
                  <span style={{ fontSize: 'var(--font-size-12)' }}>{pool.label}</span>
                  <span className="tc-slots__pips">
                    {Array.from({ length: pool.max }, (_, index) => (
                      <span
                        key={index}
                        className="tc-slots__pip"
                        data-used={index < pool.max - pool.used ? 'false' : 'true'}
                      />
                    ))}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {content.rollables?.map((entry) => (
          <ActionRow key={entry.key} entry={entry} onRoll={roller.roll} />
        ))}

        {content.values && <ValueList values={content.values} onRoll={roller.roll} />}

        {content.prose?.map((item) => (
          <div
            key={item.name}
            style={{
              padding: 'var(--space-10) 0',
              borderBottom: '1px solid var(--color-border-subtle)',
            }}
          >
            <div style={{ fontSize: 'var(--font-size-14)', fontWeight: 600, marginBottom: 3 }}>
              {item.name}
            </div>
            <div
              style={{
                fontSize: 'var(--font-size-13)',
                lineHeight: 'var(--line-height-normal)',
                color: 'var(--color-text-secondary)',
                maxWidth: '68ch',
              }}
            >
              {item.text}
            </div>
          </div>
        ))}

        {!content.rollables && !content.values && !content.prose && (
          <EmptyState icon="compass" title="Nothing here yet" />
        )}
      </div>
    </>
  );

  if (isDesktop) {
    return (
      <SheetFrame>
        <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden' }}>
          <aside
            style={{
              flex: 'none',
              width: 360,
              borderRight: '1px solid var(--color-border-default)',
              background: 'var(--color-surface-primary)',
              overflowY: 'auto',
              padding: 'var(--space-16)',
            }}
          >
            {identity}
          </aside>
          <main
            id="main"
            tabIndex={-1}
            style={{
              flex: 1,
              minWidth: 0,
              overflowY: 'auto',
              padding: 'var(--space-20) var(--space-24)',
            }}
          >
            {body}
          </main>
        </div>
      </SheetFrame>
    );
  }

  return (
    <SheetFrame>
      <div
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
            {character.name}
          </span>
          <IconButton
            icon="lock-simple"
            label="Privacy settings"
            as={Link}
            to={`/play/sheet/${character.id}/privacy`}
          />
          <IconButton
            icon="pencil-simple"
            label="Edit character"
            as={Link}
            to={`/play/sheet/${character.id}/edit`}
          />
        </header>

        {/* The fixed top third: the four things asked for during play. */}
        <div
          style={{
            flex: 'none',
            padding: 'var(--space-16)',
            background: 'var(--color-surface-primary)',
            borderBottom: '1px solid var(--color-border-default)',
          }}
        >
          {identity}
        </div>

        <main
          id="main"
          tabIndex={-1}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '0 var(--space-16) var(--space-16)',
          }}
        >
          {body}
        </main>
      </div>
    </SheetFrame>
  );
}

/** Identity, health, the play-critical stats and conditions. */
function IdentityBlock({
  character,
  ruleset,
  viewer,
  inline,
}: {
  character: Character;
  ruleset: Ruleset;
  viewer: Viewer;
  inline: boolean;
}) {
  const derived = ruleset.deriveCharacter(character);
  const headline = derived.filter(
    (value) => typeof value.value === 'number' && value.key !== 'proficiency',
  );
  const canEdit = viewer.role === 'dm' || character.ownerUserId === viewer.userId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}>
      {inline && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)' }}>
          <span
            style={{
              flex: 1,
              fontFamily: 'var(--font-display)',
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: '-.015em',
            }}
          >
            {character.name}
          </span>
          {canEdit && (
            <>
              <IconButton
                icon="lock-simple"
                label="Privacy settings"
                size="sm"
                as={Link}
                to={`/play/sheet/${character.id}/privacy`}
              />
              <IconButton
                icon="pencil-simple"
                label="Edit character"
                size="sm"
                as={Link}
                to={`/play/sheet/${character.id}/edit`}
              />
            </>
          )}
        </div>
      )}

      <span style={{ fontSize: 'var(--font-size-12)', color: 'var(--color-text-tertiary)' }}>
        {character.subtitle}
      </span>

      {/* Desktop puts the full hit-point control inline rather than behind a tap. */}
      {inline ? (
        <HPControl
          current={character.health.current}
          max={character.health.max}
          temp={character.health.temporary}
          onApply={() => undefined}
        />
      ) : (
        <HPBar
          current={character.health.current}
          max={character.health.max}
          temp={character.health.temporary}
          showUnit
        />
      )}

      <StatGrid columns={3}>
        {headline.map((value) => (
          <Stat
            key={value.key}
            label={value.label.split(' ')[0] ?? value.label}
            value={value.value}
            overridden={value.overridden}
          />
        ))}
      </StatGrid>

      <StatGrid columns={6}>
        {character.attributes.map((attribute) => (
          <Stat
            key={attribute.key}
            label={attribute.label}
            value={attribute.value}
            modifier={attribute.modifier}
          />
        ))}
      </StatGrid>

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

      {character.pendingLevelUp && ruleset.capabilities.levelling && (
        <Alert
          tone="success"
          icon="arrow-up"
          title={`Level ${character.level + 1} available`}
          actions={
            <Button
              size="sm"
              variant="secondary"
              icon="arrow-up"
              as={Link}
              to={`/play/sheet/${character.id}/level-up`}
            >
              Start level up
            </Button>
          }
        >
          {ruleset.levelUpSteps(character, character.level + 1).length} decisions, about two
          minutes.
        </Alert>
      )}
    </div>
  );
}

function SheetFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="tc-appsurface" data-density="touch">
      {children}
    </div>
  );
}
