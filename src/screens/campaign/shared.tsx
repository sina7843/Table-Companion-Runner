/**
 * Pieces the campaign screens share.
 *
 * The design's own note: "the party table is the party screen" — the overview shows it in
 * a column and the Party tab shows the same table at full width with privacy state and an
 * invite row added. Building it twice would guarantee they drift, so it is built once.
 */
import { Link } from 'react-router-dom';
import {
  Badge,
  ConditionChip,
  HPBar,
  hpBand,
  Icon,
  IconButton,
  SectionHeader,
  Stat,
  StatGrid,
  type ConditionTone,
  type IconName,
  type TableColumn,
  type Tone,
} from '../../design-system';
import type { PanelContent } from '../../app/panelContext';
import {
  canSeeCharacterSection,
  requireRuleset,
  type Campaign,
  type Character,
  type CombatInstance,
  type User,
  type Viewer,
} from '../../domain';

/** A party row is a character plus the person playing it. */
export interface PartyRow extends Record<string, unknown> {
  character: Character;
  playerName: string;
  armourClass: number | string;
  /** Whether this character hides anything from the rest of the party. */
  hasPrivateSections: boolean;
}

export function buildPartyRows(
  characters: Character[],
  campaign: Campaign,
  users: User[],
): PartyRow[] {
  const byId = new Map(users.map((user) => [user.id as string, user]));

  return characters
    .map((character) => {
      const derived = requireRuleset(character.systemId).deriveCharacter(character);
      const member = campaign.members.find((entry) => entry.characterId === character.id);
      const owner = byId.get(member?.userId ?? character.ownerUserId);

      return {
        character,
        playerName: owner?.displayName ?? 'Unclaimed',
        armourClass: derived.find((value) => value.key === 'ac')?.value ?? '—',
        hasPrivateSections: Object.values(character.sectionVisibility).some(
          (visibility) => visibility === 'private' || visibility === 'dm-only',
        ),
      };
    })
    .toSorted((a, b) => a.character.name.localeCompare(b.character.name));
}

/**
 * Status, derived rather than stored: unconscious, bloodied, an unspent level-up, or
 * ready. Every one carries a word and a glyph, never a colour alone.
 */
export function statusFor(character: Character): { tone: Tone; icon: IconName; label: string } {
  if (character.health.current <= 0) {
    return { tone: 'danger', icon: 'heartbeat', label: 'Unconscious' };
  }
  const band = hpBand(character.health.current, character.health.max);
  if (band === 'critical' || band === 'damaged') {
    return { tone: 'warning', icon: 'drop', label: 'Bloodied' };
  }
  if (character.pendingLevelUp) {
    return { tone: 'success', icon: 'arrow-up', label: 'Level up ready' };
  }
  return { tone: 'neutral', icon: 'check', label: 'Ready' };
}

export interface PartyColumnOptions {
  onOpen: (row: PartyRow) => void;
  /** The Party tab adds a privacy column; the overview column is too narrow for it. */
  showPrivacy?: boolean;
}

/**
 * The party table's columns, straight from the approved design: character, player,
 * class, level, hit points, armour class, status, row actions.
 */
export function partyColumns({ onOpen, showPrivacy }: PartyColumnOptions): TableColumn<PartyRow>[] {
  const columns: TableColumn<PartyRow>[] = [
    { key: 'name', label: 'Character', primary: true, render: (row) => row.character.name },
    {
      key: 'player',
      label: 'Player',
      width: 96,
      render: (row) => (
        <span style={{ color: 'var(--color-text-tertiary)' }}>{row.playerName}</span>
      ),
    },
    // "Class" in D&D; the core calls it an archetype so another system can label it its own way.
    {
      key: 'archetype',
      label: 'Class',
      width: 88,
      render: (row) => row.character.archetype ?? '—',
    },
    {
      key: 'level',
      label: 'Level',
      numeric: true,
      width: 58,
      render: (row) => row.character.level,
    },
    {
      key: 'hp',
      label: 'Hit points',
      width: 132,
      render: (row) => (
        <HPBar
          current={row.character.health.current}
          max={row.character.health.max}
          temp={row.character.health.temporary}
          showUnit
        />
      ),
    },
    { key: 'ac', label: 'AC', numeric: true, width: 48, render: (row) => row.armourClass },
    {
      key: 'status',
      label: 'Status',
      width: 150,
      render: (row) => {
        const status = statusFor(row.character);
        return (
          <Badge tone={status.tone} icon={status.icon}>
            {status.label}
          </Badge>
        );
      },
    },
  ];

  if (showPrivacy) {
    columns.push({
      key: 'privacy',
      label: 'Privacy',
      width: 120,
      render: (row) =>
        row.hasPrivateSections ? (
          <span className="tc-privacy" data-level="private">
            <Icon name="lock-simple" size={11} />
            Hidden sections
          </span>
        ) : (
          <span className="tc-privacy" data-level="party">
            <Icon name="users-three" size={11} />
            Party
          </span>
        ),
    });
  }

  columns.push({
    key: 'actions',
    label: '',
    width: 68,
    render: (row) => (
      <span className="tc-table__rowactions">
        <IconButton
          icon="arrow-square-out"
          label={`Open ${row.character.name}`}
          size="sm"
          onClick={() => onOpen(row)}
        />
      </span>
    ),
  });

  return columns;
}

/**
 * Character details for the context panel.
 *
 * This is what "open Character details in context without unnecessary navigation" means:
 * the row opens the panel beside the table, and the fight or the roster behind it stays
 * exactly where it was. The full sheet is still one link away for anyone who wants it.
 */
export function characterPanel(row: PartyRow, viewer: Viewer): PanelContent {
  const { character } = row;
  const ruleset = requireRuleset(character.systemId);
  const derived = ruleset.deriveCharacter(character);
  const status = statusFor(character);

  const hiddenSections = Object.entries(character.sectionVisibility)
    .filter(([, visibility]) => visibility === 'private' || visibility === 'dm-only')
    .map(([section]) => section);

  return {
    eyebrow: `${character.archetype ?? 'Character'} · ${row.playerName}`,
    title: character.name,
    body: (
      <div
        style={{
          padding: 'var(--space-16)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-16)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
          <span style={{ fontSize: 'var(--font-size-13)', color: 'var(--color-text-tertiary)' }}>
            {character.subtitle}
          </span>
          <Badge tone={status.tone} icon={status.icon}>
            {status.label}
          </Badge>
        </div>

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

        <div>
          <SectionHeader sub title="Calculated" />
          <StatGrid columns={3}>
            {derived
              .filter((value) => typeof value.value === 'number')
              .map((value) => (
                <Stat key={value.key} label={value.label} value={value.value} />
              ))}
          </StatGrid>
        </div>

        <div>
          <SectionHeader sub title="Abilities" />
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
        </div>

        {/*
          The DM retains full access, so this states what the party cannot see rather than
          hiding it. A player looking at someone else's sheet would not get this far —
          canSeeCharacterSection filters it out.
        */}
        {hiddenSections.length > 0 && canSeeCharacterSection(viewer, character, 'inventory') && (
          <div className="tc-dmzone" style={{ padding: 'var(--space-12)' }}>
            <span className="tc-dmzone__label">
              <Icon name="eye-slash" size={11} />
              Hidden from the party
            </span>
            <span style={{ fontSize: 'var(--font-size-13)', color: 'var(--color-text-secondary)' }}>
              {hiddenSections.join(', ')} — visible to you as the DM.
            </span>
          </div>
        )}

        <Link to={`/dm/characters/${character.id}`}>Open the full character sheet</Link>
      </div>
    ),
  };
}

/** "4 days ago" / "in 3 days". Kept here so every campaign screen phrases it identically. */
export function relativeTime(iso: string | undefined, now: number = Date.now()): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const seconds = Math.round((then - now) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['day', 86_400],
    ['hour', 3600],
    ['minute', 60],
  ];

  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return formatter.format(seconds, 'second');
}

/** One line summarising a fought combat: when, how long, how big. */
export function combatSummary(combat: CombatInstance): string {
  if (combat.status === 'live') {
    return `Live now · round ${combat.round}`;
  }
  return [
    relativeTime(combat.endedAt ?? combat.startedAt),
    `${combat.round} rounds`,
    combat.location,
  ]
    .filter(Boolean)
    .join(' · ');
}
