/**
 * Running the turn order.
 *
 * The whole screen is a view over these functions, so the rules a DM relies on mid-fight
 * — the round only moves when the order wraps, a defeated combatant is stepped over, a
 * manual move survives until a re-sort is asked for — are checked here rather than by
 * clicking.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFixtureRepositories } from '../../domain/data/fixtureRepositories.ts';
import { requireRuleset } from '../../domain/ruleset/registry.ts';
import { id, type CombatInstance, type CombatParticipant } from '../../domain/types.ts';
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
} from './turns.ts';

const rules = requireRuleset(id<'GameSystem'>('dnd5e-2024'));
const repos = createFixtureRepositories();

function combatant(
  name: string,
  initiative: number,
  extra: Partial<CombatParticipant> = {},
): CombatParticipant {
  return {
    id: id<'CombatParticipant'>(`p-${name.toLowerCase().replaceAll(/\W+/g, '-')}`),
    name,
    subtitle: '',
    entityType: 'monster',
    initiative,
    health: { current: 10, max: 10, temporary: 0 },
    conditions: [],
    state: 'waiting',
    visibility: 'party',
    source: { kind: 'monster', monsterId: id<'Monster'>('m-goblin') },
    ...extra,
  };
}

function fight(participants: CombatParticipant[], activeIndex = 0): CombatInstance {
  return {
    id: id<'CombatInstance'>('cb-turns'),
    campaignId: id<'Campaign'>('c-lmop'),
    name: 'Turn order',
    status: 'live',
    round: 1,
    activeParticipantId: participants[activeIndex]?.id ?? null,
    participants: participants.map((entry, index) => ({
      ...entry,
      state: index === activeIndex ? 'active' : entry.state,
    })),
  };
}

const a = combatant('Alpha', 20);
const b = combatant('Bravo', 15);
const c = combatant('Charlie', 10);

/* ── Advancing ──────────────────────────────────────────────────────────────── */

test('the turn moves down the order and the round does not', () => {
  const first = fight([a, b, c]);
  const second = nextTurn(first);

  assert.equal(activeParticipant(second)?.name, 'Bravo');
  assert.equal(second.round, 1);
  assert.equal(turnIndex(second), 1);

  // Exactly one combatant is on turn, and it is the right one.
  assert.deepEqual(
    second.participants.map((entry) => entry.state),
    ['waiting', 'active', 'waiting'],
  );
});

test('the round moves forward only when the order wraps', () => {
  let combat = fight([a, b, c]);
  combat = nextTurn(nextTurn(combat));
  assert.equal(combat.round, 1, 'still the first round at the last combatant');

  combat = nextTurn(combat);
  assert.equal(activeParticipant(combat)?.name, 'Alpha');
  assert.equal(combat.round, 2);
});

test('previous walks back, and the round with it', () => {
  let combat = fight([a, b, c]);
  combat = nextTurn(nextTurn(nextTurn(combat)));
  assert.equal(combat.round, 2);

  combat = previousTurn(combat);
  assert.equal(activeParticipant(combat)?.name, 'Charlie');
  assert.equal(combat.round, 1, 'stepping back over the top is the previous round');
});

test('the fight cannot be rewound past its first turn', () => {
  const combat = fight([a, b, c]);
  const back = previousTurn(combat);

  assert.equal(back.round, 1);
  assert.equal(activeParticipant(back)?.name, 'Alpha', 'nothing moved');
});

test('a defeated combatant is stepped over rather than given a turn to pass', () => {
  const dead = combatant('Bravo', 15, { state: 'defeated' });
  const combat = fight([a, dead, c]);

  assert.equal(nextParticipant(combat)?.name, 'Charlie');
  assert.equal(activeParticipant(nextTurn(combat))?.name, 'Charlie');
});

test('an unconscious player keeps their turn — death saves are a turn', () => {
  const down = combatant('Bravo', 15, { state: 'unconscious', entityType: 'player' });
  const combat = fight([a, down, c]);

  const next = nextTurn(combat);
  assert.equal(activeParticipant(next)?.name, 'Bravo');
  // Their state is not overwritten by the turn: they are still down while acting.
  assert.equal(next.participants[1]?.state, 'unconscious');
});

test('a fight with no survivors stays where it is', () => {
  const started = fight([a, b]);
  const wiped: CombatInstance = {
    ...started,
    participants: started.participants.map((entry) => ({ ...entry, state: 'defeated' })),
  };

  assert.deepEqual(nextTurn(wiped), wiped, 'no infinite walk looking for someone to act');
});

test('a lone survivor takes the next round rather than the fight stalling', () => {
  const dead = combatant('Bravo', 15, { state: 'defeated' });
  const combat = nextTurn(fight([a, dead]));

  assert.equal(activeParticipant(combat)?.name, 'Alpha');
  assert.equal(combat.round, 2, 'the order still wrapped, so the round still moved');
});

test('the turn can be handed to anyone, for a DM who says "you first"', () => {
  const combat = jumpToTurn(fight([a, b, c]), c.id);
  assert.equal(activeParticipant(combat)?.name, 'Charlie');
  assert.equal(combat.round, 1, 'jumping is not a new round');
});

/* ── Reordering ─────────────────────────────────────────────────────────────── */

test('a combatant can be moved through the order without changing what they rolled', () => {
  const moved = moveParticipant(fight([a, b, c]), c.id, -1);

  assert.deepEqual(
    moved.participants.map((entry) => entry.name),
    ['Alpha', 'Charlie', 'Bravo'],
  );
  assert.equal(moved.participants[1]?.initiative, 10, 'the ruling moved them, not a re-roll');
});

test('a move off either end does nothing', () => {
  const combat = fight([a, b, c]);
  assert.deepEqual(moveParticipant(combat, a.id, -1), combat);
  assert.deepEqual(moveParticipant(combat, c.id, 1), combat);
});

test('changing a number does not move anyone until a re-sort is asked for', () => {
  const combat = fight([a, b, c]);
  const raised = setInitiativeDuringCombat(combat, [c.id], 99);

  assert.deepEqual(
    raised.participants.map((entry) => entry.name),
    ['Alpha', 'Bravo', 'Charlie'],
    'the order a DM is reading does not rearrange under them',
  );
  assert.ok(orderDiffersFromInitiative(raised, rules), 'but the screen can offer the re-sort');

  const sorted = resortByInitiative(raised, rules);
  assert.deepEqual(
    sorted.participants.map((entry) => entry.name),
    ['Charlie', 'Alpha', 'Bravo'],
  );
  assert.ok(!orderDiffersFromInitiative(sorted, rules));
});

test('an order that matches its numbers raises no re-sort offer', () => {
  assert.ok(!orderDiffersFromInitiative(fight([a, b, c]), rules));
});

/* ── Ending ─────────────────────────────────────────────────────────────────── */

test('ending a fight clears the turn and stamps it', () => {
  const ended = endCombat(fight([a, b, c]), '2026-08-15T21:00:00.000Z');

  assert.equal(ended.status, 'ended');
  assert.equal(ended.activeParticipantId, null);
  assert.equal(ended.endedAt, '2026-08-15T21:00:00.000Z');
  assert.ok(ended.participants.every((entry) => entry.state !== 'active'));
});

/* ── The fixture the screen is judged against ───────────────────────────────── */

test('the live fixture is the load the design specifies', async () => {
  const combat = await repos.combats.byId(id<'CombatInstance'>('cb-goblin-ambush'));
  assert.ok(combat);

  const players = combat.participants.filter((entry) => entry.entityType === 'player');
  const creatures = combat.participants.filter((entry) => entry.entityType === 'monster');
  const npcs = combat.participants.filter((entry) => entry.entityType === 'npc');

  assert.ok(players.length >= 4, '4 players');
  assert.ok(creatures.length >= 8, '8 monsters');
  assert.ok(npcs.length >= 1, '1 NPC');

  // The order it ships in is the order its numbers produce, so the runner does not open
  // by telling the DM their own fixture is out of order.
  assert.ok(!orderDiffersFromInitiative(combat, rules));

  // Every state the row has to draw is present to be looked at.
  assert.ok(combat.participants.some((entry) => entry.state === 'active'));
  assert.ok(combat.participants.some((entry) => entry.state === 'defeated'));
  assert.ok(combat.participants.some((entry) => entry.state === 'unconscious'));
  assert.ok(combat.participants.some((entry) => entry.deathSaves));
  assert.ok(combat.participants.some((entry) => entry.visibility === 'dm-only'));
  assert.ok(combat.participants.some((entry) => entry.conditions.length >= 4));
  assert.ok(combat.participants.some((entry) => entry.health.temporary > 0));
});

test('a full round of the real fixture returns to where it started', async () => {
  const combat = await repos.combats.byId(id<'CombatInstance'>('cb-goblin-ambush'));
  assert.ok(combat);

  const start = activeParticipant(combat)?.id;
  const living = combat.participants.filter((entry) => entry.state !== 'defeated').length;

  let running = combat;
  for (let step = 0; step < living; step += 1) running = nextTurn(running);

  assert.equal(activeParticipant(running)?.id, start);
  assert.equal(running.round, combat.round + 1, 'one wrap is one round');
});
