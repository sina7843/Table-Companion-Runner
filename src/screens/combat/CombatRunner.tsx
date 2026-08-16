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
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  ConditionChip,
  DiceButton,
  Icon,
  IconButton,
  InitiativeRow,
  Modal,
  NumberInput,
  RollResult,
  RoundCounter,
  SectionHeader,
  Switch,
  TurnIndicator,
  type ConditionTone,
} from '../../design-system';
import { DMPage } from '../../app/DMShell';
import { BP, useMediaQuery } from '../../app/useMediaQuery';
import { useContextPanel } from '../../app/panelContext';
import { monsterEyebrow } from '../monsters/MonsterSheet';
import {
  type Campaign,
  type Character,
  type CombatInstance,
  type CombatParticipant,
  type Monster,
  type ParticipantId,
  type Roll,
  type Ruleset,
} from '../../domain';
import { CombatPanel } from './CombatPanel';
import { useCombatLog } from './useCombatLog';
// What is left of the transforms this screen used to apply: one read. Everything that
// changed a fight moved behind `onCommand` at TC-P04.
import { targetedParticipant } from '../../domain/combat/actions';
import type { CombatCommand } from '../../domain/combat/commands';
import {
  activeParticipant,
  nextParticipant,
  orderDiffersFromInitiative,
  turnIndex,
} from '../../domain/combat/turns';
import type { CombatCommandOutcome } from '../../domain/data/repositories';

export interface CombatRunnerProps {
  combat: CombatInstance;
  rules: Ruleset;
  campaign: Campaign | null;
  characters: Character[];
  monsters: Map<string, Monster>;
  /**
   * States an intent and resolves to what the authority made of it.
   *
   * Awaited wherever this screen needs the result — a log line naming what a death save came
   * to, the audit row an undo offer points at. The screen never computes that itself: it is
   * not the only device in the fight.
   */
  onCommand: (command: CombatCommand) => Promise<CombatCommandOutcome | null>;
  busy: boolean;
}

const CONDITION_TONE: Record<string, ConditionTone> = {
  buff: 'buff',
  debuff: 'debuff',
  concentration: 'concentration',
  danger: 'danger',
};

/**
 * Mirrors `--duration-flash`, the design system's realtime "this just changed" highlight
 * and the longest thing it permits to animate. Restated here because a timeout cannot read
 * a CSS custom property; if the token moves, this moves with it.
 */
const FLASH_MS = 900;

/** Four chips fit a row; past that the count is honest and the rest open in the panel. */
const CHIPS_ON_A_ROW = 4;

/**
 * One line of the log.
 *
 * A roll shows its total and the arithmetic that produced it — a dropped die struck
 * through rather than removed, because it is still part of what the table may check. A
 * note is not a roll and does not pretend to have a number.
 */
function LogLine({ roll, undo }: { roll: Roll; undo?: { label: string; run: () => void } }) {
  const time = roll.at.slice(11, 16);

  if (roll.dice.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-8)',
          fontSize: 'var(--font-size-12)',
          color: 'var(--color-text-secondary)',
        }}
      >
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
          {time}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <strong>{roll.actor}</strong> · {roll.title}
        </span>
        {/*
          The undo lives on the line it reverses and says what it will put back, so a DM
          correcting the third-from-last change never has to guess which one fires.
        */}
        {undo && (
          <Button size="sm" variant="tertiary" icon="arrow-counter-clockwise" onClick={undo.run}>
            {undo.label}
          </Button>
        )}
      </div>
    );
  }

  return (
    <RollResult
      total={roll.total}
      title={`${roll.actor} — ${roll.title}`}
      outcome={roll.outcome}
      breakdown={
        <>
          {roll.expression} ·{' '}
          {roll.dice.map((die, position) => (
            <span key={position}>
              {position > 0 && ' + '}
              {die.dropped ? <s>{die.value}</s> : die.value}
            </span>
          ))}
          {roll.modifier !== 0 && ` ${roll.modifier > 0 ? '+' : '−'} ${Math.abs(roll.modifier)}`}
          {` · ${time}`}
        </>
      }
    />
  );
}

export function CombatRunner({
  combat,
  rules,
  campaign,

  characters,
  monsters,
  onCommand,
  busy,
}: CombatRunnerProps) {
  const { show, close } = useContextPanel();
  const log = useCombatLog(combat.id, rules.system.id);
  const isDesktop = useMediaQuery(BP.xl);

  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<CombatParticipant | null>(null);
  const [amount, setAmount] = useState(5);
  const [secret, setSecret] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [logOpen, setLogOpen] = useState(isDesktop);
  /**
   * Health changes that can still be put back, keyed by the log line that recorded them.
   *
   * A map rather than a single slot: the design forbids a global stack a DM fires blind,
   * but correcting the change before last is a real thing that happens at a table. Each
   * one is offered on its own line, by name, and disappears once it has been used.
   */
  /**
   * Log line to the audit row it can put back.
   *
   * Undo is the server's — it restores what it recorded rather than what this screen
   * remembers — so all this holds is the sequence number and the sentence to offer.
   */
  const [reversible, setReversible] = useState<Record<string, { seq: number; label: string }>>({});
  /**
   * The row that just changed, for one pass of the design's hit-point flash.
   *
   * One pass of `--duration-flash` rather than anything that loops: a roll happens too
   * often to be an event, and a list that pulses all session is a list a DM stops reading.
   */
  const [flash, setFlash] = useState<{ id: string; kind: 'damage' | 'healing' } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashRow = (participantId: string, kind: 'damage' | 'healing') => {
    setFlash({ id: participantId, kind });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), FLASH_MS);
  };

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  // The panel is shared, so a stat block must not follow the DM onto the next screen.
  useEffect(() => close, [close]);

  const active = activeParticipant(combat);
  const upNext = nextParticipant(combat);
  const index = turnIndex(combat);
  const target = targetedParticipant(combat);
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

  /**
   * Armour class per combatant, resolved once.
   *
   * `deriveCharacter` recomputes a character's whole derived block, and this list redraws
   * on every hit point — so doing it per row per render was thirteen full derives on every
   * keystroke, for a number that does not change during a fight. Keyed by participant so
   * the row lookup stays trivial.
   */
  const armourByParticipant = useMemo(() => {
    const found = new Map<string, string>();

    for (const participant of combat.participants) {
      const source = participant.source;
      const values =
        source.kind === 'character'
          ? (() => {
              const character = characters.find((entry) => entry.id === source.characterId);
              return character ? rules.deriveCharacter(character) : null;
            })()
          : (monsters.get(source.monsterId)?.derived ?? null);

      const value = values?.find((entry) => entry.key === 'ac')?.value;
      if (value !== undefined) found.set(participant.id, `AC ${value}`);
    }

    return found;
  }, [combat.participants, characters, monsters, rules]);

  const armourOf = (participant: CombatParticipant): string | null =>
    armourByParticipant.get(participant.id) ?? null;

  /* ── Acting ───────────────────────────────────────────────────────────────── */

  /**
   * Hit points change immediately. No approval step and no dialog — the design's rule is
   * that correction comes through undo, so the change is kept by name and the tray offers
   * to put it back.
   */
  const changeHealth = async (participantId: ParticipantId, delta: number, actor: string) => {
    if (delta === 0) return;
    const name = combat.participants.find((entry) => entry.id === participantId)?.name ?? 'them';
    const moved = Math.abs(delta);

    // The amount is stated; what it does to the track — temporary hit points, the floor at
    // zero, dropping unconscious — is worked out by the authority from the stored fight.
    const outcome = await onCommand(
      delta < 0
        ? { kind: 'health.damage', participantId, amount: moved }
        : { kind: 'health.heal', participantId, amount: moved },
    );
    if (!outcome) return;

    const label = `${delta < 0 ? `${moved} damage to` : `${moved} healing to`} ${name}`;
    const line = log.note({ actor, title: label });
    setReversible((current) => ({ ...current, [line]: { seq: outcome.seq, label } }));
    flashRow(participantId, delta < 0 ? 'damage' : 'healing');

    // A hit on someone concentrating forces a save. It is rolled here rather than queued
    // behind a dialog, because a prompt the DM has to dismiss is a prompt they start
    // dismissing without reading. The server said whether one is owed.
    if (outcome.concentration) {
      const holder =
        outcome.combat.participants.find(
          (entry) => entry.id === outcome.concentration!.participantId,
        ) ?? null;
      const check = rules.concentrationCheck(outcome.concentration.damage);
      if (check && holder) {
        const evaluated = log.roll({
          actor: holder.name,
          title: check.request.title,
          expression: check.request.expression,
          mode: check.request.mode,
        });
        if (evaluated.total < check.difficulty) {
          const key = rules.concentrationKey();
          if (key) {
            await onCommand({ kind: 'condition.remove', participantId: holder.id, key });
            log.note({ actor: holder.name, title: 'Concentration broken' });
          }
        }
      }
    }
  };

  /**
   * A roll fired from a stat block or an action row.
   *
   * A damage roll lands on the target if there is one, which is what makes the flow
   * attack → damage → apply a single pass rather than a chain of prompts.
   */
  const fireRoll = (actor: string) => (title: string, expression: string) => {
    const evaluated = log.roll({ actor, title, expression, secret });

    const isDamage = /damage/i.test(title);
    if (isDamage && target) {
      void changeHealth(target.id, -evaluated.total, actor);
    }
  };

  /** A DM override: the number becomes what they say, and it is still reversible. */
  const setHealthExactly = async (participantId: ParticipantId, current: number, actor: string) => {
    const outcome = await onCommand({ kind: 'health.override', participantId, current });
    if (!outcome) return;

    const label = `${actor} set to ${current} hit points`;
    const line = log.note({ actor: 'Override', title: label });
    setReversible((held) => ({ ...held, [line]: { seq: outcome.seq, label } }));
  };

  /**
   * A death save, rolled by the server.
   *
   * The die is not this screen's to throw: a death save decides whether a character lives,
   * so a device reporting its own would be a device deciding that. The total comes back with
   * the outcome and is written into the log from there.
   */
  const rollDeathSave = async (participant: CombatParticipant) => {
    const outcome = await onCommand({ kind: 'deathSave.roll', participantId: participant.id });
    if (!outcome?.deathSave) return;

    const line = log.note({
      actor: participant.name,
      title: `Death saving throw: ${outcome.deathSave.total}`,
    });
    setReversible((held) => ({
      ...held,
      [line]: { seq: outcome.seq, label: `death save for ${participant.name}` },
    }));

    if (outcome.deathSave.revived) {
      log.note({ actor: participant.name, title: 'Back on their feet at 1 HP' });
    }
    if (outcome.deathSave.outcome === 'dead') {
      log.note({ actor: participant.name, title: 'Died' });
    }
  };

  /**
   * Fills the panel with whoever is selected, from the current fight.
   *
   * This runs from an effect rather than from the click, because the panel keeps the JSX
   * it was handed: a body built once at open time would show the hit points the combatant
   * had when it opened and write against that stale fight for the rest of the session.
   */
  const paint = (participant: CombatParticipant) => {
    const creature = monsterFor(participant);
    const character = characterFor(participant);

    show({
      eyebrow: creature
        ? `${monsterEyebrow(creature)} · in this combat`
        : `${participant.entityType === 'player' ? 'Character' : 'Ally'} · in this combat`,
      title: participant.name,
      actions: (
        <IconButton
          icon="crosshair"
          size="sm"
          active={participant.targeted}
          label={
            participant.targeted
              ? `${participant.name} is the target`
              : `Target ${participant.name}`
          }
          onClick={() => void onCommand({ kind: 'target.set', participantId: participant.id })}
        />
      ),
      body: (
        <div style={{ padding: 'var(--space-12) var(--space-16)' }}>
          <CombatPanel
            participant={participant}
            rules={rules}
            monster={creature}
            character={character}
            onApplyHealth={(delta) => void changeHealth(participant.id, delta, participant.name)}
            onSetHealth={(current) =>
              void setHealthExactly(participant.id, current, participant.name)
            }
            onSetState={(state) => {
              void onCommand({ kind: 'state.override', participantId: participant.id, state });
              log.note({ actor: 'Override', title: `${participant.name} set to ${state}` });
            }}
            onToggleCondition={(definition) =>
              void onCommand(
                participant.conditions.some((entry) => entry.key === definition.key)
                  ? { kind: 'condition.remove', participantId: participant.id, key: definition.key }
                  : { kind: 'condition.add', participantId: participant.id, key: definition.key },
              )
            }
            onDeathSave={() => void rollDeathSave(participant)}
            onRoll={fireRoll(participant.name)}
          />
          {character && (
            <div style={{ marginTop: 'var(--space-12)' }}>
              <Link to={`/dm/characters/${character.id}`}>Open the full character sheet</Link>
            </div>
          )}
        </div>
      ),
    });
  };

  // Repainting on every change is what keeps the panel's hit points, conditions and death
  // saves the fight's rather than a snapshot of when it was opened.
  const chosen = combat.participants.find((entry) => entry.id === selected) ?? null;
  useEffect(() => {
    if (chosen) paint(chosen);
    // `paint` closes over this render's combat, which is precisely the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combat, selected]);

  /**
   * The undo offered against one log line, or nothing if it has already been used.
   *
   * Reversing appends a correction rather than deleting the line it corrects: the log is a
   * history a DM may read back at the end of a session, so it only ever grows.
   */
  const undoFor = (entry: Roll) => {
    const held = reversible[entry.id];
    if (!held) return undefined;

    return {
      label: `Undo ${held.label}`,
      run: () => {
        // The audit row says what to put back, and undoing appends a correction rather than
        // removing the line it corrects. A second attempt is refused by the authority, which
        // is why the offer is dropped either way.
        void onCommand({ kind: 'undo', seq: held.seq }).then((outcome) => {
          if (outcome) log.note({ actor: 'Correction', title: `Undid ${held.label}` });
        });
        setReversible((current) => {
          const next = { ...current };
          delete next[entry.id];
          return next;
        });
      },
    };
  };

  // The newest entry that can still be put back, for the tray's own shortcut.
  const latestUndo = [...log.party, ...log.secret]
    .map(undoFor)
    .find((entry) => entry !== undefined);

  const rowActions = (participant: CombatParticipant, position: number) => (
    <>
      <IconButton
        icon="drop"
        size="sm"
        label={`Apply ${amount} damage to ${participant.name}`}
        disabled={busy}
        onClick={() => changeHealth(participant.id, -amount, participant.name)}
      />
      <IconButton
        icon="heart"
        size="sm"
        label={`Heal ${participant.name} for ${amount}`}
        disabled={busy}
        onClick={() => changeHealth(participant.id, amount, participant.name)}
      />
      <IconButton
        icon="crosshair"
        size="sm"
        active={participant.targeted}
        label={
          participant.targeted
            ? `${participant.name} is the target — clear it`
            : `Target ${participant.name} for the next damage`
        }
        disabled={busy}
        onClick={() => void onCommand({ kind: 'target.set', participantId: participant.id })}
      />
      <IconButton
        icon="caret-up"
        size="sm"
        label={`Move ${participant.name} earlier in the order`}
        disabled={busy || position === 0}
        onClick={() =>
          void onCommand({ kind: 'turn.move', participantId: participant.id, direction: 'earlier' })
        }
      />
      <IconButton
        icon="caret-down"
        size="sm"
        label={`Move ${participant.name} later in the order`}
        disabled={busy || position === combat.participants.length - 1}
        onClick={() =>
          void onCommand({ kind: 'turn.move', participantId: participant.id, direction: 'later' })
        }
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
        onClick={() => void onCommand({ kind: 'turn.jump', participantId: participant.id })}
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
            onClick={() => void onCommand({ kind: 'turn.previous' })}
          >
            Previous
          </Button>
          <Button
            variant="primary"
            size="sm"
            iconRight="caret-right"
            disabled={busy || combat.participants.length === 0}
            onClick={() => void onCommand({ kind: 'turn.next' })}
          >
            Next turn
          </Button>
          <IconButton
            icon="stop-circle"
            size="sm"
            label="End this combat"
            disabled={busy}
            onClick={() => void onCommand({ kind: 'combat.end' })}
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
                  onClick={() => void onCommand({ kind: 'turn.resort' })}
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
                delta={flash?.id === participant.id ? flash.kind : undefined}
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
                onOpen={() => setSelected(participant.id)}
              />
            );
          })}
        </div>

        {/* ── Roll log and dice tray ───────────────────────────────────────── */}
        <div className="tc-rolllog" data-open={logOpen ? 'true' : undefined}>
          <div style={{ padding: 'var(--space-10) var(--space-16) 0' }}>
            <SectionHeader
              sub
              title="Roll log"
              eyebrow={`${log.party.length + log.secret.length} entries`}
              actions={
                <>
                  {logOpen && (
                    <>
                      <Switch checked={secret} onChange={setSecret} label="Roll secretly" />
                      <Button
                        size="sm"
                        variant="tertiary"
                        onClick={() => setShowAll((open: boolean) => !open)}
                      >
                        {showAll ? 'Show recent' : 'Show all'}
                      </Button>
                    </>
                  )}
                  {/*
                    The log is informative but secondary: on a tablet it starts collapsed so
                    the initiative order keeps the height, and the DM opens it when they
                    want to read back rather than having it take a third of the screen.
                  */}
                  <IconButton
                    icon={logOpen ? 'caret-down' : 'caret-up'}
                    size="sm"
                    label={logOpen ? 'Collapse the roll log' : 'Open the roll log'}
                    onClick={() => setLogOpen((open: boolean) => !open)}
                  />
                </>
              }
            />
          </div>

          {logOpen && (
            <div className="tc-rolllog__body">
              {/*
                Secret rolls live inside a hatched DM zone with a written header, not behind
                a small eye icon: the hatch, the violet edge and the words all say the same
                thing, so a DM can tell from across a table whether what they are about to
                read aloud was ever visible to the party.
              */}
              {log.secret.length > 0 && (
                <div className="tc-dmzone" style={{ padding: 'var(--space-10)' }}>
                  <span className="tc-dmzone__label">
                    <Icon name="eye-slash" size={11} />
                    DM only — not sent to players
                  </span>
                  {(showAll ? log.secret : log.secret.slice(0, 4)).map((entry) => (
                    <LogLine key={entry.id} roll={entry} undo={undoFor(entry)} />
                  ))}
                </div>
              )}

              {(showAll ? log.party : log.party.slice(0, 10)).map((entry) => (
                <LogLine key={entry.id} roll={entry} undo={undoFor(entry)} />
              ))}

              {!showAll && log.party.length > 10 && (
                <button
                  type="button"
                  className="tc-linkish"
                  onClick={() => setShowAll(true)}
                  style={{
                    alignSelf: 'flex-start',
                    background: 'none',
                    border: 0,
                    padding: 0,
                    font: 'inherit',
                    color: 'var(--color-text-link)',
                    cursor: 'pointer',
                  }}
                >
                  {log.party.length - 10} earlier entries
                </button>
              )}

              {log.party.length === 0 && log.secret.length === 0 && (
                <span
                  style={{ fontSize: 'var(--font-size-12)', color: 'var(--color-text-tertiary)' }}
                >
                  Nothing rolled yet. Every roll in this fight is recorded here.
                </span>
              )}
            </div>
          )}

          <div className="tc-dicetray">
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-size-10)',
                letterSpacing: 'var(--tracking-caps)',
                textTransform: 'uppercase',
                color: 'var(--color-text-tertiary)',
              }}
            >
              Dice tray
            </span>
            {['1d20', '1d20 + 5', '2d6 + 3', '1d8 + 4'].map((expression) => (
              <DiceButton
                key={expression}
                expression={expression}
                onClick={() =>
                  log.roll({ actor: active?.name ?? 'DM', title: expression, expression, secret })
                }
              />
            ))}

            <span style={{ width: 1, height: 20, background: 'var(--color-border-default)' }} />

            <NumberInput
              value={amount}
              min={1}
              max={200}
              width={48}
              ariaLabel="Amount to apply"
              onChange={setAmount}
            />
            <Button
              size="sm"
              variant="secondary"
              icon="drop"
              disabled={busy || !target}
              onClick={() => target && changeHealth(target.id, -amount, active?.name ?? 'DM')}
            >
              {target ? `Damage ${target.name}` : 'Damage — no target'}
            </Button>
            <Button
              size="sm"
              variant="tertiary"
              icon="heart"
              disabled={busy || !target}
              onClick={() => target && changeHealth(target.id, amount, active?.name ?? 'DM')}
            >
              Heal
            </Button>

            <div style={{ flex: 1 }} />

            {/*
              The most recent correction is repeated here so the fastest fix — "that was
              wrong, put it back" — is one reach from the dice that caused it. It names its
              target exactly as the line in the log does; there is no bare arrow anywhere.
            */}
            {latestUndo && (
              <Button
                size="sm"
                variant="tertiary"
                icon="arrow-counter-clockwise"
                disabled={busy}
                onClick={latestUndo.run}
              >
                {latestUndo.label}
              </Button>
            )}
          </div>
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
              // The dialog shows what was typed; the fight shows what the authority made of it.
              setEditing({ ...editing, initiative: value });
              void onCommand({
                kind: 'initiative.set',
                participantIds: [editing.id as ParticipantId],
                value,
              });
            }}
          />
        )}
      </Modal>
    </DMPage>
  );
}
