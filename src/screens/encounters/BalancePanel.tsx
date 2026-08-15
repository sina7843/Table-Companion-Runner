/**
 * The balance summary, shared by the encounter detail and the builder.
 *
 * Everything here is printed as the ruleset stated it — the breakdown rows, the label, the
 * bar position, the warning. Nothing on this side does arithmetic on any of it, which is
 * what keeps the difficulty maths in one place and out of the UI.
 */
import { Alert, SectionHeader } from '../../design-system';
import type { EncounterDifficulty } from '../../domain';

export function BalancePanel({ difficulty }: { difficulty: EncounterDifficulty | null }) {
  if (!difficulty) {
    return (
      <section>
        <SectionHeader sub title="Balance" />
        <p
          style={{
            margin: 0,
            fontSize: 'var(--font-size-13)',
            color: 'var(--color-text-tertiary)',
          }}
        >
          This game system does not rate encounter difficulty.
        </p>
      </section>
    );
  }

  return (
    <>
      <section>
        <SectionHeader sub title="Balance" />
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
      </section>

      {difficulty.warning && (
        <Alert tone="warning" title="Close to deadly">
          {difficulty.warning}
        </Alert>
      )}
    </>
  );
}
