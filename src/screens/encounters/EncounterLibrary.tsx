/**
 * Saved encounters.
 *
 * A table, for the same reason the monster library is one: a DM choosing tonight's fight
 * is comparing counts, difficulty and when they last touched it, and those compare in
 * columns. Status leads the row because it decides which action the DM wants — a running
 * encounter offers Resume, one already run offers Run again, a fresh one offers Start.
 *
 * Difficulty is computed against the party as it is today rather than stored, so a
 * level-up changes what this table says.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Icon,
  IconButton,
  ListRow,
  Modal,
  Skeleton,
  Table,
  type TableColumn,
} from '../../design-system';
import { DMPage } from '../../app/DMShell';
import { relativeTime } from '../campaign/shared';
import {
  CURRENT_USER_ID,
  requireRuleset,
  useAsync,
  useRepositories,
  type Campaign,
  type EncounterDifficulty,
  type EncounterTemplate,
  type EncounterTemplateId,
  type Monster,
} from '../../domain';
import {
  creatureCount,
  participantSummary,
  presentParty,
  rosterOf,
  startLabel,
  statusOf,
  type EncounterStatus,
} from './shared';

interface Row extends Record<string, unknown> {
  encounter: EncounterTemplate;
  status: EncounterStatus;
  liveCombatId: string | null;
  participants: string;
  creatures: number;
  difficulty: EncounterDifficulty | null;
}

const STATUS_BADGE: Record<EncounterStatus, { label: string; tone: 'success' | 'neutral' }> = {
  live: { label: 'Live now', tone: 'success' },
  run: { label: 'Run before', tone: 'neutral' },
  prepared: { label: 'Prepared', tone: 'neutral' },
};

function StatusBadge({ status }: { status: EncounterStatus }) {
  const { label, tone } = STATUS_BADGE[status];
  if (status === 'live') {
    return (
      <Badge tone={tone} icon="broadcast" solid>
        {label}
      </Badge>
    );
  }
  return (
    <Badge tone={tone} icon={status === 'run' ? 'check' : undefined}>
      {label}
    </Badge>
  );
}

const NUMBER = new Intl.NumberFormat('en-GB');

export function EncounterLibrary() {
  const { campaigns, characters, combats, encounters, monsters } = useRepositories();
  const navigate = useNavigate();

  const [options, setOptions] = useState<Row | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<EncounterTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const state = useAsync(async () => {
    const mine = await campaigns.listForUser(CURRENT_USER_ID);

    // The same focus rule the DM home uses: the campaign in play, else the most recent.
    const live = await combats.liveForUser(CURRENT_USER_ID);
    const focus: Campaign | null =
      mine.find((campaign) => campaign.id === live?.campaignId) ?? mine[0] ?? null;

    if (!focus) return { focus: null, rows: [] as Row[] };

    const [templates, roster, fights, creatures] = await Promise.all([
      encounters.listForCampaign(focus.id),
      characters.listForCampaign(focus.id),
      combats.listForCampaign(focus.id),
      monsters.list(),
    ]);

    const rules = requireRuleset(focus.systemId);
    const byId = new Map<string, Monster>(creatures.map((monster) => [monster.id, monster]));

    const rows: Row[] = templates.map((encounter) => {
      const entries = rosterOf(encounter, byId);
      const { status, live: running } = statusOf(encounter, fights);
      return {
        encounter,
        status,
        liveCombatId: running?.id ?? null,
        participants: participantSummary(entries),
        creatures: creatureCount(encounter),
        difficulty: rules.encounterDifficulty(entries, presentParty(roster, encounter)),
      };
    });

    // Running first, then most recently edited: the fight that is happening now is never
    // something a DM should have to scroll for.
    rows.sort((a, b) => {
      if ((a.status === 'live') !== (b.status === 'live')) return a.status === 'live' ? -1 : 1;
      return (b.encounter.updatedAt ?? '').localeCompare(a.encounter.updatedAt ?? '');
    });

    return { focus, rows };
  }, ['encounter-library', version]);

  const reload = () => {
    setVersion((current) => current + 1);
  };

  async function run<T>(work: () => Promise<T>, then?: (result: T) => void) {
    setBusy(true);
    setFailure(null);
    try {
      const result = await work();
      then?.(result);
      reload();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  const start = (row: Row) => {
    if (row.liveCombatId) {
      void navigate(`/dm/combat/${row.liveCombatId}`);
      return;
    }
    void run(
      () => combats.startFromTemplate(row.encounter.id),
      (combat) => void navigate(`/dm/combat/${combat.id}`),
    );
  };

  const duplicate = (encounterId: EncounterTemplateId) => {
    setOptions(null);
    void run(() => encounters.duplicate(encounterId));
  };

  const remove = (encounterId: EncounterTemplateId) => {
    setConfirmDelete(null);
    void run(() => encounters.remove(encounterId));
  };

  const columns: TableColumn<Row>[] = [
    {
      key: 'status',
      label: 'Status',
      width: 128,
      render: (row) => <StatusBadge status={row.status} />,
    },
    { key: 'name', label: 'Encounter', primary: true, render: (row) => row.encounter.name },
    {
      key: 'participants',
      label: 'Participants',
      render: (row) => (
        <span style={{ color: 'var(--color-text-secondary)' }}>{row.participants}</span>
      ),
    },
    { key: 'creatures', label: 'Creatures', numeric: true, width: 84 },
    {
      key: 'difficulty',
      label: 'Difficulty',
      width: 104,
      render: (row) =>
        row.difficulty ? (
          <Badge tone={row.difficulty.tone}>{row.difficulty.label}</Badge>
        ) : (
          <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
        ),
    },
    {
      key: 'metric',
      label: 'Adj. XP',
      numeric: true,
      width: 88,
      render: (row) => (row.difficulty?.metric ? NUMBER.format(row.difficulty.metric.value) : '—'),
    },
    {
      key: 'edited',
      label: 'Last edited',
      width: 116,
      render: (row) => (
        <span style={{ color: 'var(--color-text-tertiary)' }}>
          {relativeTime(row.encounter.updatedAt) || 'Never'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      width: 200,
      render: (row) => (
        <span className="tc-table__rowactions">
          <Button
            size="sm"
            variant={row.status === 'live' ? 'primary' : 'secondary'}
            icon={row.status === 'live' ? 'broadcast' : 'sword'}
            disabled={busy}
            onClick={() => start(row)}
          >
            {startLabel(row.status)}
          </Button>
          <IconButton
            icon="copy"
            label={`Duplicate ${row.encounter.name}`}
            size="sm"
            disabled={busy}
            onClick={() => duplicate(row.encounter.id)}
          />
          <IconButton
            icon="dots-three"
            label={`More actions for ${row.encounter.name}`}
            size="sm"
            onClick={() => setOptions(row)}
          />
        </span>
      ),
    },
  ];

  const actions = (
    <Button variant="primary" size="sm" icon="plus" as={Link} to="/dm/encounters/new">
      New encounter
    </Button>
  );

  const title = 'Encounters';
  const eyebrow = state.status === 'ready' ? (state.data.focus?.name ?? 'No campaign') : 'Session';

  if (state.status === 'loading') {
    return (
      <DMPage eyebrow="Session" title={title} actions={actions}>
        <div className="tc-page" aria-busy="true">
          <span className="tc-visually-hidden" role="status">
            Loading prepared encounters
          </span>
          <Skeleton count={8} height={44} gap={8} />
        </div>
      </DMPage>
    );
  }

  if (state.status === 'error') {
    return (
      <DMPage eyebrow="Session" title={title} actions={actions}>
        <div className="tc-page">
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
        </div>
      </DMPage>
    );
  }

  const { focus, rows } = state.data;

  return (
    <DMPage eyebrow={eyebrow} title={title} actions={actions}>
      <div className="tc-page">
        {failure && (
          <Alert tone="danger" title="That action did not complete">
            {failure}
          </Alert>
        )}

        {!focus && (
          <EmptyState
            icon="users-three"
            title="No campaigns yet"
            description="An encounter belongs to a campaign. Create one and its prepared fights live here."
            actions={
              <Button variant="primary" icon="plus" as={Link} to="/campaigns/new">
                New campaign
              </Button>
            }
          />
        )}

        {focus && rows.length === 0 && (
          <EmptyState
            icon="flag-banner"
            title="No encounters yet"
            description="An encounter is a reusable template. Starting one creates a separate combat, so the same fight can be run twice without losing what happened the first time."
            actions={
              <Button variant="primary" icon="plus" as={Link} to="/dm/encounters/new">
                Build an encounter
              </Button>
            }
          />
        )}

        {focus && rows.length > 0 && (
          <>
            <div style={{ overflowX: 'auto' }}>
              <Table
                label="Saved encounters"
                columns={columns}
                rows={rows}
                rowKey={(row) => row.encounter.id}
                onRowClick={(row) => void navigate(`/dm/encounters/${row.encounter.id}`)}
              />
            </div>
            <p
              style={{
                margin: 0,
                fontSize: 'var(--font-size-12)',
                color: 'var(--color-text-tertiary)',
              }}
            >
              {rows.length} encounters in {focus.name}. Starting one creates a separate combat and
              leaves the template as it is.
            </p>
          </>
        )}
      </div>

      {/*
        The overflow menu, as a dialog rather than a popover: it is reached from a table
        row, it needs a focus trap and an Escape either way, and the design system has no
        menu primitive to reuse. Delete lives in here so it is never one mis-click away.
      */}
      <Modal
        open={options !== null}
        onClose={() => setOptions(null)}
        title={options?.encounter.name ?? 'Encounter options'}
        description={options ? `${options.creatures} creatures · ${options.participants}` : ''}
        size="sm"
      >
        {options && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <ListRow
              as={Link}
              to={`/dm/encounters/${options.encounter.id}`}
              leading={<Icon name="flag-banner" />}
              title="Open encounter"
              meta="Roster, party and setup notes"
            />
            <ListRow
              as={Link}
              to={`/dm/encounters/${options.encounter.id}/edit`}
              leading={<Icon name="pencil" />}
              title="Edit encounter"
              meta="Change the roster and who is present"
            />
            <ListRow
              leading={<Icon name="copy" />}
              title="Duplicate template"
              meta="A separate copy with the same roster"
              onClick={() => duplicate(options.encounter.id)}
            />
            <ListRow
              leading={<Icon name="trash" />}
              title="Delete encounter"
              meta="Combats already run from it are kept"
              onClick={() => {
                setConfirmDelete(options.encounter);
                setOptions(null);
              }}
            />
          </div>
        )}
      </Modal>

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title={`Delete ${confirmDelete?.name ?? 'this encounter'}?`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              icon="trash"
              disabled={busy}
              onClick={() => confirmDelete && remove(confirmDelete.id)}
            >
              Delete encounter
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
          The template is removed. Combats already run from it keep their logs and are not affected.
        </p>
      </Modal>
    </DMPage>
  );
}
