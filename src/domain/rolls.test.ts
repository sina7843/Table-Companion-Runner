/**
 * Roll visibility.
 *
 * The rule this file exists for: a secret DM roll must never reach player-facing state.
 * It is checked at the predicate every surface shares, and at the repository, because a
 * leak would come from one of those two places.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFixtureRepositories } from './data/fixtureRepositories.ts';
import { canSeeRoll, isPlayerVisibleRoll, viewerFor, visibleRolls } from './permissions.ts';
import { id, type Campaign, type Roll, type Visibility } from './types.ts';

const repos = createFixtureRepositories();
const COMBAT = id<'CombatInstance'>('cb-goblin-ambush');

const campaign: Campaign = {
  id: id<'Campaign'>('c-lmop'),
  name: 'Lost Mine of Phandelver',
  systemId: id<'GameSystem'>('dnd5e-2024'),
  dmUserId: id<'User'>('u-marta'),
  inviteCode: 'CRAGMAW-7742',
  members: [],
  createdAt: '2026-05-02T18:00:00.000Z',
};

const dm = viewerFor(campaign, id<'User'>('u-marta'));
const player = viewerFor(campaign, id<'User'>('u-priya'));

function roll(visibility: Visibility, total = 17): Roll {
  return {
    id: id<'Roll'>(`r-${visibility}-${total}`),
    combatId: COMBAT,
    actor: 'Cragmaw Ambusher',
    title: 'Stealth',
    expression: '1d20 + 6',
    mode: 'normal',
    dice: [{ sides: 20, value: 11 }],
    modifier: 6,
    total,
    outcome: 'normal',
    visibility,
    at: '2026-08-15T19:44:00.000Z',
  };
}

test('a secret roll reaches the DM and no player', () => {
  for (const hidden of ['dm-only', 'secret'] as const) {
    assert.equal(canSeeRoll(dm, roll(hidden)), true, `the DM reads their own ${hidden} roll`);
    assert.equal(canSeeRoll(player, roll(hidden)), false, `a player never reads a ${hidden} roll`);
    assert.equal(isPlayerVisibleRoll(roll(hidden)), false);
  }
});

test('an ordinary roll reaches everyone', () => {
  for (const open of ['public', 'party'] as const) {
    assert.equal(canSeeRoll(player, roll(open)), true);
    assert.equal(isPlayerVisibleRoll(roll(open)), true);
  }
});

test('the shared predicate and the viewer test cannot disagree', () => {
  // The DM's log splits on `isPlayerVisibleRoll`; a player device filters with
  // `canSeeRoll`. Two answers to one question is exactly how a secret roll leaks.
  const every: Visibility[] = ['public', 'party', 'private', 'dm-only', 'secret'];
  for (const visibility of every) {
    assert.equal(
      isPlayerVisibleRoll(roll(visibility)),
      canSeeRoll(player, roll(visibility)),
      `${visibility} must answer the same both ways`,
    );
  }
});

test('filtering a log for a player removes the secret lines and keeps the rest', () => {
  const log = [roll('party', 12), roll('dm-only', 23), roll('secret', 4), roll('public', 8)];

  const forPlayer = visibleRolls(player, log);
  assert.deepEqual(
    forPlayer.map((entry) => entry.total),
    [12, 8],
  );
  assert.equal(visibleRolls(dm, log).length, 4, 'the DM keeps all four');
});

test('a recorded secret roll is stored secret and stays out of a player log', async () => {
  const before = await repos.rolls.listForCombat(COMBAT);

  const secret = roll('dm-only', 23);
  await repos.rolls.record(secret);

  const after = await repos.rolls.listForCombat(COMBAT);
  assert.equal(after.length, before.length + 1, 'the log is append-only');

  const stored = after.find((entry) => entry.id === secret.id);
  assert.equal(stored?.visibility, 'dm-only', 'visibility survives the round trip');
  assert.ok(!visibleRolls(player, after).some((entry) => entry.id === secret.id));
});

test('the log hands out copies, so nothing can rewrite a roll in place', async () => {
  const [first] = await repos.rolls.listForCombat(COMBAT);
  assert.ok(first);

  first.total = 999;
  first.visibility = 'party';
  first.dice[0]!.value = 1;

  const again = (await repos.rolls.listForCombat(COMBAT)).find((entry) => entry.id === first.id);
  assert.notEqual(again?.total, 999);
  assert.notEqual(again?.dice[0]?.value, 1);
});
