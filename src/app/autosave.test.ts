/**
 * Autosave, and the one thing it must never do.
 *
 * Before TC-P07 the character builder reported a failed write as `Saved`. Somebody answering
 * eight questions has no way to check — the line is the only evidence they have — so this is
 * the rule with the most direct path from a defect to lost work, and it is tested rather than
 * reviewed.
 *
 * The engine is a plain object precisely so this file can drive it: `createAutosave` takes its
 * own scheduler, so a debounce is a function call here rather than a wait.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAutosave, autosaveLabel } from './useAutosave.ts';

/** A scheduler the test drives by hand. */
function manualClock() {
  let queued: (() => void) | null = null;
  return {
    schedule: (run: () => void) => {
      queued = run;
      return 1;
    },
    cancel: () => {
      queued = null;
    },
    /** Fires the debounce, if one is armed. */
    tick() {
      const run = queued;
      queued = null;
      run?.();
    },
    get armed() {
      return queued !== null;
    },
  };
}

/** A write the test resolves or rejects when it chooses. */
function controllable<T>() {
  const calls: T[] = [];
  let settle: { resolve: () => void; reject: (error: Error) => void } | null = null;

  const write = (value: T) => {
    calls.push(value);
    return new Promise<void>((resolve, reject) => {
      settle = { resolve: () => resolve(), reject };
    });
  };

  return {
    write,
    calls,
    succeed() {
      settle?.resolve();
      return Promise.resolve();
    },
    fail(message: string) {
      settle?.reject(new Error(message));
      // Two microtask turns: one for the rejection handler, one for the state it sets.
      return Promise.resolve().then(() => Promise.resolve());
    },
  };
}

/* ── The rule ───────────────────────────────────────────────────────────────── */

test('a failed write is never reported as a saved one', async () => {
  const clock = manualClock();
  const server = controllable<string>();
  const save = createAutosave(server.write, clock);

  save.save('a longbow');
  clock.tick();
  await server.fail('The connection dropped.');

  assert.equal(save.state().status, 'failed');
  assert.equal(save.state().unsaved, true, 'and it says so');
  assert.equal(save.state().error, 'The connection dropped.');
  // The label a screen renders, not just the state behind it: the defect was in the words.
  assert.match(autosaveLabel(save.state().status), /still here/);
  assert.doesNotMatch(autosaveLabel(save.state().status), /^Saved/);
});

test('a failed edit is kept, so Try again sends the same value', async () => {
  const clock = manualClock();
  const server = controllable<string>();
  const save = createAutosave(server.write, clock);

  save.save('a longbow');
  clock.tick();
  await server.fail('Nope.');

  save.retry();
  assert.deepEqual(server.calls, ['a longbow', 'a longbow'], 'the same value, unchanged');

  await server.succeed();
  assert.equal(save.state().status, 'saved');
  assert.equal(save.state().unsaved, false, 'and nothing is outstanding any more');
});

test('the next edit carries the failed one with it', async () => {
  const clock = manualClock();
  const server = controllable<string>();
  const save = createAutosave(server.write, clock);

  save.save('a longbow');
  clock.tick();
  await server.fail('Nope.');

  // The failure is not a dead end: typing again resumes, and what is sent is the new value —
  // which contains the earlier edit, because a document edit is cumulative.
  save.save('a longbow and a quiver');
  clock.tick();
  assert.equal(server.calls.at(-1), 'a longbow and a quiver');

  await server.succeed();
  assert.equal(save.state().status, 'saved');
});

/* ── Not losing the last thing somebody typed ───────────────────────────────── */

test('flushing writes what the debounce is still holding', async () => {
  const clock = manualClock();
  const server = controllable<string>();
  const save = createAutosave(server.write, clock);

  save.save('goblins, six');
  assert.deepEqual(server.calls, [], 'nothing has gone yet');

  // This is Start, or Done, or Create — the exits that happen a quarter-second after typing.
  const flushed = save.flush();
  assert.deepEqual(server.calls, ['goblins, six'], 'the queued edit went with it');
  assert.equal(clock.armed, false, 'and the timer was cancelled rather than left to fire twice');

  await server.succeed();
  await flushed;
  assert.equal(save.state().status, 'saved');
});

test('flushing with nothing queued is a no-op, not a redundant write', async () => {
  const clock = manualClock();
  const server = controllable<string>();
  const save = createAutosave(server.write, clock);

  await save.flush();
  assert.deepEqual(server.calls, []);
});

test('leaving fires the queued write rather than dropping it', () => {
  const clock = manualClock();
  const server = controllable<string>();
  const save = createAutosave(server.write, clock);

  save.save('half a stat block');
  // Unmount cannot await, but it can send. The alternative is the last edit never happening.
  save.abandon();
  assert.deepEqual(server.calls, ['half a stat block']);
});

/* ── Races ──────────────────────────────────────────────────────────────────── */

test('a slow response does not report success over a newer edit', async () => {
  const clock = manualClock();
  const first = controllable<string>();
  const save = createAutosave(first.write, clock);

  save.save('one');
  clock.tick();

  // The DM types again while the first write is still in flight.
  save.save('two');
  await first.succeed();

  assert.notEqual(
    save.state().status,
    'saved',
    'the first response says nothing about the second edit',
  );
  assert.equal(save.state().unsaved, true);
});

/* ── What an operator is told ───────────────────────────────────────────────── */

test('a run of failures is reported once, and so is the recovery', async () => {
  const clock = manualClock();
  const server = controllable<string>();
  let failures = 0;
  let recoveries = 0;
  const save = createAutosave(server.write, {
    ...clock,
    onFailure: () => (failures += 1),
    onRecovery: () => (recoveries += 1),
  });

  save.save('a');
  clock.tick();
  await server.fail('down');
  save.retry();
  await server.fail('still down');

  assert.equal(failures, 1, 'a failing deployment is one event, not one per keystroke');
  assert.equal(recoveries, 0);

  save.retry();
  await server.succeed();
  assert.equal(recoveries, 1, 'and coming back is worth knowing about');

  // A second run of failures is a second event; only a *continuing* one is deduplicated.
  save.save('b');
  clock.tick();
  await server.fail('down again');
  assert.equal(failures, 2);
});

test('subscribers hear a change, and only a change', async () => {
  const clock = manualClock();
  const server = controllable<string>();
  const save = createAutosave(server.write, clock);

  let notifications = 0;
  const stop = save.subscribe(() => (notifications += 1));

  save.save('x');
  const afterFirst = notifications;
  save.save('y');
  assert.equal(
    notifications,
    afterFirst,
    'still saving, still unsaved — no re-render owed for a second keystroke',
  );

  clock.tick();
  await server.succeed();
  assert.ok(notifications > afterFirst, 'landing is a change');

  stop();
  save.save('z');
  clock.tick();
  const quiet = notifications;
  await server.succeed();
  assert.equal(notifications, quiet, 'a detached listener hears nothing');
});
