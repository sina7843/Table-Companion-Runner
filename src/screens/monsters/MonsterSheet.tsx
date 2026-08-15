/**
 * The monster sheet.
 *
 * One component, three containers: a full page for deep links and narrow screens, the
 * docked context panel from the library, and a drawer when opened from an encounter or
 * combat. Identical content in all three — the design's rule is that the panel opened
 * from combat is the same panel opened from the library.
 *
 * Combat data first, prose last. Hit points, conditions and the stat line come before the
 * actions; traits and long-form text sit below them. Everything a DM needs while the
 * creature's turn is running is in the first screen without scrolling.
 *
 * Not a printed stat block. It uses the approved component structure — a header rule, a
 * definition list, an ability grid and `ActionRow`s — rather than reproducing a two-column
 * page of justified serif prose.
 */
import { Fragment } from 'react';
import {
  Badge,
  Button,
  ConditionChip,
  DiceButton,
  HPControl,
  SectionHeader,
  type ConditionTone,
} from '../../design-system';
import { RollReadout, useRoller } from '../../app/useRoller';
import { requireRuleset, type Condition, type Monster, type MonsterAction } from '../../domain';

export interface MonsterSheetProps {
  monster: Monster;
  /**
   * Live state when the creature is an instance in a running fight rather than a library
   * entry. Hit points, conditions and spent resources belong to the instance; editing
   * them never touches the library record.
   */
  instance?: {
    current: number;
    max: number;
    temporary?: number;
    conditions?: Condition[];
    /** "instance 2 of 4" when several copies of the same creature are in the fight. */
    position?: { index: number; total: number };
    onApplyHealth?: (delta: number) => void;
  };
  /**
   * Diverts every roll on this sheet somewhere else — the combat log, when the sheet is
   * open in a fight. Without it the sheet keeps its own local readout.
   */
  onRoll?: (title: string, expression: string) => void;
  /** Primary actions vary by where the sheet was opened from. */
  actions?: React.ReactNode;
  /** A full page has room for two columns; a 440px panel does not. */
  wide?: boolean;
}

/**
 * One action, with its roll controls.
 *
 * Attacks, legendary actions, reactions and spells are all the same row: the design's rule
 * is that every action rolls from here. Recharge and per-day resources are tags carrying
 * their remaining count, because a DM tracking Legendary Resistance on paper is what this
 * product exists to remove.
 */
function ActionRow({
  action,
  onRoll,
}: {
  action: MonsterAction;
  onRoll: (title: string, expression: string) => void;
}) {
  const rolls = action.rolls ?? [
    ...(action.attackBonus ? [{ label: 'Attack', expression: `1d20 ${action.attackBonus}` }] : []),
    ...(action.damage ? [{ label: 'Damage', expression: action.damage }] : []),
  ];

  return (
    <div className="tc-action">
      {action.tier && <span className="tc-action__level">{action.tier.slice(0, 2)}</span>}
      <span className="tc-action__main">
        <span className="tc-action__name">
          {action.name}
          {action.tags?.map((tag) => (
            <Badge key={tag} tone="neutral">
              {tag}
            </Badge>
          ))}
        </span>
        <span className="tc-action__meta">
          {action.attackBonus && <b>{action.attackBonus} to hit</b>}
          {action.damage && <span>{action.damage}</span>}
        </span>
        <span
          style={{
            fontSize: 'var(--font-size-13)',
            lineHeight: 'var(--line-height-normal)',
            color: 'var(--color-text-secondary)',
            maxWidth: '68ch',
          }}
        >
          {action.description}
        </span>
      </span>
      {rolls.length > 0 && (
        <span className="tc-action__rolls">
          {rolls.map((roll) => (
            <DiceButton
              key={roll.label}
              expression={roll.expression}
              label={roll.label}
              primary={roll.label === 'Attack'}
              onClick={() => onRoll(`${action.name} — ${roll.label}`, roll.expression)}
            />
          ))}
        </span>
      )}
    </div>
  );
}

export function MonsterSheet({ monster, instance, actions, wide, onRoll }: MonsterSheetProps) {
  const ruleset = requireRuleset(monster.systemId);
  const roller = useRoller(monster.systemId);
  // A sheet open in a fight logs its rolls; one in the library shows its own last result.
  const fire = onRoll ?? roller.roll;
  const derived = ruleset.deriveMonster(monster);

  // Hit points and challenge already sit in the header and the control, so the definition
  // list carries what is left: speed, senses, saves, resistances, languages.
  const statLine = derived.filter((value) => value.key !== 'hp' && value.key !== 'challenge');

  const health = instance ?? {
    current: monster.health.current,
    max: monster.health.max,
    temporary: monster.health.temporary,
  };

  return (
    <div
      style={{
        padding: 'var(--space-12) var(--space-16)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-16)',
      }}
    >
      {actions && (
        <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap' }}>{actions}</div>
      )}

      {/* Combat data first. */}
      <HPControl
        current={health.current}
        max={health.max}
        temp={health.temporary ?? 0}
        onApply={(delta) => instance?.onApplyHealth?.(delta)}
      />

      {instance && (
        <div
          style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap', alignItems: 'center' }}
        >
          {(instance.conditions ?? []).map((condition) => (
            <ConditionChip
              key={condition.id}
              label={condition.label}
              tone={condition.tone as ConditionTone}
              duration={condition.duration}
            />
          ))}
          <Button variant="tertiary" size="sm" icon="plus">
            Condition
          </Button>
        </div>
      )}

      {!onRoll && <RollReadout roller={roller} />}

      <div className="tc-statblock">
        <div className="tc-statblock__head">
          <span className="tc-statblock__name">{monster.name}</span>
          <span className="tc-statblock__sub">{monster.subtitle}</span>
        </div>

        <div className="tc-statblock__section">
          <dl className="tc-deflist">
            <dt>Challenge</dt>
            <dd>{monster.challengeLabel}</dd>
            {statLine.map((value) => (
              <Fragment key={value.key}>
                <dt>{value.label}</dt>
                <dd>{value.value}</dd>
              </Fragment>
            ))}
          </dl>
        </div>

        <div className="tc-statblock__section">
          <div className="tc-statblock__sectitle">Abilities</div>
          <div
            className="tc-statblock__abilities"
            style={wide ? undefined : { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}
          >
            {monster.attributes.map((attribute) => {
              const modifier = Math.floor((attribute.value - 10) / 2);
              const expression = `1d20 ${modifier >= 0 ? '+' : '−'}${Math.abs(modifier)}`;
              return (
                <button
                  type="button"
                  className="tc-stat"
                  data-interactive="true"
                  key={attribute.key}
                  onClick={() => fire(`${monster.name} — ${attribute.label}`, expression)}
                >
                  <span className="tc-stat__label">{attribute.label}</span>
                  <span className="tc-stat__value">{attribute.value}</span>
                  <span
                    className="tc-stat__mod"
                    data-sign={modifier > 0 ? 'positive' : modifier < 0 ? 'negative' : undefined}
                  >
                    {modifier >= 0 ? `+${modifier}` : modifier}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Every group the ruleset gives back: actions, legendary actions, reactions, spells. */}
      {ruleset.monsterActionGroups(monster).map((group) => (
        <div key={group.key}>
          <SectionHeader
            sub
            title={group.label}
            actions={group.note ? <Badge tone="neutral">{group.note}</Badge> : null}
          />
          {group.entries.map((action) => (
            <ActionRow key={action.name} action={action} onRoll={fire} />
          ))}
        </div>
      ))}

      {/* Prose last. */}
      {monster.traits.length > 0 && (
        <div>
          <SectionHeader sub title="Traits" />
          {monster.traits.map((trait) => (
            <p className="tc-statblock__trait" key={trait.name}>
              <b>{trait.name}.</b> {trait.description}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** The eyebrow above the sheet, which says whether this is a template or an instance. */
export function monsterEyebrow(monster: Monster, instance?: MonsterSheetProps['instance']): string {
  if (!instance) return `Monster · ${monster.source}`;
  const position = instance.position;
  return position
    ? `Monster · in this combat · instance ${position.index} of ${position.total}`
    : 'Monster · in this combat';
}
