/**
 * What the context panel holds for one combatant in a fight.
 *
 * Hit points first, then conditions, then death saves, then the stat block — because in a
 * fight the DM opens a creature to change its hit points far more often than to read its
 * lore. Every roll fired from here goes to the combat log rather than a local readout.
 *
 * No dialogs: applying damage, adding a condition and rolling a death save all happen in
 * place. The design's rule is that correction comes through undo, not through a confirm.
 */
import {
  Badge,
  Button,
  ConditionChip,
  HPControl,
  SectionHeader,
  type ConditionTone,
} from '../../design-system';
import { MonsterSheet } from '../monsters/MonsterSheet';
import type {
  Character,
  CombatParticipant,
  ConditionDefinition,
  Monster,
  Ruleset,
} from '../../domain';

export interface CombatPanelProps {
  participant: CombatParticipant;
  rules: Ruleset;
  monster: Monster | null;
  character: Character | null;
  onApplyHealth: (delta: number) => void;
  onToggleCondition: (definition: ConditionDefinition) => void;
  onDeathSave: () => void;
  onRoll: (title: string, expression: string) => void;
}

export function CombatPanel({
  participant,
  rules,
  monster,
  character,
  onApplyHealth,
  onToggleCondition,
  onDeathSave,
  onRoll,
}: CombatPanelProps) {
  const held = new Set(participant.conditions.map((condition) => condition.key));
  const saves = participant.deathSaves;
  const outcome = saves ? rules.deathSaveOutcome(saves) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-16)' }}>
      <HPControl
        current={participant.health.current}
        max={participant.health.max}
        temp={participant.health.temporary}
        onApply={onApplyHealth}
      />

      {/*
        Death saves sit directly under the hit points, because that is the only place a
        character gets to zero and the roll is the next thing that happens.
      */}
      {rules.capabilities.deathSaves && saves && outcome && (
        <section>
          <SectionHeader
            sub
            title="Death saves"
            actions={
              <Badge
                tone={outcome === 'dead' ? 'danger' : outcome === 'stable' ? 'success' : 'warning'}
              >
                {outcome === 'pending' ? 'Rolling' : outcome === 'stable' ? 'Stable' : 'Dead'}
              </Badge>
            }
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-12)',
              flexWrap: 'wrap',
            }}
          >
            <span className="tc-init__deaths">
              <span>
                Successes
                <span className="tc-init__deathpips">
                  {[0, 1, 2].map((index) => (
                    <span
                      key={index}
                      className="tc-init__deathpip"
                      data-kind="success"
                      data-filled={index < saves.successes ? 'true' : undefined}
                    />
                  ))}
                </span>
              </span>
              <span>
                Failures
                <span className="tc-init__deathpips">
                  {[0, 1, 2].map((index) => (
                    <span
                      key={index}
                      className="tc-init__deathpip"
                      data-kind="failure"
                      data-filled={index < saves.failures ? 'true' : undefined}
                    />
                  ))}
                </span>
              </span>
            </span>
            <Button
              size="sm"
              variant="primary"
              icon="dice-six"
              disabled={outcome !== 'pending'}
              onClick={onDeathSave}
            >
              Roll a death save
            </Button>
          </div>
        </section>
      )}

      <section>
        <SectionHeader sub title="Conditions" eyebrow={`${participant.conditions.length} active`} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-6)' }}>
          {rules.conditions.map((definition) => {
            const on = held.has(definition.key);
            return (
              <ConditionChip
                key={definition.key}
                label={definition.label}
                icon={definition.icon}
                tone={on ? (definition.tone as ConditionTone) : 'neutral'}
                duration={
                  on
                    ? participant.conditions.find((entry) => entry.key === definition.key)?.duration
                    : undefined
                }
                onClick={() => onToggleCondition(definition)}
                className={on ? undefined : 'tc-cond--off'}
              />
            );
          })}
        </div>
      </section>

      {monster && (
        <MonsterSheet
          monster={monster}
          onRoll={onRoll}
          instance={{
            current: participant.health.current,
            max: participant.health.max,
            temporary: participant.health.temporary,
            conditions: participant.conditions,
          }}
        />
      )}

      {character && (
        <section>
          <SectionHeader sub title="Actions" />
          {rules.sheetContent(character, 'actions').rollables?.map((entry) => (
            <div
              key={entry.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-8)',
                padding: 'var(--space-6) 0',
                borderBottom: '1px solid var(--color-border-subtle)',
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 600 }}>{entry.name}</span>
                {entry.meta && entry.meta.length > 0 && (
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--font-size-11)',
                      color: 'var(--color-text-tertiary)',
                    }}
                  >
                    {entry.meta.join(' · ')}
                  </span>
                )}
              </span>
              {/* Attack then damage, in that order, exactly as the sheet shows them. */}
              {entry.rolls?.map((roll) => (
                <Button
                  key={roll.label}
                  size="sm"
                  variant={roll.label === 'Attack' ? 'primary' : 'secondary'}
                  onClick={() =>
                    onRoll(`${character.name} — ${entry.name} ${roll.label}`, roll.expression)
                  }
                >
                  {roll.label} {roll.expression}
                </Button>
              ))}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
