/**
 * The player's combat screen — the same screen in five states.
 *
 * When it is not their turn it is a monitor. When it is, the header is replaced by a brass
 * command band and the actions come to the thumb. That shift in emphasis is the whole
 * design, and it happens without motion: the band takes the header's place rather than
 * animating over it.
 *
 * Everything the player may not see is absent rather than hidden: `visibleParticipants`
 * filters the order, so a DM's unrevealed creature does not appear as a greyed row, a
 * count, or a gap. Rolls are filtered by the same rule the DM's log splits on.
 *
 * Actions open one sheet holding the whole outcome — roll, what it means, and what to do
 * about it — instead of a chain of dialogs.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Badge,
  Banner,
  Button,
  ConditionChip,
  ConnectionStatus,
  DeathSaves,
  DiceButton,
  EmptyState,
  HPBar,
  InitiativeRow,
  ListRow,
  RollResult,
  RoundCounter,
  SectionHeader,
  SegmentedControl,
  Sheet,
  Skeleton,
  Stat,
  type ConditionTone,
} from '../../design-system';
import { PlayerPage } from '../../app/PlayerShell';
import { useConnection } from '../../app/useConnection';
import { useCombatLog } from '../combat/useCombatLog';
import { applyDeathSave, applyHealth, setTargeted, targetedParticipant } from '../combat/actions';
import { activeParticipant, nextParticipant, nextTurn, turnIndex } from '../combat/turns';
import {
  ACTIONS_ON_THE_THUMB,
  breakdownOf,
  damageRollFor,
  isLowHealth,
  ownParticipant,
  playerOrder,
  quickActions,
} from './turn';
import {
  CURRENT_USER_ID,
  requireRuleset,
  useAsync,
  useRepositories,
  visibleRolls,
  type Character,
  type CombatInstance,
  type Ruleset,
  type Viewer,
} from '../../domain';

/** A roll the player has fired but not yet resolved. One sheet, not a chain. */
interface Pending {
  name: string;
  attack?: { total: number; expression: string; breakdown: string };
  damage?: { total: number; expression: string; breakdown: string };
  targetName: string | null;
}

const CONDITION_TONE: Record<string, ConditionTone> = {
  buff: 'buff',
  debuff: 'debuff',
  concentration: 'concentration',
  danger: 'danger',
};

const ROLL_MODES = [
  { id: 'normal', label: 'Normal' },
  { id: 'advantage', label: 'Advantage' },
  { id: 'disadvantage', label: 'Disadvantage' },
];

export function PlayerCombat() {
  const { campaigns, characters, combats } = useRepositories();
  const connection = useConnection();

  const [combat, setCombat] = useState<CombatInstance | null>(null);
  const [mode, setMode] = useState('normal');
  const [pending, setPending] = useState<Pending | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const loaded = useAsync(async () => {
    const live = await combats.liveForUser(CURRENT_USER_ID);
    if (!live) return null;

    const [campaign, roster] = await Promise.all([
      campaigns.byId(live.campaignId),
      characters.listForCampaign(live.campaignId),
    ]);
    if (!campaign) return null;

    // This route IS the player's device, so the viewer is a player whatever the fixture
    // session says — the signed-in fixture user happens to be the DM, and reading their
    // role here would show this screen the unrevealed creatures a player must never see.
    // TC-13's auth layer replaces the id; the role is a property of the surface.
    const viewer: Viewer = { userId: CURRENT_USER_ID, role: 'player' };
    const mine = roster.find((entry) => entry.ownerUserId === CURRENT_USER_ID) ?? roster[0] ?? null;

    return { combat: live, campaign, characters: roster, viewer, character: mine };
  }, ['player-combat']);

  useEffect(() => {
    if (loaded.status === 'ready' && loaded.data) setCombat(loaded.data.combat);
  }, [loaded.status, loaded.data]);

  const change = (next: CombatInstance) => {
    setCombat(next);
    void combats.save(next).then(
      () => {
        setFailure(null);
        connection.reportSuccess();
      },
      (error: unknown) => {
        setFailure(error instanceof Error ? error.message : 'That did not reach the table.');
        connection.reportFailure();
      },
    );
  };

  const rules = useMemo(
    () =>
      loaded.status === 'ready' && loaded.data
        ? requireRuleset(loaded.data.campaign.systemId)
        : null,
    [loaded.status, loaded.data],
  );

  const log = useCombatLog(
    combat?.id ?? loaded.data?.combat.id ?? ('' as CombatInstance['id']),
    loaded.data?.campaign.systemId ?? ('' as never),
  );

  /* ── States before there is a fight to show ─────────────────────────────── */

  if (loaded.status === 'loading') {
    return (
      <PlayerPage title="Combat">
        <div className="tc-page" aria-busy="true">
          <span className="tc-visually-hidden" role="status">
            Looking for a fight
          </span>
          <Skeleton count={6} height={44} gap={8} />
        </div>
      </PlayerPage>
    );
  }

  if (loaded.status === 'error') {
    return (
      <PlayerPage title="Combat">
        <div className="tc-page">
          <Alert
            tone="danger"
            title="Could not reach the table"
            actions={
              <Button variant="secondary" onClick={loaded.reload}>
                Try again
              </Button>
            }
          >
            {loaded.error.message}
          </Alert>
        </div>
      </PlayerPage>
    );
  }

  if (!loaded.data || !combat || !rules) {
    return (
      <PlayerPage title="Combat">
        <div className="tc-page">
          <EmptyState
            icon="sword"
            title="No combat is running"
            description="When your DM starts a fight, it appears here and this tab carries a badge on your turn."
            actions={
              <Button variant="secondary" as={Link} to="/play">
                Back to home
              </Button>
            }
          />
        </div>
      </PlayerPage>
    );
  }

  const { viewer, character } = loaded.data;
  const me = ownParticipant(combat, character);
  const order = playerOrder(combat, viewer);
  const active = activeParticipant(combat);
  const upNext = nextParticipant(combat);
  const myTurn = me !== null && active?.id === me.id;
  const target = targetedParticipant(combat);
  const index = turnIndex(combat);

  /* ── Combat ended ───────────────────────────────────────────────────────── */

  if (combat.status === 'ended') {
    return (
      <PlayerPage eyebrow={combat.name} title="Combat">
        <Banner tone="info" icon="check">
          This fight is over. Your character keeps everything that happened in it.
        </Banner>
        <div className="tc-page">
          {me && (
            <section>
              <SectionHeader sub title="How you came out of it" />
              <HPBar
                current={me.health.current}
                max={me.health.max}
                temp={me.health.temporary}
                showUnit
              />
              {me.state === 'unconscious' && (
                <Alert tone="warning" title="You are still down">
                  Ask your DM about a heal or a rest before the next fight.
                </Alert>
              )}
            </section>
          )}

          <section>
            <SectionHeader sub title="Recent rolls" />
            {visibleRolls(viewer, log.party)
              .slice(0, 8)
              .map((entry) => (
                <RollResult
                  key={entry.id}
                  total={entry.total}
                  title={`${entry.actor} — ${entry.title}`}
                  outcome={entry.outcome}
                  breakdown={`${entry.expression} · ${entry.at.slice(11, 16)}`}
                />
              ))}
          </section>
        </div>
      </PlayerPage>
    );
  }

  /* ── Acting ─────────────────────────────────────────────────────────────── */

  const fire = (name: string, label: string, expression: string, entryKey: string) => {
    const attack = log.roll({
      actor: character?.name ?? 'You',
      title: `${name} ${label}`,
      expression,
      mode: mode as 'normal' | 'advantage' | 'disadvantage',
    });

    // The damage roll follows automatically because a separate tap for it is a modal
    // chain by another name. On a miss the sheet simply ends at the outcome.
    const damageRoll = character ? damageRollFor(rules, character, entryKey) : null;

    const damage =
      label === 'Attack' && damageRoll
        ? log.roll({
            actor: character?.name ?? 'You',
            title: `${name} damage`,
            expression: damageRoll.expression,
          })
        : null;

    setPending({
      name,
      attack: {
        total: attack.total,
        expression,
        breakdown: breakdownOf(attack.dice, attack.modifier),
      },
      ...(damage
        ? {
            damage: {
              total: damage.total,
              expression: damageRoll!.expression,
              breakdown: breakdownOf(damage.dice, damage.modifier),
            },
          }
        : {}),
      targetName: target?.name ?? null,
    });
  };

  const rollDeathSave = () => {
    if (!me) return;
    const request = rules.deathSaveRequest();
    if (!request) return;

    const evaluated = log.roll({
      actor: character?.name ?? 'You',
      title: request.title,
      expression: request.expression,
    });
    change(applyDeathSave(combat, me.id, evaluated, rules).combat);
  };

  const endTurn = () => {
    // A player ends their own turn by handing it on. The advance itself is the shared,
    // tested transform the DM's screen uses, so the round moves on a wrap exactly once
    // and a defeated combatant is stepped over on both devices identically.
    if (!me) return;
    change(nextTurn(combat));
    log.note({ actor: character?.name ?? 'You', title: 'Ended their turn' });
  };

  const down = me?.state === 'unconscious';
  const lowHealth = isLowHealth(me);

  return (
    <>
      {/*
        The command band replaces the header when it is the player's turn. Down replaces it
        with the danger band instead — a player at zero has exactly one thing to do.
      */}
      {down ? (
        <header className="tc-mobile__header tc-turnband tc-turnband--down">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="tc-turnband__title">Unconscious — 0 HP</div>
            <div className="tc-turnband__sub">
              Round {combat.round} · {myTurn ? 'your turn · roll a death saving throw' : 'waiting'}
            </div>
          </div>
        </header>
      ) : myTurn ? (
        <header className="tc-mobile__header tc-turnband">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="tc-turnband__title">Your turn</div>
            <div className="tc-turnband__sub">
              Round {combat.round} · {character?.name ?? 'You'} · turn {index + 1} of {order.length}
            </div>
          </div>
          <Button variant="secondary" onClick={endTurn}>
            End Turn
          </Button>
        </header>
      ) : (
        <header className="tc-mobile__header">
          <div className="tc-topbar__titles">
            <span className="tc-topbar__eyebrow">{combat.name}</span>
            <span className="tc-topbar__title">Combat</span>
          </div>
          <ConnectionStatus state={connection.state} />
        </header>
      )}

      {connection.state !== 'live' && (
        <Banner tone="warning" icon="broadcast">
          Reconnecting. Your last roll was saved and the fight is still running.
        </Banner>
      )}
      {connection.restored && (
        <Banner tone="info" icon="check">
          Back in sync. Nothing you did was lost.
        </Banner>
      )}
      {failure && (
        <Banner tone="danger" icon="cloud-slash">
          {failure} It is saved on this phone and will be sent when the table is back.
        </Banner>
      )}

      <main className="tc-mobile__content" id="main" tabIndex={-1}>
        {/* ── Down: the one thing to do ─────────────────────────────────── */}
        {down && me && (
          <div className="tc-page">
            <section>
              <span className="tc-topbar__eyebrow">
                Death saves · 3 successes stabilise, 3 failures kill
              </span>
              <DeathSaves
                successes={me.deathSaves?.successes ?? 0}
                failures={me.deathSaves?.failures ?? 0}
                outcome={
                  rules.deathSaveOutcome(me.deathSaves ?? { successes: 0, failures: 0 }) ??
                  undefined
                }
              />
            </section>

            <DiceButton
              label="Death saving throw"
              expression="1d20"
              primary
              onClick={rollDeathSave}
            />

            <Alert tone="danger" title="A natural 20 puts you back on your feet">
              Any healing removes this state and resets both counts. Your DM can correct either one.
            </Alert>

            <section>
              <SectionHeader sub title="Who can help" />
              {order
                .filter(
                  (entry) =>
                    entry.entityType === 'player' &&
                    entry.id !== me.id &&
                    entry.state !== 'defeated' &&
                    entry.state !== 'unconscious',
                )
                .map((entry) => (
                  <ListRow
                    key={entry.id}
                    static
                    title={entry.name}
                    meta={entry.subtitle}
                    trailing={<HPBar current={entry.health.current} max={entry.health.max} />}
                  />
                ))}
            </section>
          </div>
        )}

        {/* ── Your turn: the actions come to the thumb ──────────────────── */}
        {!down && myTurn && character && (
          <div className="tc-turnpanel">
            <SegmentedControl
              full
              label="Roll mode"
              items={ROLL_MODES}
              value={mode}
              onChange={setMode}
            />

            <div className="tc-turnpanel__grid">
              {quickActions(rules, character)
                .slice(0, ACTIONS_ON_THE_THUMB)
                .map((entry) => (
                  <DiceButton
                    key={entry.key}
                    label={entry.name}
                    expression={entry.expression}
                    primary={entry.label === 'Attack'}
                    onClick={() => fire(entry.name, entry.label, entry.expression, entry.entryKey)}
                  />
                ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)' }}>
              {target ? (
                <Badge tone="accent" icon="crosshair">
                  Target · {target.name}
                </Badge>
              ) : (
                <Badge tone="neutral" icon="crosshair">
                  No target
                </Badge>
              )}
              <span
                style={{ fontSize: 'var(--font-size-12)', color: 'var(--color-text-tertiary)' }}
              >
                Tap a row below to choose
              </span>
            </div>
          </div>
        )}

        {/* ── Not your turn: monitoring ─────────────────────────────────── */}
        {!down && !myTurn && (
          <div className="tc-turnstrip">
            <RoundCounter round={combat.round} turn={index + 1} of={order.length} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{ fontSize: 'var(--font-size-13)', color: 'var(--color-text-secondary)' }}
              >
                {active ? `${active.name} is acting` : 'Waiting to start'}
              </div>
              {upNext?.id === me?.id && <div className="tc-topbar__eyebrow">You are next</div>}
            </div>
          </div>
        )}

        {/* ── Own state, always ─────────────────────────────────────────── */}
        {me && !down && (
          <div className="tc-page" style={{ paddingBottom: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-12)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <HPBar
                  current={me.health.current}
                  max={me.health.max}
                  temp={me.health.temporary}
                  showUnit
                />
              </div>
              {character && <Stat label="AC" value={armourOf(rules, character)} />}
            </div>

            {lowHealth && (
              <Alert tone="warning" title="You are badly hurt">
                One more hit could put you down. Ask for healing, or take cover.
              </Alert>
            )}

            {me.conditions.length > 0 && (
              <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
                {me.conditions.map((condition) => (
                  <ConditionChip
                    key={condition.id}
                    label={condition.label}
                    tone={CONDITION_TONE[condition.tone] ?? 'neutral'}
                    duration={condition.duration}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── The order ─────────────────────────────────────────────────── */}
        <div className="tc-page" style={{ paddingBottom: 0 }}>
          <SectionHeader sub title="Initiative" eyebrow={`${order.length} in the fight`} />
        </div>
        <div className="tc-initlist">
          {order.map((participant) => (
            <InitiativeRow
              key={participant.id}
              name={participant.name}
              entity={participant.entityType}
              initiative={participant.initiative}
              current={participant.health.current}
              max={participant.health.max}
              temp={participant.health.temporary}
              state={participant.state === 'waiting' ? undefined : participant.state}
              selected={participant.id === me?.id}
              targeted={participant.targeted}
              deathSaves={participant.deathSaves}
              sub={participant.subtitle}
              conditions={participant.conditions.slice(0, 4).map((condition) => (
                <ConditionChip
                  key={condition.id}
                  label={condition.label}
                  tone={CONDITION_TONE[condition.tone] ?? 'neutral'}
                  duration={condition.duration}
                />
              ))}
              // Tapping a row on your turn is how a target is chosen; the rest of the time
              // it is a monitor and does nothing, rather than opening something useless.
              onOpen={myTurn ? () => change(setTargeted(combat, participant.id)) : undefined}
            />
          ))}
        </div>

        <div className="tc-page">
          <SectionHeader sub title="Recent rolls" />
          {visibleRolls(viewer, log.party).length === 0 ? (
            <span style={{ fontSize: 'var(--font-size-13)', color: 'var(--color-text-tertiary)' }}>
              Nothing rolled yet.
            </span>
          ) : (
            visibleRolls(viewer, log.party)
              .slice(0, 6)
              .map((entry) => (
                <RollResult
                  key={entry.id}
                  total={entry.total}
                  title={`${entry.actor} — ${entry.title}`}
                  outcome={entry.outcome}
                  breakdown={`${entry.expression} · ${entry.at.slice(11, 16)}`}
                />
              ))
          )}
        </div>
      </main>

      {/*
        One sheet holds the whole outcome: the attack, what it meant, the damage, and the
        single action that follows. Three modals would be three dismissals.
      */}
      <Sheet
        open={pending !== null}
        onClose={() => setPending(null)}
        title={
          pending?.targetName ? `${pending.name} → ${pending.targetName}` : (pending?.name ?? '')
        }
        footer={
          pending?.damage && target ? (
            <Button
              variant="primary"
              size="lg"
              block
              icon="drop"
              onClick={() => {
                change(applyHealth(combat, target.id, -pending.damage!.total, rules).combat);
                log.note({
                  actor: character?.name ?? 'You',
                  title: `${pending.damage!.total} damage to ${target.name}`,
                });
                setPending(null);
              }}
            >
              Apply {pending.damage.total} damage to {target.name}
            </Button>
          ) : (
            <Button variant="secondary" size="lg" block onClick={() => setPending(null)}>
              Close
            </Button>
          )
        }
      >
        {pending && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}>
            {pending.attack && (
              <RollResult
                total={pending.attack.total}
                title="Attack roll"
                totalLabel="Attack"
                breakdown={`${pending.attack.expression} · ${pending.attack.breakdown}`}
              />
            )}

            {pending.damage && (
              <RollResult
                total={pending.damage.total}
                title="Damage"
                totalLabel="Damage"
                breakdown={`${pending.damage.expression} · ${pending.damage.breakdown}`}
              />
            )}

            {!pending.targetName && (
              <Alert tone="info" title="No target chosen">
                The roll is recorded either way. Tap a row in the initiative list to pick who it
                lands on.
              </Alert>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
}

function armourOf(rules: Ruleset, character: Character): number | string {
  return rules.deriveCharacter(character).find((value) => value.key === 'ac')?.value ?? '—';
}
