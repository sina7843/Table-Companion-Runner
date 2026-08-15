/**
 * One encounter template.
 *
 * The composition the design specifies: roster, party and DM-only setup notes down the
 * main column, balance and the primary actions in a fixed aside. Reading order is what a
 * DM checks before starting — what is in the fight, who is present, what it will do to
 * them — and the actions sit at the bottom of the aside where that reading ends.
 *
 * The sentence about instances is said three times over: in the eyebrow, in the alert
 * above the start button, and by `Duplicate template` sitting directly under it. A DM who
 * fears damaging a prepared fight will not reuse it, so the repetition earns its space.
 */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  EmptyState,
  HPBar,
  Icon,
  ListRow,
  Modal,
  SectionHeader,
  Skeleton,
} from '../../design-system';
import { DMPage } from '../../app/DMShell';
import { relativeTime } from '../campaign/shared';
import {
  requireRuleset,
  useAsync,
  useRepositories,
  type EncounterTemplateId,
  type Monster,
} from '../../domain';
import { creatureCount, partyOf, rosterOf, startLabel, statusOf } from './shared';

export function EncounterDetail() {
  const { encounterId } = useParams();
  const navigate = useNavigate();
  const { campaigns, characters, combats, encounters, monsters } = useRepositories();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const state = useAsync(async () => {
    const encounter = encounterId
      ? await encounters.byId(encounterId as EncounterTemplateId)
      : null;
    if (!encounter) return null;

    const [campaign, roster, fights, creatures] = await Promise.all([
      campaigns.byId(encounter.campaignId),
      characters.listForCampaign(encounter.campaignId),
      combats.listForCampaign(encounter.campaignId),
      monsters.list(),
    ]);

    const byId = new Map<string, Monster>(creatures.map((monster) => [monster.id, monster]));
    const entries = rosterOf(encounter, byId);
    const party = partyOf(roster);
    const rules = campaign ? requireRuleset(campaign.systemId) : null;

    return {
      encounter,
      campaign,
      party,
      entries,
      ...statusOf(encounter, fights),
      difficulty: rules?.encounterDifficulty(entries, party) ?? null,
    };
  }, ['encounter-detail', encounterId ?? '', version]);

  async function run<T>(work: () => Promise<T>, then?: (result: T) => void) {
    setBusy(true);
    setFailure(null);
    try {
      const result = await work();
      then?.(result);
      setVersion((current) => current + 1);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  if (state.status === 'loading') {
    return (
      <DMPage eyebrow="Encounter template" title="Encounter">
        <div className="tc-page" aria-busy="true">
          <span className="tc-visually-hidden" role="status">
            Loading this encounter
          </span>
          <Skeleton count={6} height={44} gap={8} />
        </div>
      </DMPage>
    );
  }

  if (state.status === 'error') {
    return (
      <DMPage eyebrow="Encounter template" title="Encounter">
        <div className="tc-page">
          <Alert
            tone="danger"
            title="Could not load this encounter"
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

  if (!state.data) {
    return (
      <DMPage eyebrow="Encounter template" title="Encounter">
        <div className="tc-page">
          <EmptyState
            icon="flag-banner"
            title="That encounter is not here"
            description="It may have been deleted, or the link may be out of date."
            actions={
              <Button variant="secondary" as={Link} to="/dm/encounters">
                Back to encounters
              </Button>
            }
          />
        </div>
      </DMPage>
    );
  }

  const { encounter, campaign, party, entries, status, live, difficulty } = state.data;

  const start = () => {
    if (live) {
      void navigate(`/dm/combat/${live.id}`);
      return;
    }
    void run(
      () => combats.startFromTemplate(encounter.id),
      (combat) => void navigate(`/dm/combat/${combat.id}`),
    );
  };

  const eyebrow = [
    'Encounter template',
    encounter.updatedAt ? `edited ${relativeTime(encounter.updatedAt)}` : null,
    campaign?.name,
  ]
    .filter(Boolean)
    .join(' · ');

  const missing = creatureCount(encounter) - entries.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <DMPage
      eyebrow={eyebrow}
      title={encounter.name}
      actions={
        <Button
          size="sm"
          variant="secondary"
          icon="pencil"
          as={Link}
          to={`/dm/encounters/${encounter.id}/edit`}
        >
          Edit
        </Button>
      }
    >
      {/*
        Main column and balance aside, wrapping rather than shrinking: below roughly a
        tablet the aside drops under the roster instead of squeezing the monster rows,
        which is the content a DM is actually reading.
      */}
      <div
        className="tc-page"
        style={{
          display: 'flex',
          // `.tc-page` stacks in a column; this page is two columns until it wraps.
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
        }}
      >
        <div
          style={{
            flex: '1 1 420px',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-20)',
          }}
        >
          {failure && (
            <Alert tone="danger" title="That action did not complete">
              {failure}
            </Alert>
          )}

          {status === 'live' && live && (
            <Alert
              tone="success"
              icon="broadcast"
              title="This encounter is running"
              actions={
                <Button
                  size="sm"
                  variant="primary"
                  icon="broadcast"
                  as={Link}
                  to={`/dm/combat/${live.id}`}
                >
                  Open combat
                </Button>
              }
            >
              Round {live.round}. That fight is a separate instance — nothing you change here
              reaches it.
            </Alert>
          )}

          {missing > 0 && (
            <Alert tone="warning" title="Some creatures are missing">
              {missing} of this encounter&rsquo;s creatures are no longer in the library. They will
              not be added when it starts.
            </Alert>
          )}

          <section>
            <SectionHeader
              title="Monsters"
              eyebrow={`${creatureCount(encounter)} creatures · ${entries.length} groups`}
            />
            {entries.length === 0 ? (
              <EmptyState
                icon="skull"
                title="No monsters in this encounter yet"
                description="Search the library and add creatures, or start from an encounter you have already run."
                actions={
                  <Button
                    variant="primary"
                    size="sm"
                    icon="magnifying-glass"
                    as={Link}
                    to="/dm/monsters"
                  >
                    Search the library
                  </Button>
                }
              />
            ) : (
              entries.map((entry) => (
                <ListRow
                  key={entry.entryId}
                  as={Link}
                  to={`/dm/monsters/${entry.monster.id}`}
                  leading={<Avatar name={entry.monster.name} entity="monster" size="sm" />}
                  title={entry.monster.name}
                  meta={[
                    entry.monster.challengeLabel,
                    entry.monster.origin === 'homebrew' ? 'Homebrew' : null,
                    entry.hidden ? 'starts hidden' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  trailing={<Badge tone="neutral">×{entry.count}</Badge>}
                />
              ))
            )}
          </section>

          <section>
            <SectionHeader title="Party" eyebrow={`${party.length} characters`} />
            {party.length === 0 ? (
              <EmptyState
                icon="users-three"
                title="No characters in this campaign"
                description="Difficulty is rated against the party, so it stays unrated until someone joins."
              />
            ) : (
              party.map((character) => (
                <ListRow
                  key={character.id}
                  as={Link}
                  to={`/dm/characters/${character.id}`}
                  leading={<Avatar name={character.name} entity="player" size="sm" />}
                  title={character.name}
                  meta={character.subtitle}
                  trailing={
                    <span style={{ width: 96, display: 'inline-block' }}>
                      <HPBar current={character.health.current} max={character.health.max} />
                    </span>
                  }
                />
              ))
            )}
          </section>

          {encounter.notes && (
            <section>
              <SectionHeader title="Setup notes" />
              <div className="tc-dmzone" style={{ padding: 'var(--space-12)' }}>
                <span className="tc-dmzone__label">
                  <Icon name="eye-slash" size={11} />
                  Not visible to players
                </span>
                <p
                  style={{
                    margin: 0,
                    fontSize: 'var(--font-size-13)',
                    lineHeight: 1.6,
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {encounter.notes}
                </p>
              </div>
            </section>
          )}
        </div>

        <aside
          style={{
            flex: '0 1 320px',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-16)',
          }}
        >
          <section>
            <SectionHeader sub title="Balance" />
            {difficulty ? (
              <>
                <dl className="tc-deflist">
                  {difficulty.breakdown.map((item) => (
                    <div key={item.label} style={{ display: 'contents' }}>
                      <dt>{item.label}</dt>
                      <dd>{item.value}</dd>
                    </div>
                  ))}
                </dl>
                <div style={{ marginTop: 'var(--space-12)' }}>
                  <div className="tc-progress__label">
                    <span>Difficulty · {difficulty.label.toLowerCase()}</span>
                    <span>{difficulty.fill}%</span>
                  </div>
                  <div
                    className="tc-progress"
                    role="meter"
                    aria-valuenow={difficulty.fill}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Difficulty, ${difficulty.label}`}
                  >
                    <div className="tc-progress__fill" style={{ width: `${difficulty.fill}%` }} />
                  </div>
                </div>
              </>
            ) : (
              <p
                style={{
                  margin: 0,
                  fontSize: 'var(--font-size-13)',
                  color: 'var(--color-text-tertiary)',
                }}
              >
                This game system does not rate encounter difficulty.
              </p>
            )}
          </section>

          {difficulty?.warning && (
            <Alert tone="warning" title="Close to deadly">
              {difficulty.warning}
            </Alert>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
            <Alert tone="info" icon="info">
              Starting combat creates a separate instance. Hit points and conditions change there,
              and this template stays as it is.
            </Alert>

            <Button
              variant="primary"
              icon={status === 'live' ? 'broadcast' : 'sword'}
              disabled={busy}
              onClick={start}
            >
              {startLabel(status)}
            </Button>
            <Button
              variant="secondary"
              icon="copy"
              disabled={busy}
              onClick={() =>
                void run(
                  () => encounters.duplicate(encounter.id),
                  (copy) => void navigate(`/dm/encounters/${copy.id}`),
                )
              }
            >
              Duplicate template
            </Button>
            <Button
              variant="destructive-quiet"
              icon="trash"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              Delete encounter
            </Button>
          </div>
        </aside>
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${encounter.name}?`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              icon="trash"
              disabled={busy}
              onClick={() => {
                setConfirmDelete(false);
                void run(
                  () => encounters.remove(encounter.id),
                  () => void navigate('/dm/encounters'),
                );
              }}
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
