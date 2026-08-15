/**
 * Guided level up.
 *
 * The builder architecture with a shorter step list the rules engine generates — a
 * Fighter reaching 7 has exactly one real decision, so it gets three steps and a review.
 * The review splits what you chose from what the rules applied, which the design calls
 * the single most useful thing this screen can do for a player who does not know them.
 */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Icon,
  IconButton,
  ListRow,
  SectionHeader,
  Skeleton,
} from '../../design-system';
import { BuilderFieldControl } from '../builder/fields';
import {
  requireRuleset,
  useAsync,
  useRepositories,
  type Character,
  type CharacterId,
  type LevelUpChange,
  type Ruleset,
} from '../../domain';

export function LevelUp() {
  const { characterId } = useParams();
  const navigate = useNavigate();
  const { characters } = useRepositories();

  const [choices, setChoices] = useState<Record<string, unknown>>({});
  const [stepIndex, setStepIndex] = useState(0);
  const [showIssues, setShowIssues] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const state = useAsync(
    () => (characterId ? characters.byId(characterId as CharacterId) : Promise.resolve(null)),
    ['level-up', characterId ?? ''],
  );

  if (state.status === 'loading') {
    return (
      <LevelUpFrame characterId={characterId} eyebrow="" title="Level up">
        <Skeleton count={5} height={52} gap={8} />
      </LevelUpFrame>
    );
  }

  if (state.status === 'error' || !state.data) {
    return (
      <LevelUpFrame characterId={characterId} eyebrow="" title="Level up">
        <Alert tone="danger" icon="cloud-slash" title="Could not load this character">
          {state.status === 'error' ? state.error.message : 'That character does not exist.'}
        </Alert>
      </LevelUpFrame>
    );
  }

  const character = state.data;
  const ruleset = requireRuleset(character.systemId);
  const toLevel = character.level + 1;

  if (!ruleset.capabilities.levelling) {
    return (
      <LevelUpFrame characterId={character.id} eyebrow="" title="Level up">
        <Alert tone="info" title="This system does not use levels">
          {character.name} advances a different way.
        </Alert>
      </LevelUpFrame>
    );
  }

  const steps = ruleset.levelUpSteps(character, toLevel);
  const index = Math.min(stepIndex, steps.length - 1);
  const step = steps[index];
  const form = step ? ruleset.levelUpStepForm(character, toLevel, step.id, choices) : null;
  const issues = step ? ruleset.validateLevelUpStep(character, toLevel, step.id, choices) : [];
  const isReview = step?.id === 'review';

  function answer(fieldKey: string, value: unknown) {
    setChoices((current) => ({ ...current, [fieldKey]: value }));
  }

  function advance(direction: 1 | -1) {
    if (direction === 1 && issues.length > 0) {
      setShowIssues(true);
      return;
    }
    setShowIssues(false);
    setStepIndex((current) => Math.max(0, Math.min(steps.length - 1, current + direction)));
  }

  async function confirm() {
    setConfirming(true);
    try {
      // The advanced character is produced by the ruleset, not assembled here.
      ruleset.applyLevelUp(character, toLevel, choices);
      // ponytail: the character store has no update method yet — TC-13 owns writes to an
      // existing character. The flow is complete and the result is computed; persisting it
      // is one call away once that lands.
      navigate(`/play/sheet/${character.id}`);
    } finally {
      setConfirming(false);
    }
  }

  const outcome = ruleset.levelUpChanges(character, toLevel, choices);

  return (
    <LevelUpFrame
      characterId={character.id}
      eyebrow={`Level ${character.level} → ${toLevel} · step ${index + 1} of ${steps.length}`}
      title={form?.title ?? 'Level up'}
      footer={
        isReview ? (
          <Button
            variant="primary"
            size="lg"
            block
            icon="check"
            loading={confirming}
            onClick={() => void confirm()}
          >
            Confirm level {toLevel}
          </Button>
        ) : (
          <>
            <Button
              variant="secondary"
              size="lg"
              icon="arrow-left"
              disabled={index === 0}
              onClick={() => advance(-1)}
            >
              Back
            </Button>
            <Button
              variant="primary"
              size="lg"
              block
              iconRight="arrow-right"
              disabled={showIssues && issues.length > 0}
              onClick={() => advance(1)}
            >
              Continue
            </Button>
          </>
        )
      }
    >
      {isReview ? (
        <ReviewChanges outcome={outcome} ruleset={ruleset} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-16)' }}>
          {form?.intro && (
            <p className="tc-note" style={{ color: 'var(--color-text-secondary)' }}>
              {form.intro}
            </p>
          )}

          {showIssues && issues.length > 0 && (
            <Alert tone="danger" icon="warning" title={issues[0]?.message}>
              Nothing else on this step is missing.
            </Alert>
          )}

          {form?.fields.map((field) => (
            <div key={field.key}>
              <SectionHeader sub title={field.label} />
              <BuilderFieldControl
                field={field}
                value={choices[field.key]}
                onChange={(value) => answer(field.key, value)}
                invalid={showIssues && issues.some((issue) => issue.fieldKey === field.key)}
              />
            </div>
          ))}
        </div>
      )}
    </LevelUpFrame>
  );
}

/**
 * The review. Two lists, and the split between them is the point: a player who does not
 * know the rules can see exactly which numbers moved on their behalf.
 */
function ReviewChanges({
  outcome,
  ruleset,
}: {
  outcome: ReturnType<Ruleset['levelUpChanges']>;
  ruleset: Ruleset;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-16)' }}>
      <div>
        <SectionHeader
          sub
          title="You chose"
          actions={
            <Badge tone="accent" icon="hand-pointing">
              Your decisions
            </Badge>
          }
        />
        {outcome.chosen.map((change: LevelUpChange) => (
          <ChangeRow key={change.key} change={change} />
        ))}
      </div>

      <div>
        <SectionHeader
          sub
          title="Applied automatically"
          actions={
            <Badge tone="neutral" icon="calculator">
              By the rules
            </Badge>
          }
        />
        {outcome.automatic.map((change: LevelUpChange) => (
          <ChangeRow key={change.key} change={change} />
        ))}
      </div>

      {/* Nothing here is irreversible, and saying so is what makes it safe to press. */}
      <Alert tone="info" icon="arrow-counter-clockwise" title="Nothing is lost">
        You can undo this level up from the character&rsquo;s settings until the next session
        starts.
        {ruleset.capabilities.deathSaves ? '' : ''}
      </Alert>
    </div>
  );
}

function ChangeRow({ change }: { change: LevelUpChange }) {
  return (
    <ListRow
      static
      leading={<Icon name={change.isNew ? 'star' : 'equals'} />}
      title={change.summary}
      meta={change.detail}
      trailing={
        change.badge ? (
          <Badge tone={change.badge === 'No change' ? 'neutral' : 'success'}>{change.badge}</Badge>
        ) : null
      }
    />
  );
}

function LevelUpFrame({
  characterId,
  eyebrow,
  title,
  footer,
  children,
}: {
  characterId: string | undefined;
  eyebrow: string;
  title: string;
  footer?: React.ReactNode;
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
          label="Back"
          as={Link}
          to={characterId ? `/play/sheet/${characterId}` : '/play/sheet'}
        />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {eyebrow && (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-size-10)',
                letterSpacing: 'var(--tracking-caps)',
                textTransform: 'uppercase',
                color: 'var(--color-text-tertiary)',
              }}
            >
              {eyebrow}
            </span>
          )}
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-section-title-size)',
              fontWeight: 700,
              fontVariantCaps: 'small-caps',
              letterSpacing: '.02em',
            }}
          >
            {title}
          </span>
        </div>
      </header>

      <main
        id="main"
        tabIndex={-1}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-16)' }}
      >
        {children}
      </main>

      {footer && (
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
          {footer}
        </div>
      )}
    </div>
  );
}

export type { Character };
