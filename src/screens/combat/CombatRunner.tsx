/**
 * Live combat — the DM's command centre.
 *
 * Three columns, no page changes: navigation, workspace, context. The workspace holds the
 * turn control bar and the full initiative order at once, so the things a DM touches every
 * thirty seconds are never more than one pointer move apart, and opening a stat block does
 * not close the fight — the panel is docked in its own column, not floated over the list.
 *
 * The turn is stated four ways, as the design requires: its position in the order, the
 * round counter reading `Round 3 · turn 3 of 13`, the brass pill naming the participant,
 * and on the row itself a marker, a tinted surface and the word `Turn`. Colour is never
 * the only carrier. `Next · Goblin #2` is spelled out so the DM can queue what they say
 * next while still resolving this turn.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  ConditionChip,
  IconButton,
  InitiativeRow,
  Modal,
  NumberInput,
  RoundCounter,
  TurnIndicator,
  type ConditionTone,
} from '../../design-system';
import { DMPage } from '../../app/DMShell';
import { useContextPanel } from '../../app/panelContext';
import { MonsterSheet, monsterEyebrow } from '../monsters/MonsterSheet';
import {
  type Campaign,
  type Character,
  type CombatInstance,
  type CombatParticipant,
  type Monster,
  type ParticipantId,
  type Ruleset,
} from '../../domain';
import {
  activeParticipant,
  endCombat,
  jumpToTurn,
  moveParticipant,
  nextParticipant,
  nextTurn,
  orderDiffersFromInitiative,
  previousTurn,
  resortByInitiative,
  setInitiativeDuringCombat,
  turnIndex,
} from './turns';

export interface CombatRunnerProps {
  combat: CombatInstance;
  rules: Ruleset;
  campaign: Campaign | null;
  characters: Character[];
  monsters: Map<string, Monster>;
  onChange: (next: CombatInstance) => void;
  busy: boolean;
}

const CONDITION_TONE: Record<string, ConditionTone> = {
  buff: 'buff',
  debuff: 'debuff',
  concentration: 'concentration',
  danger: 'danger',
};

/** Four chips fit a row; past that the count is honest and the rest open in the panel. */
const CHIPS_ON_A_ROW = 4;

export function CombatRunner({
  combat,
  rules,
  campaign,

  characters,
  monsters,
  onChange,
  busy,
}: CombatRunnerProps) {
  const { show, close } = useContextPanel();
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<CombatParticipant | null>(null);

  // The panel is shared, so a stat block must not follow the DM onto the next screen.
  useEffect(() => close, [close]);

  const active = activeParticipant(combat);
  const upNext = nextParticipant(combat);
  const index = turnIndex(combat);
  const outOfOrder = useMemo(() => orderDiffersFromInitiative(combat, rules), [combat, rules]);

  const characterFor = (participant: CombatParticipant): Character | null => {
    const source = participant.source;
    if (source.kind !== 'character') return null;
    return characters.find((entry) => entry.id === source.characterId) ?? null;
  };

  const monsterFor = (participant: CombatParticipant): Monster | null => {
    const source = participant.source;
    return source.kind === 'monster' ? (monsters.get(source.monsterId) ?? null) : null;
  };

  /** The armour class a DM needs mid-fight, from whichever record backs the combatant. */
  const armourOf = (participant: CombatParticipant): string | null => {
    const character = characterFor(participant);
    const values = character
      ? rules.deriveCharacter(character)
      : (monsterFor(participant)?.derived ?? null);
    if (!values) return null;

    const armour = values.find((value) => value.key === 'ac')?.value;
    return armour === undefined ? null : `AC ${armour}`;
  };

  const open = (participant: CombatParticipant) => {
    setSelected(participant.id);

    const creature = monsterFor(participant);

    if (creature) {
      show({
        eyebrow: `${monsterEyebrow(creature)} · in this combat`,
        title: participant.name,
        body: (
          <MonsterSheet
            monster={creature}
            instance={{
              current: participant.health.current,
              max: participant.health.max,
              temporary: participant.health.temporary,
              conditions: participant.conditions,
            }}
          />
        ),
      });
      return;
    }

    const character = characterFor(participant);

    show({
      eyebrow: `${participant.entityType === 'player' ? 'Character' : 'Ally'} · in this combat`,
      title: participant.name,
      body: (
        <div className="tc-page">
          <dl className="tc-deflist">
            <dt>Identity</dt>
            <dd>{participant.subtitle || '—'}</dd>
            <dt>Hit points</dt>
            <dd>
              {participant.health.current} / {participant.health.max}
              {participant.health.temporary > 0 && ` (+${participant.health.temporary} temp)`}
            </dd>
            <dt>Initiative</dt>
            <dd>{participant.initiative ?? 'Not rolled'}</dd>
            <dt>Armour</dt>
            <dd>{armourOf(participant) ?? '—'}</dd>
          </dl>
          {character && (
            <Link to={`/dm/characters/${character.id}`}>Open the full character sheet</Link>
          )}
        </div>
      ),
    });
  };

  const rowActions = (participant: CombatParticipant, position: number) => (
    <>
      <IconButton
        icon="caret-up"
        size="sm"
        label={`Move ${participant.name} earlier in the order`}
        disabled={busy || position === 0}
        onClick={() => onChange(moveParticipant(combat, participant.id, -1))}
      />
      <IconButton
        icon="caret-down"
        size="sm"
        label={`Move ${participant.name} later in the order`}
        disabled={busy || position === combat.participants.length - 1}
        onClick={() => onChange(moveParticipant(combat, participant.id, 1))}
      />
      <IconButton
        icon="list-numbers"
        size="sm"
        label={`Set ${participant.name}'s initiative`}
        disabled={busy}
        onClick={() => setEditing(participant)}
      />
      <IconButton
        icon="caret-right"
        size="sm"
        label={`Give the turn to ${participant.name}`}
        disabled={busy || participant.id === combat.activeParticipantId}
        onClick={() => onChange(jumpToTurn(combat, participant.id))}
      />
    </>
  );

  return (
    <DMPage
      eyebrow={[campaign?.name, combat.location, `Round ${combat.round}`]
        .filter(Boolean)
        .join(' · ')}
      title={`${combat.name} — live`}
      actions={
        <Badge tone="success" icon="broadcast" solid>
          Live
        </Badge>
      }
      subbar={
        <div className="tc-combatbar">
          <RoundCounter
            round={combat.round}
            turn={index >= 0 ? index + 1 : undefined}
            of={index >= 0 ? combat.participants.length : undefined}
          />
          {active && <TurnIndicator state="active">{active.name}</TurnIndicator>}
          {upNext && upNext.id !== active?.id && (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-size-11)',
                letterSpacing: 'var(--tracking-caps)',
                textTransform: 'uppercase',
                color: 'var(--color-text-tertiary)',
              }}
            >
              Next · {upNext.name}
            </span>
          )}

          <div style={{ flex: 1 }} />

          <Button
            variant="tertiary"
            size="sm"
            icon="caret-left"
            disabled={busy}
            onClick={() => onChange(previousTurn(combat))}
          >
            Previous
          </Button>
          <Button
            variant="primary"
            size="sm"
            iconRight="caret-right"
            disabled={busy || combat.participants.length === 0}
            onClick={() => onChange(nextTurn(combat))}
          >
            Next turn
          </Button>
          <IconButton
            icon="stop-circle"
            size="sm"
            label="End this combat"
            disabled={busy}
            onClick={() => onChange(endCombat(combat, new Date().toISOString()))}
          />
        </div>
      }
    >
      <div className="tc-combat">
        {outOfOrder && (
          <div style={{ padding: 'var(--space-12) var(--space-16) 0' }}>
            <Alert
              tone="info"
              actions={
                <Button
                  size="sm"
                  variant="secondary"
                  icon="list-numbers"
                  disabled={busy}
                  onClick={() => onChange(resortByInitiative(combat, rules))}
                >
                  Sort by initiative
                </Button>
              }
            >
              The order no longer matches the numbers. It stays as you arranged it until you ask for
              a re-sort.
            </Alert>
          </div>
        )}

        {/*
          `.tc-initlist` arms the design's container queries: the action cluster is the
          first thing to go when the column narrows, and knowing who is in the fight is
          the last. That is what makes this list work on a tablet without a second layout.
        */}
        <div className="tc-initlist" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {combat.participants.map((participant, position) => {
            const chips = participant.conditions.slice(0, CHIPS_ON_A_ROW);
            const spare = participant.conditions.length - chips.length;

            return (
              <InitiativeRow
                key={participant.id}
                name={participant.name}
                entity={participant.entityType}
                initiative={participant.initiative}
                current={participant.health.current}
                max={participant.health.max}
                temp={participant.health.temporary}
                state={participant.state === 'waiting' ? undefined : participant.state}
                selected={participant.id === selected}
                dmOnly={
                  participant.visibility === 'dm-only' || participant.visibility === 'private'
                }
                deathSaves={participant.deathSaves}
                sub={[participant.subtitle, armourOf(participant)].filter(Boolean).join(' · ')}
                conditions={
                  <>
                    {chips.map((condition) => (
                      <ConditionChip
                        key={condition.id}
                        label={condition.label}
                        tone={CONDITION_TONE[condition.tone] ?? 'neutral'}
                        duration={condition.duration}
                      />
                    ))}
                    {spare > 0 && <ConditionChip label={`+${spare} more`} />}
                  </>
                }
                actions={rowActions(participant, position)}
                onOpen={() => open(participant)}
              />
            );
          })}
        </div>
      </div>

      {/*
        Setting a number mid-fight is a small, exact job, so it gets a small, exact dialog
        rather than an inline field that fights the row's container queries.
      */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={`${editing?.name ?? 'Combatant'} — initiative`}
        description="Changing a number does not move anyone. Sort by initiative when you want it to."
        size="sm"
        footer={
          <Button variant="secondary" onClick={() => setEditing(null)}>
            Done
          </Button>
        }
      >
        {editing && (
          <NumberInput
            value={editing.initiative ?? 0}
            min={-10}
            max={50}
            width={64}
            ariaLabel={`${editing.name} initiative`}
            onChange={(value) => {
              const next = setInitiativeDuringCombat(combat, [editing.id as ParticipantId], value);
              setEditing(next.participants.find((entry) => entry.id === editing.id) ?? editing);
              onChange(next);
            }}
          />
        )}
      </Modal>
    </DMPage>
  );
}
