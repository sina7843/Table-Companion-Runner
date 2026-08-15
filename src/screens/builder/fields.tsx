/**
 * Generic renderers for builder fields.
 *
 * Nothing in this file knows what a species, a class or an ability score is. It knows how
 * to present a single choice, a bounded multiple choice, an assignment of numbers to
 * named slots, and some text. That is the whole reason the wizard is not hard-coded to
 * D&D: a new system emits the same four shapes and gets the same UI.
 */
import { Badge, Field, Icon, ListRow, Stat, TextInput, Textarea } from '../../design-system';
import type { BuilderField } from '../../domain';

export interface FieldProps {
  field: BuilderField;
  value: unknown;
  onChange: (value: unknown) => void;
  /** Set when this field is what is stopping the step from completing. */
  invalid?: boolean;
}

function gridStyle(columns: number | undefined) {
  return columns && columns > 1
    ? {
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(${Math.floor(680 / columns)}px, 1fr))`,
        gap: 'var(--space-8)',
      }
    : undefined;
}

function SingleChoice({ field, value, onChange }: FieldProps) {
  return (
    <div style={gridStyle(field.columns)}>
      {(field.options ?? []).map((option) => (
        <ListRow
          key={option.value}
          title={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-6)' }}>
              {option.label}
              {option.recommended && <Badge tone="accent">Recommended</Badge>}
            </span>
          }
          meta={option.disabled ? option.disabledReason : option.description}
          selected={value === option.value}
          static={option.disabled}
          onClick={option.disabled ? undefined : () => onChange(option.value)}
          trailing={
            value === option.value ? (
              <Badge tone="accent" icon="check">
                Chosen
              </Badge>
            ) : null
          }
        />
      ))}
    </div>
  );
}

function MultiChoice({ field, value, onChange }: FieldProps) {
  const picked = Array.isArray(value) ? (value as string[]) : [];
  const limit = field.choose ?? 1;

  function toggle(option: string) {
    if (picked.includes(option)) {
      onChange(picked.filter((entry) => entry !== option));
      return;
    }
    // At the limit, the next pick replaces the oldest rather than silently doing nothing —
    // a control that ignores a click reads as broken.
    onChange(picked.length >= limit ? [...picked.slice(1), option] : [...picked, option]);
  }

  return (
    <div style={gridStyle(field.columns)}>
      {(field.options ?? []).map((option) => {
        const chosen = picked.includes(option.value);
        return (
          <ListRow
            key={option.value}
            title={option.label}
            meta={option.disabled ? option.disabledReason : option.description}
            selected={chosen}
            static={option.disabled}
            onClick={option.disabled ? undefined : () => toggle(option.value)}
            trailing={
              chosen ? (
                <Badge tone="accent" icon="check">
                  Chosen
                </Badge>
              ) : null
            }
          />
        );
      })}
    </div>
  );
}

/**
 * Assigns a pool of numbers to named slots.
 *
 * Tap a slot to cycle it through the values still unspent, which is the interaction the
 * design describes as "Tap a score to reassign". Every value in the pool can sit in
 * exactly one slot, so the control cannot produce an invalid spread.
 */
function ScoreAssignment({ field, value, onChange }: FieldProps) {
  const assigned = (value ?? {}) as Record<string, number>;
  const pool = field.pool ?? [];
  const slots = field.slots ?? [];

  function cycle(slotKey: string) {
    const used = Object.entries(assigned)
      .filter(([key]) => key !== slotKey)
      .map(([, score]) => score);

    // Values still unspent, plus whatever this slot holds, plus "empty" to come back to.
    const available = pool.filter((score) => !containsOnce(used, score));
    const currentIndex = available.indexOf(assigned[slotKey] ?? Number.NaN);
    const next = available[currentIndex + 1];

    const updated = { ...assigned };
    if (next === undefined) delete updated[slotKey];
    else updated[slotKey] = next;
    onChange(updated);
  }

  const remaining = pool.filter((score) => !containsOnce(Object.values(assigned), score));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-10)' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(72px, 1fr))',
          gap: 'var(--space-6)',
        }}
      >
        {slots.map((slot) => (
          <Stat
            key={slot.key}
            label={slot.label}
            value={assigned[slot.key] ?? '—'}
            interactive
            onClick={() => cycle(slot.key)}
          />
        ))}
      </div>

      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-size-11)',
          color: 'var(--color-text-tertiary)',
        }}
      >
        {remaining.length > 0 ? `Unassigned: ${remaining.join(', ')}` : 'Every score is assigned'}
      </span>
    </div>
  );
}

/** True when `values` contains `score` at least once, removing one occurrence. */
function containsOnce(values: number[], score: number): boolean {
  return values.includes(score);
}

function TextEntry({ field, value, onChange }: FieldProps) {
  const text = typeof value === 'string' ? value : '';
  return field.multiline ? (
    <Textarea value={text} onChange={(event) => onChange(event.target.value)} rows={4} />
  ) : (
    <TextInput value={text} onChange={(event) => onChange(event.target.value)} />
  );
}

export function BuilderFieldControl(props: FieldProps) {
  const { field, invalid } = props;

  const control =
    field.kind === 'single-choice' ? (
      <SingleChoice {...props} />
    ) : field.kind === 'multi-choice' ? (
      <MultiChoice {...props} />
    ) : field.kind === 'score-assignment' ? (
      <ScoreAssignment {...props} />
    ) : (
      <TextEntry {...props} />
    );

  // The design outlines the group carrying the missing choice in crimson, rather than
  // marking the whole step as wrong.
  const wrapper = invalid
    ? {
        padding: 'var(--space-12)',
        border: '1px solid var(--color-danger-border)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--color-danger-subtle)',
      }
    : undefined;

  if (field.kind === 'text') {
    return (
      <Field label={field.label} help={field.help}>
        {() => control}
      </Field>
    );
  }

  return (
    <div>
      <div style={wrapper}>{control}</div>
      {field.help && (
        <span
          style={{
            display: 'block',
            marginTop: 'var(--space-6)',
            fontSize: 'var(--text-helper-size)',
            color: 'var(--color-text-tertiary)',
          }}
        >
          <Icon name="info" size={12} /> {field.help}
        </span>
      )}
    </div>
  );
}
