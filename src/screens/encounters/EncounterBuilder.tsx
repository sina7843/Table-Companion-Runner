/**
 * The encounter builder.
 *
 * Three regions, as the design specifies: a library rail that never leaves the screen, the
 * composition column, and a balance aside. The rail is the point — adding a creature is a
 * plus button on a library row and the screen never navigates, so building a fight is
 * search, add, adjust, repeat.
 *
 * Every essential action is a button reachable by keyboard: add, quantity, hide, remove,
 * present. Nothing here requires a pointer and nothing requires dragging.
 *
 * Selecting a library row fills the shared context panel with the real monster sheet, so a
 * DM can read a stat block and add it without losing their place. The panel stays open for
 * the next candidate, which is what makes three clicks three clicks.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  EmptyState,
  Field,
  HPBar,
  Icon,
  IconButton,
  ListRow,
  NumberInput,
  SectionHeader,
  SegmentedControl,
  Skeleton,
  Switch,
  TextInput,
  Textarea,
} from '../../design-system';
import { DMPage } from '../../app/DMShell';
import { useContextPanel } from '../../app/panelContext';
import { MonsterSheet, monsterEyebrow } from '../monsters/MonsterSheet';
import { relativeTime } from '../campaign/shared';
import {
  useUserId,
  requireRuleset,
  useAsync,
  useRepositories,
  type Character,
  type CharacterId,
  type EncounterTemplate,
  type EncounterTemplateId,
  type Monster,
  type Ruleset,
} from '../../domain';
import { BalancePanel } from './BalancePanel';
import {
  MAX_PER_GROUP,
  addCreature,
  blockingIssues,
  mergeRoster,
  patchEntry,
  removeEntry,
  searchCreatures,
  setPresent,
  summarise,
  validateEncounter,
} from './composition';
import { creatureCount, partyOf, presentParty, rosterOf, startLabel, statusOf } from './shared';

type Source = 'monsters' | 'party' | 'saved';

const SOURCES = [
  { id: 'monsters', label: 'Monsters', icon: 'skull' },
  { id: 'party', label: 'Party', icon: 'users-three' },
  { id: 'saved', label: 'Saved', icon: 'flag-banner' },
];

/** Groups past which the roster outruns the aside and earns its own summary bar. */
const LONG_ROSTER = 4;

/** One creature's experience, asked of the ruleset rather than assumed by the screen. */
function xpFor(rules: Ruleset, monster: Monster): string {
  const rated = rules.encounterDifficulty([{ monster, count: 1 }], []);
  return rated?.metric ? `${rated.metric.value.toLocaleString()} XP` : '';
}

function libraryMeta(rules: Ruleset, monster: Monster): string {
  const armour = monster.derived.find((entry) => entry.key === 'ac')?.value;
  return [
    monster.challengeLabel,
    xpFor(rules, monster),
    armour === undefined ? null : `AC ${armour}`,
    `HP ${monster.health.max}`,
    monster.origin === 'homebrew' ? 'Homebrew' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function characterMeta(character: Character): string {
  return [character.subtitle, `HP ${character.health.current}/${character.health.max}`]
    .filter(Boolean)
    .join(' · ');
}

export function EncounterBuilder({ mode }: { mode: 'create' | 'edit' }) {
  const { encounterId } = useParams();
  const navigate = useNavigate();
  const { campaigns, characters, combats, encounters, monsters } = useRepositories();
  const { show, close } = useContextPanel();
  const userId = useUserId();

  const [draft, setDraft] = useState<EncounterTemplate | null>(null);
  const [source, setSource] = useState<Source>('monsters');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [failure, setFailure] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // The create call is held as a promise rather than fired per load: React runs this
  // effect twice in development, and a second call would leave a stray "Untitled
  // encounter" behind every time the builder opened.
  const creating = useRef<Promise<EncounterTemplate | null> | null>(null);

  const loaded = useAsync(async () => {
    let encounter: EncounterTemplate | null = null;

    if (mode === 'create') {
      // A new encounter is written before the DM types anything, so autosave has an id to
      // write against and navigating away never loses a half-built fight.
      if (!userId) return null;
      creating.current ??= (async () => {
        const [mine, live] = await Promise.all([
          campaigns.listForUser(userId),
          combats.liveForUser(userId),
        ]);
        const focus = mine.find((campaign) => campaign.id === live?.campaignId) ?? mine[0] ?? null;
        if (!focus) return null;
        return encounters.create({ campaignId: focus.id, name: 'Untitled encounter' });
      })();
      encounter = await creating.current;
    } else if (encounterId) {
      encounter = await encounters.byId(encounterId as EncounterTemplateId);
    }
    if (!encounter) return null;

    const [campaign, roster, creatures, siblings, fights] = await Promise.all([
      campaigns.byId(encounter.campaignId),
      characters.listForCampaign(encounter.campaignId),
      monsters.list({ sort: 'challenge-asc' }),
      encounters.listForCampaign(encounter.campaignId),
      combats.listForCampaign(encounter.campaignId),
    ]);

    return { encounter, campaign, roster, creatures, siblings, fights };
  }, ['encounter-builder', mode, encounterId ?? '', userId ?? '']);

  // The context panel keeps whatever JSX it was handed, so a handler closing over `draft`
  // would write a stale roster the second time a DM used it. Every edit goes via the ref.
  const draftRef = useRef<EncounterTemplate | null>(null);

  useEffect(() => {
    if (loaded.status === 'ready' && loaded.data) {
      draftRef.current = loaded.data.encounter;
      setDraft(loaded.data.encounter);
    }
  }, [loaded.status, loaded.data]);

  // A created encounter takes over its own URL, so a reload or the back button lands on
  // the thing that now exists rather than making a second one.
  useEffect(() => {
    if (mode !== 'create' || loaded.status !== 'ready' || !loaded.data) return;
    void navigate(`/dm/encounters/${loaded.data.encounter.id}/edit`, { replace: true });
  }, [mode, loaded.status, loaded.data, navigate]);

  // Autosave, debounced. The design states saving is automatic — an encounter is a
  // document being edited, not a form waiting to be submitted.
  //
  // `pending` is what makes it reliable rather than merely automatic: a debounce that only
  // ever fires on a timer loses the last edit whenever the DM types and immediately
  // clicks Start, so every exit path flushes it first.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<EncounterTemplate | null>(null);

  const write = useCallback(
    (next: EncounterTemplate) => {
      pending.current = null;
      setSaving('saving');
      return encounters.save(next).then(
        () => {
          // A newer edit landed while this one was in flight; that one owns the state.
          if (!pending.current) setSaving('saved');
          setFailure(null);
        },
        (error: unknown) => {
          // Keep it pending so Retry, and the next edit, both send it again.
          pending.current = next;
          setSaving('failed');
          setFailure(error instanceof Error ? error.message : 'That change was not saved.');
        },
      );
    },
    [encounters],
  );

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const next = pending.current;
    return next ? write(next) : Promise.resolve();
  }, [write]);

  const edit = useCallback(
    (change: (current: EncounterTemplate) => EncounterTemplate) => {
      const current = draftRef.current;
      if (!current) return;

      const next = change(current);
      draftRef.current = next;
      pending.current = next;
      setDraft(next);
      setSaving('saving');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        void write(next);
      }, 500);
    },
    [write],
  );

  // Leaving the builder writes whatever is still queued. Without this, the last thing a
  // DM typed is the one thing that does not survive.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (pending.current) void encounters.save(pending.current);
    },
    [encounters],
  );

  // Closing the tab is the one exit React never sees.
  useEffect(() => {
    const onLeave = (event: BeforeUnloadEvent) => {
      if (!pending.current) return;
      void encounters.save(pending.current);
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [encounters]);

  // "/" focuses search, as the design's SearchInput shortcut specifies — but never while
  // the DM is already typing into the name, the notes or the quantity fields.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(?:INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The panel is shared, so a stat block must not follow the DM onto the next screen.
  useEffect(() => close, [close]);

  const data = loaded.status === 'ready' ? loaded.data : null;
  const rules = useMemo(
    () => (data?.campaign ? requireRuleset(data.campaign.systemId) : null),
    [data?.campaign],
  );

  const byId = useMemo(
    () => new Map<string, Monster>((data?.creatures ?? []).map((entry) => [entry.id, entry])),
    [data?.creatures],
  );

  /* ── Editing ──────────────────────────────────────────────────────────────── */

  // Each of these is a pure transform in `composition.ts`; this file only decides when.
  const addMonster = useCallback(
    (monster: Monster) => edit((current) => addCreature(current, monster.id)),
    [edit],
  );
  const changeEntry = (entryId: string, change: { count?: number; hidden?: boolean }) =>
    edit((current) => patchEntry(current, entryId, change));
  const dropEntry = (entryId: string) => edit((current) => removeEntry(current, entryId));
  const markPresent = (characterId: CharacterId, present: boolean) =>
    edit((current) => setPresent(current, characterId, present));
  const mergeFrom = (other: EncounterTemplate) => edit((current) => mergeRoster(current, other));

  /* ── States before the builder can render ─────────────────────────────────── */

  if (loaded.status === 'loading' || (data && !draft)) {
    return (
      <DMPage eyebrow="Encounter template" title="Untitled encounter">
        <div className="tc-page" aria-busy="true">
          <span className="tc-visually-hidden" role="status">
            Opening the builder
          </span>
          <Skeleton count={8} height={44} gap={8} />
        </div>
      </DMPage>
    );
  }

  if (loaded.status === 'error') {
    return (
      <DMPage eyebrow="Encounter template" title="Encounter">
        <div className="tc-page">
          <Alert
            tone="danger"
            title="Could not open the builder"
            actions={
              <Button size="sm" variant="secondary" onClick={loaded.reload}>
                Try again
              </Button>
            }
          >
            {loaded.error.message}
          </Alert>
        </div>
      </DMPage>
    );
  }

  if (!data || !draft || !rules) {
    return (
      <DMPage eyebrow="Encounter template" title="Encounter">
        <div className="tc-page">
          <EmptyState
            icon="flag-banner"
            title="There is nothing to build here"
            description="This encounter may have been deleted, or you have no campaign to build one in yet."
            actions={
              <Button variant="primary" as={Link} to="/dm/encounters">
                Back to encounters
              </Button>
            }
          />
        </div>
      </DMPage>
    );
  }

  /* ── Derived ──────────────────────────────────────────────────────────────── */

  const roster = rosterOf(draft, byId);
  const party = partyOf(data.roster);
  const present = presentParty(data.roster, draft);
  const absent = new Set<string>(draft.absentCharacterIds ?? []);
  const difficulty = rules.encounterDifficulty(roster, present);
  const { status, live } = statusOf(draft, data.fights);

  const summary = summarise(draft, roster, present);
  const issues = validateEncounter(draft, summary);
  const blocking = blockingIssues(issues);

  const start = () => {
    if (live) {
      void navigate(`/dm/combat/${live.id}`);
      return;
    }
    // Flush first: the roster the fight is built from must include whatever the DM
    // changed a quarter of a second ago.
    void flush()
      .then(() => combats.startFromTemplate(draft.id))
      .then((combat) => navigate(`/dm/combat/${combat.id}`))
      .catch((error: unknown) =>
        setFailure(error instanceof Error ? error.message : 'Could not start combat.'),
      );
  };

  const libraryRows = searchCreatures(data.creatures, search);
  const siblings = data.siblings.filter(
    (entry) => entry.id !== draft.id && entry.entries.length > 0,
  );

  const inspect = (monster: Monster) =>
    show({
      eyebrow: monsterEyebrow(monster),
      title: monster.name,
      body: (
        <MonsterSheet
          monster={monster}
          actions={
            <>
              {/* Adding leaves the panel open, so the next candidate is one click away. */}
              <Button variant="primary" size="sm" icon="plus" onClick={() => addMonster(monster)}>
                Add to {draft.name}
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
    });

  // Save feedback is one quiet line that changes word, never a toast and never a spinner
  // over the page. It only becomes loud when a write actually failed.
  const SAVED_LABEL = {
    idle: 'Draft · autosaved',
    saving: 'Saving…',
    saved: 'Saved',
    failed: 'Not saved',
  } as const;

  const railStyle = {
    flex: '1 1 300px',
    maxWidth: 360,
    minWidth: 0,
    alignSelf: 'flex-start',
    position: 'sticky' as const,
    top: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'var(--space-8)',
  };

  return (
    <DMPage
      eyebrow={[
        'Encounter template',
        draft.updatedAt ? `edited ${relativeTime(draft.updatedAt)}` : null,
        data.campaign?.name,
      ]
        .filter(Boolean)
        .join(' · ')}
      title={draft.name || 'Untitled encounter'}
      actions={
        <>
          {difficulty && roster.length > 0 && (
            <Badge tone={difficulty.tone}>{difficulty.label}</Badge>
          )}
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-size-11)',
              color:
                saving === 'failed' ? 'var(--color-danger-text)' : 'var(--color-text-tertiary)',
            }}
            role="status"
            aria-live="polite"
          >
            {SAVED_LABEL[saving]}
          </span>
          <Button
            size="sm"
            variant="secondary"
            icon="eye"
            onClick={() => void flush().then(() => navigate(`/dm/encounters/${draft.id}`))}
          >
            Done
          </Button>
        </>
      }
    >
      <div
        className="tc-page"
        style={{
          display: 'flex',
          // `.tc-page` stacks; the builder is three columns until it runs out of room.
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
        }}
      >
        {/* ── Library rail ─────────────────────────────────────────────────── */}
        <aside style={railStyle} aria-label="Add to this encounter">
          <SegmentedControl
            full
            label="Source"
            items={SOURCES}
            value={source}
            onChange={(id) => setSource(id as Source)}
          />

          {source === 'monsters' && (
            <TextInput
              ref={searchRef}
              icon="magnifying-glass"
              placeholder="Search monsters"
              aria-label="Search monsters"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              suffix={<span className="tc-kbd">/</span>}
            />
          )}

          <div style={{ maxHeight: '58vh', overflowY: 'auto' }}>
            {source === 'monsters' &&
              (libraryRows.length === 0 ? (
                <EmptyState
                  icon="magnifying-glass"
                  title="No creatures match"
                  description="Try a shorter search, or create your own creature."
                  actions={
                    <Button
                      size="sm"
                      variant="secondary"
                      icon="plus"
                      as={Link}
                      to="/dm/monsters/new"
                    >
                      New monster
                    </Button>
                  }
                />
              ) : (
                libraryRows.map((monster) => (
                  <ListRow
                    key={monster.id}
                    static
                    leading={<Avatar name={monster.name} entity="monster" size="sm" />}
                    title={monster.name}
                    meta={libraryMeta(rules, monster)}
                    trailing={
                      // Two explicit buttons rather than a clickable row wrapping them: a
                      // control inside a control is invalid markup and the inner one stops
                      // reaching the keyboard.
                      <>
                        <IconButton
                          icon="info"
                          label={`Read the ${monster.name} stat block`}
                          size="sm"
                          onClick={() => inspect(monster)}
                        />
                        <IconButton
                          icon="plus"
                          label={`Add ${monster.name} to this encounter`}
                          size="sm"
                          onClick={() => addMonster(monster)}
                        />
                      </>
                    }
                  />
                ))
              ))}

            {source === 'party' &&
              (party.length === 0 ? (
                <EmptyState
                  icon="users-three"
                  title="No characters yet"
                  description="Invite players to the campaign and their characters appear here."
                />
              ) : (
                party.map((character) => (
                  <ListRow
                    key={character.id}
                    leading={<Avatar name={character.name} entity="player" size="sm" />}
                    title={character.name}
                    meta={characterMeta(character)}
                    trailing={
                      absent.has(character.id) ? (
                        <IconButton
                          icon="plus"
                          label={`Add ${character.name} to this encounter`}
                          size="sm"
                          onClick={() => markPresent(character.id, true)}
                        />
                      ) : (
                        <Badge tone="success" icon="check">
                          In
                        </Badge>
                      )
                    }
                  />
                ))
              ))}

            {source === 'saved' &&
              (siblings.length === 0 ? (
                <EmptyState
                  icon="flag-banner"
                  title="No other encounters yet"
                  description="Once you have built a fight, you can start the next one from its roster."
                />
              ) : (
                siblings.map((other) => (
                  <ListRow
                    key={other.id}
                    leading={<Icon name="flag-banner" />}
                    title={other.name}
                    meta={`${creatureCount(other)} creatures · ${other.entries.length} groups`}
                    trailing={
                      <IconButton
                        icon="copy"
                        label={`Add everything from ${other.name}`}
                        size="sm"
                        onClick={() => mergeFrom(other)}
                      />
                    }
                  />
                ))
              ))}
          </div>
        </aside>

        {/* ── Composition ──────────────────────────────────────────────────── */}
        <div
          style={{
            flex: '3 1 420px',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-20)',
          }}
        >
          {failure && (
            <Alert
              tone="danger"
              title="That change was not saved"
              actions={
                <Button size="sm" variant="secondary" icon="arrow-clockwise" onClick={flush}>
                  Try again
                </Button>
              }
            >
              {failure} Your edits are still here — nothing has been lost.
            </Alert>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 'var(--space-16)',
            }}
          >
            <Field label="Encounter name">
              {({ id }) => (
                <TextInput
                  id={id}
                  value={draft.name}
                  onChange={(event) =>
                    edit((current) => ({ ...current, name: event.target.value }))
                  }
                />
              )}
            </Field>
            <Field label="Location" help="Shown in the combat top bar.">
              {({ id, describedBy }) => (
                <>
                  <TextInput
                    id={id}
                    aria-describedby={describedBy}
                    list="tc-encounter-locations"
                    value={draft.location ?? ''}
                    onChange={(event) =>
                      edit((current) => ({ ...current, location: event.target.value }))
                    }
                  />
                  <datalist id="tc-encounter-locations">
                    {[
                      ...new Set(
                        data.siblings.map((entry) => entry.location).filter(Boolean) as string[],
                      ),
                    ].map((place) => (
                      <option key={place} value={place} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
          </div>

          {/*
            Warnings sit above the roster rather than beside the start button, because
            every one of them is about something the DM can fix right here.
          */}
          {issues
            .filter((issue) => issue.severity !== 'blocking')
            .map((issue) => (
              <Alert key={issue.key} tone="warning">
                {issue.message}
              </Alert>
            ))}

          <section>
            <SectionHeader
              title="Monsters"
              icon="skull"
              eyebrow={
                summary.groups === 0
                  ? 'Nothing added yet'
                  : `${summary.creatures} creatures · ${summary.groups} groups · ${summary.combatants} combatants with the party`
              }
            />

            {roster.length === 0 ? (
              <EmptyState
                icon="skull"
                title="No monsters in this encounter yet"
                description="Search the library on the left and add creatures, or start from an encounter you have already run."
                actions={
                  <>
                    <Button
                      variant="primary"
                      size="sm"
                      icon="magnifying-glass"
                      onClick={() => {
                        setSource('monsters');
                        searchRef.current?.focus();
                      }}
                    >
                      Search the library
                    </Button>
                    <Button
                      variant="tertiary"
                      size="sm"
                      icon="copy"
                      onClick={() => setSource('saved')}
                    >
                      Start from a saved encounter
                    </Button>
                  </>
                }
              />
            ) : (
              roster.map((entry) => (
                <ListRow
                  key={entry.entryId}
                  leading={<Avatar name={entry.monster.name} entity="monster" size="sm" />}
                  title={entry.monster.name}
                  meta={[
                    entry.monster.challengeLabel,
                    `${xpFor(rules, entry.monster)} each`,
                    entry.count > 1 ? `named #1 – #${entry.count}` : null,
                    entry.hidden ? 'starts hidden' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  static
                  trailing={
                    <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                      <NumberInput
                        value={entry.count}
                        min={1}
                        max={MAX_PER_GROUP}
                        width={44}
                        ariaLabel={`${entry.monster.name} quantity`}
                        onChange={(count) => changeEntry(entry.entryId, { count })}
                      />
                      <IconButton
                        icon="info"
                        label={`Read the ${entry.monster.name} stat block`}
                        size="sm"
                        onClick={() => inspect(entry.monster)}
                      />
                      <IconButton
                        icon={entry.hidden ? 'eye-slash' : 'eye'}
                        label={
                          entry.hidden
                            ? `${entry.monster.name} starts hidden — reveal from the start`
                            : `Hide ${entry.monster.name} until it acts`
                        }
                        size="sm"
                        active={entry.hidden}
                        onClick={() => changeEntry(entry.entryId, { hidden: !entry.hidden })}
                      />
                      <IconButton
                        icon="trash"
                        variant="danger"
                        label={`Remove ${entry.monster.name}`}
                        size="sm"
                        onClick={() => dropEntry(entry.entryId)}
                      />
                    </span>
                  }
                />
              ))
            )}
          </section>

          <section>
            <SectionHeader
              title="Party"
              icon="users-three"
              eyebrow={
                present.length === party.length
                  ? `${party.length} characters`
                  : `${present.length} of ${party.length} present`
              }
            />
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
                  leading={<Avatar name={character.name} entity="player" size="sm" />}
                  title={character.name}
                  meta={character.subtitle}
                  trailing={
                    <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-12)' }}>
                      <span style={{ width: 96 }}>
                        <HPBar current={character.health.current} max={character.health.max} />
                      </span>
                      <Switch
                        checked={!absent.has(character.id)}
                        onChange={(next) => markPresent(character.id, next)}
                        label={`${character.name} is present`}
                        hideLabel
                      />
                    </span>
                  }
                />
              ))
            )}
          </section>

          <section>
            <SectionHeader
              title="Setup notes"
              icon="scroll"
              actions={
                <span className="tc-privacy" data-level="dm-only">
                  <Icon name="eye-slash" size={11} />
                  DM only
                </span>
              }
            />
            <div className="tc-dmzone" style={{ padding: 'var(--space-12)' }}>
              <span className="tc-dmzone__label">
                <Icon name="eye-slash" size={11} />
                Not visible to players
              </span>
              <Textarea
                rows={3}
                aria-label="Setup notes, visible only to you"
                placeholder="How the fight opens, what is hiding, what makes it stop."
                value={draft.notes ?? ''}
                onChange={(event) => edit((current) => ({ ...current, notes: event.target.value }))}
              />
            </div>
          </section>

          {/*
            The large-encounter bar. A sixteen-creature roster is long enough that the
            aside scrolls off on a wrapped layout, and the DM should never have to scroll
            back up to find out what they have built or to start it.
          */}
          {summary.groups >= LONG_ROSTER && (
            <div
              style={{
                position: 'sticky',
                bottom: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-12)',
                flexWrap: 'wrap',
                padding: 'var(--space-10) var(--space-16)',
                background: 'var(--color-surface-secondary)',
                borderTop: '1px solid var(--color-border-default)',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--font-size-10)',
                  letterSpacing: 'var(--tracking-caps)',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-tertiary)',
                }}
              >
                {summary.creatures} creatures · {summary.groups} groups · {summary.combatants}{' '}
                combatants
              </span>
              {difficulty && (
                <span
                  style={{
                    fontSize: 'var(--font-size-12)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {difficulty.detail}
                </span>
              )}
              <div style={{ flex: 1 }} />
              <Button
                size="sm"
                variant="primary"
                icon={status === 'live' ? 'broadcast' : 'sword'}
                disabled={blocking.length > 0}
                onClick={start}
              >
                {startLabel(status)}
              </Button>
            </div>
          )}
        </div>

        {/* ── Summary ──────────────────────────────────────────────────────── */}
        <aside
          style={{
            flex: '1 1 280px',
            maxWidth: 340,
            minWidth: 0,
            alignSelf: 'flex-start',
            position: 'sticky',
            top: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-16)',
          }}
        >
          <section>
            <SectionHeader sub title="This encounter" />
            <dl className="tc-deflist">
              <dt>Creatures</dt>
              <dd>
                {summary.creatures} in {summary.groups} {summary.groups === 1 ? 'group' : 'groups'}
              </dd>
              <dt>Party</dt>
              <dd>
                {summary.present} of {party.length} present
              </dd>
              <dt>Combatants</dt>
              <dd>{summary.combatants}</dd>
              {draft.location && (
                <>
                  <dt>Location</dt>
                  <dd>{draft.location}</dd>
                </>
              )}
            </dl>
          </section>

          <BalancePanel difficulty={difficulty} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
            <Alert tone="info" icon="info">
              Starting combat creates a separate instance. Hit points and conditions change there,
              and this template stays as it is.
            </Alert>

            {/* Blocking issues are stated where the blocked action is, not at the top. */}
            {blocking.map((issue) => (
              <Alert key={issue.key} tone="danger">
                {issue.message}
              </Alert>
            ))}

            <Button
              variant="primary"
              icon={status === 'live' ? 'broadcast' : 'sword'}
              disabled={blocking.length > 0}
              onClick={start}
            >
              {startLabel(status)}
            </Button>
            <Button
              variant="secondary"
              icon="copy"
              onClick={() =>
                void flush()
                  .then(() => encounters.duplicate(draft.id))
                  .then((copy) => navigate(`/dm/encounters/${copy.id}/edit`))
                  .catch((error: unknown) =>
                    setFailure(error instanceof Error ? error.message : 'Could not duplicate.'),
                  )
              }
            >
              Duplicate template
            </Button>
          </div>
        </aside>
      </div>
    </DMPage>
  );
}
