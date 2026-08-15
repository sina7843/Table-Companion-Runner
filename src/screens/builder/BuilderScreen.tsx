/**
 * The guided character builder.
 *
 * Generic by construction: the step list, each step's question, its validation and the
 * review read-back all come from the active ruleset. This file contains no species, no
 * classes, no ability scores — swap the ruleset and the same wizard builds a different
 * system's character.
 *
 * Two compositions, as the design specifies. Desktop is three columns — steps, question,
 * live summary. Mobile is one decision per screen with a sticky Continue and the summary
 * behind a header button: explicitly not a compressed version of the desktop layout.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Drawer,
  EmptyState,
  Icon,
  IconButton,
  SectionHeader,
  Skeleton,
  Stat,
  StatGrid,
  TextInput,
} from '../../design-system';
import { BP, useMediaQuery } from '../../app/useMediaQuery';
import {
  CURRENT_USER_ID,
  requireRuleset,
  useAsync,
  useRepositories,
  type BuilderIssue,
  type BuilderStep,
  type Character,
  type CharacterDraft,
  type CharacterDraftId,
  type DerivedValue,
  type GameSystemId,
  type Ruleset,
} from '../../domain';
import { BuilderFieldControl } from './fields';

/* ── Live summary ───────────────────────────────────────────────────────────── */

/** A value that moved because of the step just completed. */
interface Announcement {
  label: string;
  from: number | string;
  to: number | string;
}

function diffDerived(before: DerivedValue[], after: DerivedValue[]): Announcement[] {
  return after
    .map((value) => {
      const previous = before.find((entry) => entry.key === value.key);
      if (!previous || previous.value === value.value) return null;
      return { label: value.label, from: previous.value, to: value.value };
    })
    .filter((entry): entry is Announcement => entry !== null);
}

function SummaryPanel({
  character,
  derived,
  announcements,
  stepsLeft,
}: {
  character: Character;
  derived: DerivedValue[];
  announcements: Announcement[];
  stepsLeft: BuilderStep[];
}) {
  const headline = derived.filter((value) => typeof value.value === 'number').slice(0, 3);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-16)' }}>
      <SectionHeader
        sub
        title="Character so far"
        actions={
          <Badge tone="neutral" icon="eye">
            Updates live
          </Badge>
        }
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-12)' }}>
        <Avatar name={character.name || 'New character'} entity="player" size="lg" />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 'var(--font-size-15)', fontWeight: 600 }}>
            {character.name || 'Unnamed character'}
          </span>
          <span style={{ fontSize: 'var(--font-size-12)', color: 'var(--color-text-tertiary)' }}>
            {character.subtitle}
          </span>
        </div>
      </div>

      <StatGrid columns={3}>
        <Stat label="HP" value={character.health.max || '—'} />
        {headline
          .filter((value) => value.key !== 'proficiency')
          .slice(0, 2)
          .map((value) => (
            <Stat
              key={value.key}
              label={value.label.split(' ')[0] ?? value.label}
              value={value.value}
            />
          ))}
      </StatGrid>

      <StatGrid columns={3}>
        {character.attributes.map((attribute) => (
          <Stat
            key={attribute.key}
            label={attribute.label}
            value={attribute.value}
            modifier={attribute.modifier}
          />
        ))}
      </StatGrid>

      {/*
        The design's rule: a new player should never have to work out which numbers the
        system moved on their behalf, and an experienced one should be able to check them.
      */}
      {announcements.length > 0 && (
        <Alert tone="info" icon="calculator" title="Updated by this step">
          {announcements.map((entry) => `${entry.label} ${entry.from} → ${entry.to}`).join('. ')}.
          Both stay editable on the review step.
        </Alert>
      )}

      {stepsLeft.length > 0 && (
        <div>
          <SectionHeader sub title="Decisions left" />
          <dl className="tc-deflist">
            {stepsLeft.map((step) => (
              <ItemRow key={step.id} label={step.label} value={step.summary ?? ''} />
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

function ItemRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

/* ── Review ─────────────────────────────────────────────────────────────────── */

function ReviewStep({
  draft,
  ruleset,
  onEdit,
  onName,
}: {
  draft: CharacterDraft;
  ruleset: Ruleset;
  onEdit: (stepId: string) => void;
  onName: (name: string) => void;
}) {
  const groups = ruleset.reviewGroups(draft);
  const issues = ruleset.validateStep(draft, 'review');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-16)' }}>
      <SectionHeader
        eyebrow="Review"
        title={draft.name || 'Your character'}
        actions={
          issues.length === 0 ? (
            <Badge tone="success" icon="check">
              Valid — nothing missing
            </Badge>
          ) : (
            <Badge tone="danger">{issues.length} to fix</Badge>
          )
        }
      />

      <p className="tc-note" style={{ maxWidth: '68ch', color: 'var(--color-text-secondary)' }}>
        Everything below is editable — open any group to return to the step that set it. The
        right-hand column marks which values you chose and which the rules calculated.
      </p>

      <div style={{ maxWidth: 420 }}>
        <label
          className="tc-field__label"
          htmlFor="character-name"
          style={{ marginBottom: 'var(--space-4)' }}
        >
          Name
          <span className="tc-field__req">*</span>
        </label>
        <TextInput
          id="character-name"
          value={draft.name}
          invalid={draft.name.trim().length === 0}
          placeholder="Aria Nightfall"
          onChange={(event) => onName(event.target.value)}
        />
      </div>

      {groups.map((group) => (
        <div key={group.title}>
          <SectionHeader
            sub
            title={group.title}
            actions={
              group.calculated ? (
                <Badge tone="neutral" icon="calculator">
                  Calculated
                </Badge>
              ) : (
                <Button
                  size="sm"
                  variant="tertiary"
                  icon="pencil-simple"
                  onClick={() => onEdit(group.stepId)}
                >
                  Edit
                </Button>
              )
            }
          />
          <dl className="tc-deflist">
            {group.items.map((item) => (
              <ItemRow key={item.label} label={item.label} value={item.value} />
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

/* ── The builder ────────────────────────────────────────────────────────────── */

export function BuilderScreen() {
  const { draftId } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { drafts, campaigns } = useRepositories();
  const isDesktop = useMediaQuery(BP.lg);

  const [draft, setDraft] = useState<CharacterDraft | null>(null);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [showIssues, setShowIssues] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // Load an existing draft, or start one. A draft is created up front so autosave has
  // somewhere to write from the first answer rather than the first completed step.
  const loaded = useAsync(async () => {
    if (draftId) return drafts.byId(draftId as CharacterDraftId);

    const campaignId = search.get('campaign');
    const campaign = campaignId
      ? await campaigns.byId(campaignId as Parameters<typeof campaigns.byId>[0])
      : null;
    const mine = await campaigns.listForUser(CURRENT_USER_ID);
    const target = campaign ?? mine[0] ?? null;

    return drafts.create({
      systemId: (target?.systemId ?? 'dnd5e-2024') as GameSystemId,
      ownerUserId: CURRENT_USER_ID,
      campaignId: target?.id,
    });
  }, ['builder-draft', draftId ?? 'new', search.get('campaign') ?? '']);

  useEffect(() => {
    if (loaded.status === 'ready' && loaded.data) setDraft(loaded.data);
  }, [loaded.status, loaded.data]);

  const ruleset = useMemo(() => (draft ? requireRuleset(draft.systemId) : null), [draft]);

  // Autosave. Debounced so typing a backstory does not write on every keystroke, and
  // keyed on the draft so a stale timer cannot resurrect an older version.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback(
    (next: CharacterDraft) => {
      setDraft(next);
      setSaving('saving');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void drafts.save(next).then(
          () => setSaving('saved'),
          () => setSaving('idle'),
        );
      }, 400);
    },
    [drafts],
  );

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  // The live summary, and what moved since the last step.
  const previousDerived = useRef<DerivedValue[]>([]);
  const preview = useMemo(() => {
    if (!draft || !ruleset) return null;
    const character = ruleset.draftToCharacter(draft);
    return { character, derived: ruleset.deriveCharacter(character) };
  }, [draft, ruleset]);

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  if (loaded.status === 'loading' || !draft || !ruleset || !preview) {
    return (
      <BuilderFrame>
        <div className="tc-page" aria-busy="true">
          <span className="tc-visually-hidden" role="status">
            Opening the builder
          </span>
          <Skeleton count={6} height={44} gap={8} />
        </div>
      </BuilderFrame>
    );
  }

  if (loaded.status === 'error') {
    return (
      <BuilderFrame>
        <div className="tc-page">
          <Alert tone="danger" icon="cloud-slash" title="Could not open the builder">
            {loaded.error.message}
          </Alert>
        </div>
      </BuilderFrame>
    );
  }

  const steps = ruleset.draftSteps(draft);
  const index = Math.max(
    0,
    steps.findIndex((step) => step.id === draft.stepId),
  );
  const step = steps[index];
  const form = step ? ruleset.draftStepForm(draft, step.id) : null;
  const issues = step ? ruleset.validateStep(draft, step.id) : [];
  const blocking = issues.length > 0;

  function goTo(stepId: string) {
    setShowIssues(false);
    setAnnouncements([]);
    persist({ ...draft!, stepId });
  }

  function advance(direction: 1 | -1) {
    if (direction === 1 && blocking) {
      setShowIssues(true);
      return;
    }
    const target = steps[index + direction];
    if (!target) return;

    if (direction === 1) {
      setAnnouncements(diffDerived(previousDerived.current, preview!.derived));
      previousDerived.current = preview!.derived;
    } else {
      setAnnouncements([]);
    }
    goTo(target.id);
  }

  function answer(fieldKey: string, value: unknown) {
    persist(ruleset!.applyChoice(draft!, fieldKey, value));
  }

  async function create() {
    const remaining = ruleset!.validateStep(draft!, 'review');
    if (remaining.length > 0) {
      setShowIssues(true);
      return;
    }

    setCreating(true);
    setFailure(null);
    try {
      const character = ruleset!.draftToCharacter(draft!);
      await drafts.finalise(draft!.id, character);
      navigate(character.campaignId ? `/dm/campaigns/${character.campaignId}/party` : '/play');
    } catch (error) {
      setFailure(
        error instanceof Error ? error.message : 'The character could not be created. Try again.',
      );
      setCreating(false);
    }
  }

  const stepsLeft = steps.slice(index + 1).filter((entry) => entry.id !== 'review');
  const summary = (
    <SummaryPanel
      character={preview.character}
      derived={preview.derived}
      announcements={announcements}
      stepsLeft={stepsLeft}
    />
  );

  const savedLabel =
    saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'Saved just now' : 'Saved';

  const footer = (
    <>
      <Button
        variant="secondary"
        icon="arrow-left"
        disabled={index === 0}
        onClick={() => advance(-1)}
      >
        Back
      </Button>

      {blocking && showIssues && (
        <span style={{ fontSize: 'var(--font-size-13)', color: 'var(--color-text-tertiary)' }}>
          {issues.length === 1
            ? 'One choice remaining on this step'
            : `${issues.length} choices remaining on this step`}
        </span>
      )}

      <div style={{ flex: 1 }} />

      {/* An incomplete character is a legitimate draft, so this never disables. */}
      <Button variant="tertiary" as={Link} to="/play">
        Save and finish later
      </Button>

      {step?.id === 'review' ? (
        <Button variant="primary" icon="check" loading={creating} onClick={() => void create()}>
          Create {draft.name || 'character'}
        </Button>
      ) : (
        <Button
          variant="primary"
          iconRight="arrow-right"
          disabled={blocking && showIssues}
          onClick={() => advance(1)}
        >
          Continue
        </Button>
      )}
    </>
  );

  const question = form ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-20)' }}>
      {form.review ? (
        <ReviewStep
          draft={draft}
          ruleset={ruleset}
          onEdit={goTo}
          onName={(name) => persist({ ...draft, name })}
        />
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-size-10)',
                letterSpacing: 'var(--tracking-caps)',
                textTransform: 'uppercase',
                color: 'var(--color-text-accent)',
              }}
            >
              Step {index + 1}
              {step?.optional ? ' · optional' : ' · required'}
            </span>
            <h3
              style={{
                margin: 0,
                fontFamily: 'var(--font-display)',
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: '-.01em',
              }}
            >
              {form.title}
            </h3>
            {form.intro && (
              <p
                className="tc-note"
                style={{ maxWidth: '68ch', color: 'var(--color-text-secondary)' }}
              >
                {form.intro}
              </p>
            )}
          </div>

          {/* Validation names the missing choice rather than saying the step is wrong. */}
          {showIssues && issues.length > 0 && (
            <Alert tone="danger" icon="warning" title={issues[0]?.message}>
              {issues.length > 1
                ? `${issues.length} choices are still needed on this step.`
                : 'Nothing else on this step is missing.'}
            </Alert>
          )}

          {failure && (
            <Alert tone="danger" title="Could not create the character">
              {failure}
            </Alert>
          )}

          {form.fields.map((field) => (
            <div key={field.key}>
              <SectionHeader
                sub
                title={field.label}
                actions={
                  field.required ? (
                    <Badge
                      tone={
                        showIssues && issues.some((issue) => issue.fieldKey === field.key)
                          ? 'danger'
                          : 'neutral'
                      }
                    >
                      Required
                    </Badge>
                  ) : null
                }
              />
              <BuilderFieldControl
                field={field}
                value={(draft.choices as Record<string, unknown>)[field.key]}
                onChange={(value) => answer(field.key, value)}
                invalid={showIssues && issues.some((issue) => issue.fieldKey === field.key)}
              />
            </div>
          ))}

          {form.grants && form.grants.length > 0 && (
            <div>
              <SectionHeader
                sub
                title={`What this ${form.title.toLowerCase()} gives you`}
                actions={
                  <Badge tone="neutral" icon="calculator">
                    Calculated
                  </Badge>
                }
              />
              <dl className="tc-deflist">
                {form.grants.map((grant) => (
                  <ItemRow key={grant.label} label={grant.label} value={grant.value} />
                ))}
              </dl>
            </div>
          )}
        </>
      )}
    </div>
  ) : (
    <EmptyState icon="compass" title="That step is no longer part of this character" />
  );

  /* ── Desktop: three columns ───────────────────────────────────────────────── */

  if (isDesktop) {
    return (
      <BuilderFrame>
        <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden' }}>
          <div
            style={{
              flex: 'none',
              width: 280,
              borderRight: '1px solid var(--color-border-default)',
              background: 'var(--color-surface-primary)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                flex: 'none',
                padding: 'var(--space-16)',
                borderBottom: '1px solid var(--color-border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
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
                New character · step {index + 1} of {steps.length}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 19,
                  fontWeight: 700,
                  fontVariantCaps: 'small-caps',
                  letterSpacing: '.02em',
                }}
              >
                {draft.name || 'New character'}
              </span>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-12)' }}>
              <StepRail steps={steps} currentIndex={index} issues={issues} onGoTo={goTo} />
            </div>

            <div
              style={{
                flex: 'none',
                padding: 'var(--space-12) var(--space-16)',
                borderTop: '1px solid var(--color-border-subtle)',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--font-size-11)',
                  color: 'var(--color-text-tertiary)',
                }}
                aria-live="polite"
              >
                {savedLabel}
              </span>
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <main
              id="main"
              tabIndex={-1}
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                padding: 'var(--space-24) var(--space-28)',
              }}
            >
              {question}
            </main>
            <div
              style={{
                flex: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-8)',
                padding: 'var(--space-12) var(--space-28)',
                borderTop: '1px solid var(--color-border-default)',
                background: 'var(--color-surface-primary)',
              }}
            >
              {footer}
            </div>
          </div>

          <aside
            style={{
              flex: 'none',
              width: 340,
              borderLeft: '1px solid var(--color-border-default)',
              background: 'var(--color-surface-primary)',
              overflowY: 'auto',
              padding: 'var(--space-16)',
            }}
          >
            {summary}
          </aside>
        </div>
      </BuilderFrame>
    );
  }

  /* ── Mobile: one decision per screen ──────────────────────────────────────── */

  return (
    <BuilderFrame>
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
          <IconButton icon="x" label="Leave the builder" onClick={() => navigate('/play')} />
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
            {form?.title ?? 'Builder'}
          </span>
          <IconButton
            icon="identification-card"
            label="Character summary"
            onClick={() => setSummaryOpen(true)}
          />
        </header>

        <div
          style={{
            flex: 'none',
            padding: 'var(--space-12) var(--space-16)',
            background: 'var(--color-surface-primary)',
            borderBottom: '1px solid var(--color-border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-8)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-size-10)',
                letterSpacing: 'var(--tracking-caps)',
                textTransform: 'uppercase',
                color: 'var(--color-text-tertiary)',
              }}
            >
              Step {index + 1} of {steps.length}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-size-11)',
                color: 'var(--color-text-tertiary)',
              }}
              aria-live="polite"
            >
              {savedLabel}
            </span>
          </div>

          {/* The desktop rail becomes a progress bar; the same data, a tenth of the height. */}
          <div className="tc-wizard__rail">
            {steps.map((entry, position) => (
              <span
                key={entry.id}
                className="tc-wizard__railseg"
                data-state={
                  position < index ? 'complete' : position === index ? 'current' : undefined
                }
              />
            ))}
          </div>
        </div>

        <main
          id="main"
          tabIndex={-1}
          style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-16)' }}
        >
          {question}
        </main>

        <div
          style={{
            flex: 'none',
            display: 'flex',
            gap: 'var(--space-8)',
            padding: 'var(--space-12) var(--space-16)',
            borderTop: '1px solid var(--color-border-default)',
            background: 'var(--color-surface-primary)',
          }}
        >
          <Button
            variant="secondary"
            size="lg"
            icon="arrow-left"
            disabled={index === 0}
            onClick={() => advance(-1)}
          >
            Back
          </Button>
          {step?.id === 'review' ? (
            <Button
              variant="primary"
              size="lg"
              block
              icon="check"
              loading={creating}
              onClick={() => void create()}
            >
              Create
            </Button>
          ) : (
            <Button
              variant="primary"
              size="lg"
              block
              iconRight="arrow-right"
              disabled={blocking && showIssues}
              onClick={() => advance(1)}
            >
              Continue
            </Button>
          )}
        </div>
      </div>

      {/* The summary is an overlay on mobile, not a third of the screen. */}
      <Drawer
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        title="Character so far"
        description={preview.character.subtitle}
      >
        {summary}
      </Drawer>
    </BuilderFrame>
  );
}

/** The builder runs outside both shells: it is a focused task, not a destination. */
function BuilderFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="tc-appsurface" data-density="comfortable">
      {children}
    </div>
  );
}

/** The step list. Completed steps keep a check and stay clickable. */
function StepRail({
  steps,
  currentIndex,
  issues,
  onGoTo,
}: {
  steps: BuilderStep[];
  currentIndex: number;
  issues: BuilderIssue[];
  onGoTo: (stepId: string) => void;
}) {
  return (
    <div className="tc-wizard">
      {steps.map((step, index) => {
        const state =
          index === currentIndex
            ? issues.length > 0
              ? 'error'
              : 'current'
            : index < currentIndex
              ? 'complete'
              : undefined;

        return (
          <button
            key={step.id}
            type="button"
            className="tc-wizard__step"
            data-state={state}
            // Steps ahead are not reachable by clicking: the rules may not know what to
            // ask yet. Everything already answered stays one click away.
            disabled={index > currentIndex}
            onClick={() => onGoTo(step.id)}
          >
            <span className="tc-wizard__num">
              {index < currentIndex ? <Icon name="check" size={11} /> : index + 1}
            </span>
            {step.label}
            {step.optional && <span className="tc-wizard__meta">optional</span>}
          </button>
        );
      })}
    </div>
  );
}
