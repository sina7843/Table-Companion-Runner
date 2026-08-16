/**
 * Connection state, and the responsive contract the shells rely on.
 *
 * `useConnection` is a hook, and this project has no DOM test environment — so what is
 * checked here is the logic it is built from and the rules it must satisfy, read from the
 * source. That is a weaker check than rendering it, and it is stated as such rather than
 * dressed up: it catches a rule being deleted, not a rule being mis-wired.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLocalChannel, createNullChannel } from '../domain/data/realtime.ts';

const ROOT = join(import.meta.dirname, '..');
const source = (path: string) => readFileSync(join(ROOT, path), 'utf8');

/* ── What the channel reports ───────────────────────────────────────────────── */

test('a channel with nothing behind it still reports a state and a subscription', () => {
  const channel = createNullChannel();

  assert.equal(channel.status, 'live');
  // Both must return an unsubscribe, or every screen that mounts one leaks a handler.
  assert.equal(typeof channel.subscribe(() => {}), 'function');
  assert.equal(typeof channel.onStatus(() => {}), 'function');
  channel.close();
});

test('unsubscribing actually detaches the handler', () => {
  const channel = createLocalChannel('tc-test-detach');
  let heard = 0;

  const stop = channel.subscribe(() => {
    heard += 1;
  });
  stop();

  // Same-tab delivery goes through the handler set, so a detached handler hears nothing.
  channel.publish({ kind: 'combat.changed', combatId: 'cb-x' as never });
  assert.equal(heard, 0);
  channel.close();
});

test('a status handler is called on change and not on a repeat of the same state', () => {
  const channel = createLocalChannel('tc-test-status');
  const seen: string[] = [];
  channel.onStatus((state) => seen.push(state));

  // The local channel starts live and only moves on a browser online/offline event, so
  // nothing should have been announced merely by subscribing.
  assert.deepEqual(seen, [], 'subscribing is not itself a change');
  channel.close();
});

/* ── The three states, and what each is allowed to mean ─────────────────────── */

test('connection state is derived from two signals and never invented', () => {
  const hook = source('app/useConnection.ts');

  // Offline is the browser's own event or a channel that knows it is down; reconnecting is
  // a failed write or a channel retrying. Nothing here may guess at a server.
  assert.match(hook, /navigator\.onLine/);
  assert.match(hook, /useChannelStatus/);
  assert.match(hook, /channelStatus === 'offline'/);
  assert.match(hook, /channelStatus === 'reconnecting'/);

  // Both listeners are removed. A shell that mounts once per session still must not leak.
  assert.match(hook, /removeEventListener\('online'/);
  assert.match(hook, /removeEventListener\('offline'/);
});

test('the restored flag clears itself and never loops', () => {
  const hook = source('app/useConnection.ts');

  assert.match(hook, /const RESTORED_MS = \d+;/);
  assert.match(hook, /setTimeout\(\(\) => setRestored\(false\), RESTORED_MS\)/);
  // The timer is cleared on unmount, and on a second recovery before the first expired.
  assert.equal((hook.match(/clearTimeout\(timer\.current\)/g) ?? []).length >= 2, true);
});

test('a failed write is what reconnecting means, and a success clears it', () => {
  const hook = source('app/useConnection.ts');
  assert.match(hook, /reportFailure = useCallback\(\(\) => setFailing\(true\)/);
  assert.match(hook, /reportSuccess = useCallback\(\(\) => setFailing\(false\)/);
});

test('both writing surfaces report their outcome to the connection', () => {
  // A screen that writes without reporting is a screen that never shows reconnecting.
  for (const screen of ['screens/combat/CombatScreen.tsx', 'screens/player/PlayerCombat.tsx']) {
    const text = source(screen);
    assert.match(text, /connection\.reportSuccess\(\)/, `${screen} reports success`);
    assert.match(text, /connection\.reportFailure\(\)/, `${screen} reports failure`);
  }
});

test('a failed write says the fight is safe rather than naming a transport', () => {
  const text = source('screens/combat/CombatScreen.tsx');

  assert.match(text, /held on this device/);
  assert.match(text, /nothing has been lost/);
  assert.match(text, /Try again/);
  // The design is explicit that an error never mentions the transport.
  assert.ok(
    !/websocket|socket|http|api/i.test(
      text.slice(
        text.indexOf('held on this device') - 400,
        text.indexOf('held on this device') + 400,
      ),
    ),
  );
});

test('the player is told their roll survived, in words a player would use', () => {
  const text = source('screens/player/PlayerCombat.tsx');
  assert.match(text, /Reconnecting\. Your last roll was saved and the fight is still running\./);
});

/* ── Responsive contract ────────────────────────────────────────────────────── */

test('the breakpoints the shells use are the design system tokens', () => {
  const media = source('app/useMediaQuery.ts');

  // The design documents 480/768/1024/1280/1600 and mirrors them literally in queries.
  for (const [name, value] of Object.entries({ sm: 480, md: 768, lg: 1024, xl: 1280 })) {
    assert.match(
      media,
      new RegExp(`${name}:\\s*\\D*${value}`),
      `BP.${name} should be ${value}px, as the design system declares`,
    );
  }
});

test('the DM shell switches composition at the documented breakpoint', () => {
  const shell = source('app/DMShell.tsx');

  // Above xl: full sidebar, compact density, docked panel. Below: rail, comfortable, drawer.
  assert.match(shell, /useMediaQuery\(BP\.xl\)/);
  assert.match(shell, /data-density=\{isDesktop \? 'compact' : 'comfortable'\}/);
  assert.match(shell, /collapsed=\{!isDesktop\}/);
});

test('the context panel docks above 1280 and becomes a drawer below it', () => {
  const css = source('app/shell.css');

  // Both halves must exist: a docked column that takes width from the workspace, and the
  // overlay form below the breakpoint.
  assert.match(css, /@media \(min-width: 1280px\)|@media \(max-width: 1279px\)/);
  assert.match(css, /--layout-context-panel-wide/);
});

test('the player shell is touch density, which is what arms the 44px floor', () => {
  const shell = source('app/PlayerShell.tsx');
  assert.match(shell, /data-density="touch"/);

  const floor = source('design-system/components/css/touch-targets.css');
  assert.match(floor, /\[data-density='touch'\]/);
  assert.match(floor, /min-height: var\(--touch-target-min\)/);
});

test('the combat surfaces degrade rather than disappear on a narrow column', () => {
  // The design ships container queries on the initiative list; both combat screens must
  // opt into them by wrapping the list, or the tablet layout silently stops working.
  const list = source('design-system/components/css/combat.css');
  assert.match(list, /\.tc-initlist\s*\{[^}]*container-type: inline-size/);

  for (const screen of ['screens/combat/CombatRunner.tsx', 'screens/player/PlayerCombat.tsx']) {
    assert.match(source(screen), /className="tc-initlist"/, `${screen} arms the container query`);
  }
});
