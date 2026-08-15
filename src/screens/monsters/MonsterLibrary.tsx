/**
 * The DM monster library.
 *
 * A table, not a card grid. Name, type, size, challenge, armour class, hit points and
 * source in aligned columns, sorted by difficulty — a DM comparing four candidates is
 * comparing numbers, and numbers compare in columns. The same content as cards would fit
 * a quarter as many rows above the fold.
 *
 * There is no separate monster page: selecting a row fills the docked context panel with
 * the full stat block and its three primary actions, so preparation never leaves this
 * screen. Opened from combat, the identical panel appears.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Chip,
  EmptyState,
  Icon,
  Modal,
  SectionHeader,
  Skeleton,
  Table,
  TextInput,
  type TableColumn,
} from '../../design-system';
import { DMPage } from '../../app/DMShell';
import { MonsterSheet, monsterEyebrow } from './MonsterSheet';
import { useContextPanel, type PanelContent } from '../../app/panelContext';
import {
  requireRuleset,
  useAsync,
  useRepositories,
  type FacetDefinition,
  type Monster,
  type MonsterQuery,
} from '../../domain';

/** The active system. TC-05's campaign context supplies this once combat is wired. */
const SYSTEM = 'dnd5e-2024';

interface MonsterRow extends Record<string, unknown> {
  monster: Monster;
}

/* ── The panel is the sheet ─────────────────────────────────────────────────── */

/**
 * Selecting a row fills the docked context panel with the same sheet the full page and
 * the combat drawer render — preparation never leaves this screen, and a creature opened
 * from combat later looks identical.
 */
function monsterPanel(monster: Monster): PanelContent {
  return {
    eyebrow: monsterEyebrow(monster),
    title: monster.name,
    body: (
      <MonsterSheet
        monster={monster}
        actions={
          <>
            <Button variant="primary" size="sm" icon="plus">
              Add to encounter
            </Button>
            <Button variant="secondary" size="sm" icon="copy">
              Clone
            </Button>
            <Button
              variant="tertiary"
              size="sm"
              icon="arrow-square-out"
              as={Link}
              to={`/dm/monsters/${monster.id}`}
            >
              Open full page
            </Button>
          </>
        }
      />
    ),
  };
}

/* ── Filters ────────────────────────────────────────────────────────────────── */

interface FilterState {
  search: string;
  facets: Record<string, string[]>;
  challengeMin?: number;
  challengeMax?: number;
  origin?: Monster['origin'];
}

const EMPTY: FilterState = { search: '', facets: {} };

/** A dismissible chip per applied filter, so what is narrowing the list is never hidden. */
function AppliedChips({
  filters,
  onRemove,
}: {
  filters: FilterState;
  onRemove: (change: Partial<FilterState>) => void;
}) {
  const chips: { key: string; label: string; clear: Partial<FilterState> }[] = [];

  for (const [facet, values] of Object.entries(filters.facets)) {
    for (const value of values) {
      chips.push({
        key: `${facet}-${value}`,
        label: value,
        clear: {
          facets: {
            ...filters.facets,
            [facet]: values.filter((entry) => entry !== value),
          },
        },
      });
    }
  }

  if (filters.challengeMin !== undefined || filters.challengeMax !== undefined) {
    chips.push({
      key: 'cr',
      label: `CR ${filters.challengeMin ?? 0} – ${filters.challengeMax ?? 30}`,
      clear: { challengeMin: undefined, challengeMax: undefined },
    });
  }

  if (filters.origin) {
    chips.push({
      key: 'origin',
      label: filters.origin === 'homebrew' ? 'Homebrew only' : 'Library only',
      clear: { origin: undefined },
    });
  }

  return (
    <>
      {chips.map((chip) => (
        <Chip key={chip.key} pressed onDismiss={() => onRemove(chip.clear)}>
          {chip.label}
        </Chip>
      ))}
    </>
  );
}

/* ── The screen ─────────────────────────────────────────────────────────────── */

export function MonsterLibrary() {
  const { monsters } = useRepositories();
  const { show } = useContextPanel();

  const [filters, setFilters] = useState<FilterState>(EMPTY);
  const [selected, setSelected] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const ruleset = requireRuleset(SYSTEM as Monster['systemId']);
  const facets = useMemo(() => ruleset.monsterFacets(), [ruleset]);
  const primaryFacet = facets.find((facet) => facet.primary);

  const query: MonsterQuery = {
    search: filters.search || undefined,
    facets: filters.facets,
    challengeMin: filters.challengeMin,
    challengeMax: filters.challengeMax,
    origin: filters.origin,
    sort: 'challenge-desc',
  };

  const state = useAsync(
    async () => ({
      rows: await monsters.list(query),
      total: await monsters.count(),
    }),
    ['monsters', JSON.stringify(query)],
  );

  function update(change: Partial<FilterState>) {
    setFilters((current) => ({ ...current, ...change }));
  }

  function toggleFacet(facet: string, value: string) {
    const current = filters.facets[facet] ?? [];
    update({
      facets: {
        ...filters.facets,
        [facet]: current.includes(value)
          ? current.filter((entry) => entry !== value)
          : [...current, value],
      },
    });
  }

  const hasFilters =
    filters.search.length > 0 ||
    filters.origin !== undefined ||
    filters.challengeMin !== undefined ||
    filters.challengeMax !== undefined ||
    Object.values(filters.facets).some((values) => values.length > 0);

  const columns: TableColumn<MonsterRow>[] = [
    {
      key: 'name',
      label: 'Name',
      primary: true,
      render: (row) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-6)' }}>
          {row.monster.name}
          {/* Homebrew is badged in place, not filed elsewhere: a DM searching for a goblin
              should find their edited goblin next to the printed one. */}
          {row.monster.origin === 'homebrew' && <Badge tone="accent">Homebrew</Badge>}
        </span>
      ),
    },
    {
      key: 'type',
      label: 'Type',
      width: 120,
      render: (row) => row.monster.facets.type?.[0] ?? '—',
    },
    { key: 'size', label: 'Size', width: 96, render: (row) => row.monster.facets.size?.[0] ?? '—' },
    {
      key: 'cr',
      label: 'CR',
      numeric: true,
      width: 72,
      render: (row) => row.monster.challengeLabel.replace('CR ', ''),
    },
    {
      key: 'ac',
      label: 'AC',
      numeric: true,
      width: 56,
      render: (row) => row.monster.derived.find((value) => value.key === 'ac')?.value ?? '—',
    },
    { key: 'hp', label: 'HP', numeric: true, width: 64, render: (row) => row.monster.health.max },
    { key: 'source', label: 'Source', width: 140, render: (row) => row.monster.source },
  ];

  function open(monster: Monster) {
    setSelected(monster.id);
    show(monsterPanel(monster));
  }

  return (
    <DMPage
      eyebrow="Library"
      title="Monsters"
      subbar={
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-8)',
            padding: 'var(--space-10) 0',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-8)',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ width: 280 }}>
              <TextInput
                icon="magnifying-glass"
                placeholder={`Search ${state.status === 'ready' ? state.data.total : ''} monsters`.replace(
                  '  ',
                  ' ',
                )}
                aria-label="Search monsters"
                value={filters.search}
                onChange={(event) => update({ search: event.target.value })}
              />
            </div>

            {/* The two filters that do most of the work are visible; the rest are behind
                "More filters". */}
            {primaryFacet?.options.slice(0, 4).map((option) => (
              <Chip
                key={option.value}
                pressed={(filters.facets[primaryFacet.key] ?? []).includes(option.value)}
                onClick={() => toggleFacet(primaryFacet.key, option.value)}
              >
                {option.label}
              </Chip>
            ))}

            <span
              style={{
                width: 1,
                height: 20,
                background: 'var(--color-border-default)',
                margin: '0 2px',
              }}
            />

            <AppliedChips filters={filters} onRemove={update} />

            <Button variant="tertiary" size="sm" icon="sliders" onClick={() => setMoreOpen(true)}>
              More filters
            </Button>

            <div style={{ flex: 1 }} />

            <Button variant="secondary" size="sm" icon="copy" disabled={selected === null}>
              Clone selected
            </Button>
            <Button variant="primary" size="sm" icon="plus" as={Link} to="/dm/monsters/new">
              New monster
            </Button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-size-10)',
                letterSpacing: 'var(--tracking-caps)',
                textTransform: 'uppercase',
                color: 'var(--color-text-tertiary)',
              }}
              aria-live="polite"
            >
              {state.status === 'ready'
                ? `${state.data.rows.length} of ${state.data.total} · sorted by CR, descending`
                : 'Loading…'}
            </span>
            <div style={{ flex: 1 }} />
            {hasFilters && (
              <Button variant="tertiary" size="sm" onClick={() => setFilters(EMPTY)}>
                Clear filters
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div style={{ padding: 'var(--space-8) var(--space-16)' }}>
        {state.status === 'loading' && <Skeleton count={12} height={32} gap={4} />}

        {state.status === 'error' && (
          <Alert
            tone="danger"
            icon="cloud-slash"
            title="Could not load the monster library"
            actions={
              <Button size="sm" variant="secondary" onClick={state.reload}>
                Try again
              </Button>
            }
          >
            {state.error.message}
          </Alert>
        )}

        {state.status === 'ready' && state.data.rows.length === 0 && hasFilters && (
          <EmptyState
            icon="magnifying-glass"
            title="No monsters match those filters"
            description="Widen the difficulty range, or clear a filter to see more."
            actions={
              <Button variant="secondary" onClick={() => setFilters(EMPTY)}>
                Clear filters
              </Button>
            }
          />
        )}

        {state.status === 'ready' && state.data.rows.length === 0 && !hasFilters && (
          <EmptyState
            icon="skull"
            title="No monsters yet"
            description="Imported library content and your own homebrew both appear here."
            actions={
              <Button variant="primary" icon="plus" as={Link} to="/dm/monsters/new">
                Create a monster
              </Button>
            }
          />
        )}

        {state.status === 'ready' && state.data.rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <Table
              label="Monster library"
              columns={columns}
              rows={state.data.rows.map((monster) => ({ monster }))}
              rowKey={(row) => row.monster.id}
              selectedKey={selected ?? undefined}
              onRowClick={(row) => open(row.monster)}
            />
          </div>
        )}
      </div>

      <MoreFilters
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        facets={facets}
        filters={filters}
        onChange={update}
        onToggleFacet={toggleFacet}
        challenges={ruleset.challengeScale()}
      />
    </DMPage>
  );
}

/** Size, environment, source and the difficulty range — everything past the first two. */
function MoreFilters({
  open,
  onClose,
  facets,
  filters,
  onChange,
  onToggleFacet,
  challenges,
}: {
  open: boolean;
  onClose: () => void;
  facets: FacetDefinition[];
  filters: FilterState;
  onChange: (change: Partial<FilterState>) => void;
  onToggleFacet: (facet: string, value: string) => void;
  challenges: { value: number; label: string }[];
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="More filters"
      description="Everything past creature type. Applied filters appear as chips you can dismiss."
      size="lg"
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-16)' }}>
        <div>
          <SectionHeader sub title="Difficulty" />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-8)',
              flexWrap: 'wrap',
            }}
          >
            <label className="tc-field__label" htmlFor="cr-min">
              From
            </label>
            <select
              id="cr-min"
              className="tc-input tc-select"
              style={{ width: 110 }}
              value={filters.challengeMin ?? ''}
              onChange={(event) =>
                onChange({
                  challengeMin: event.target.value === '' ? undefined : Number(event.target.value),
                })
              }
            >
              <option value="">Any</option>
              {challenges.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  CR {entry.label}
                </option>
              ))}
            </select>

            <label className="tc-field__label" htmlFor="cr-max">
              to
            </label>
            <select
              id="cr-max"
              className="tc-input tc-select"
              style={{ width: 110 }}
              value={filters.challengeMax ?? ''}
              onChange={(event) =>
                onChange({
                  challengeMax: event.target.value === '' ? undefined : Number(event.target.value),
                })
              }
            >
              <option value="">Any</option>
              {challenges.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  CR {entry.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <SectionHeader sub title="Source" />
          <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
            <Chip
              pressed={filters.origin === 'library'}
              onClick={() =>
                onChange({ origin: filters.origin === 'library' ? undefined : 'library' })
              }
            >
              <Icon name="book-open-text" size={12} /> Library only
            </Chip>
            <Chip
              pressed={filters.origin === 'homebrew'}
              onClick={() =>
                onChange({ origin: filters.origin === 'homebrew' ? undefined : 'homebrew' })
              }
            >
              <Icon name="pencil-simple" size={12} /> Homebrew only
            </Chip>
          </div>
        </div>

        {/* Every facet the ruleset declares gets a group, including the primary one — the
            filter bar only had room for its first four options. */}
        {facets.map((facet) => (
          <div key={facet.key}>
            <SectionHeader sub title={facet.label} />
            <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
              {facet.options.map((option) => (
                <Chip
                  key={option.value}
                  pressed={(filters.facets[facet.key] ?? []).includes(option.value)}
                  onClick={() => onToggleFacet(facet.key, option.value)}
                >
                  {option.label}
                </Chip>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
