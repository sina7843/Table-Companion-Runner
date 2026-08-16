/**
 * The states a product has once it is backed by a real server, checked as rules.
 *
 * There is no DOM environment here, so these read the screens rather than render them — a
 * weaker check, stated as such: it catches a rule being deleted, not a rule being mis-wired.
 * The rules themselves are the ones with a direct path from a defect to a person losing work
 * or being told something untrue.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PLAYER_NAV } from './nav.ts';

const SRC = join(import.meta.dirname, '..');
const source = (path: string) => readFileSync(join(SRC, path), 'utf8');

/** Every `.tsx` under `src/screens`, recursively. */
function screenFiles(dir = join(SRC, 'screens'), found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) screenFiles(path, found);
    else if (entry.name.endsWith('.tsx')) found.push(path);
  }
  return found;
}

/* ── Nothing claims what it cannot know ─────────────────────────────────────── */

test('no screen asserts a connection state instead of reporting one', () => {
  // The shells used to claim `Live` whatever was true, and the party table drew it against
  // every player — presence this product does not have. A hard-coded state is a promise the
  // app cannot keep, and the showcase is the one place a fixed value is honest.
  for (const file of screenFiles()) {
    const text = readFileSync(file, 'utf8');
    assert.equal(
      /<ConnectionStatus\s+state="/.test(text),
      false,
      `${file} states a connection rather than reporting one`,
    );
  }
});

test('Try again re-runs the read rather than reloading the page', () => {
  // A page reload throws away every other screen's state, the context panel and any queued
  // autosave, to fix one failed read. `useAsync` hands every caller a `reload` for this.
  for (const file of screenFiles()) {
    const text = readFileSync(file, 'utf8');
    assert.equal(
      text.includes('window.location.reload'),
      false,
      `${file} reloads the page to recover from a failed read`,
    );
  }
});

/* ── Saving ─────────────────────────────────────────────────────────────────── */

test('every autosaving screen goes through the one autosave', () => {
  // Three copies of this had drifted into three different answers to "what happens when the
  // save fails", one of which was `Saved`. One implementation, so it cannot drift again.
  for (const file of [
    'screens/builder/BuilderScreen.tsx',
    'screens/encounters/EncounterBuilder.tsx',
    'screens/monsters/MonsterEditor.tsx',
  ]) {
    const text = source(file);
    assert.match(text, /useAutosave</, `${file} does not use the shared autosave`);
    assert.match(text, /SaveStatus/, `${file} does not show a save status`);
    // And none of them keeps a private idea of what "saved" means.
    assert.equal(/setSaving\(/.test(text), false, `${file} still tracks its own save state`);
  }
});

test('a failure is never a dead end: every autosaving screen offers the way out', () => {
  assert.match(source('app/SaveStatus.tsx'), /save\.retry/);
  for (const file of [
    'screens/encounters/EncounterBuilder.tsx',
    'screens/monsters/MonsterEditor.tsx',
  ]) {
    assert.match(source(file), /save\.retry/, `${file} shows a failure with no retry`);
  }
});

test('finishing a document writes what the debounce is still holding', () => {
  // The last answer somebody gave must not be the one answer the finished thing lacks.
  assert.match(source('screens/builder/BuilderScreen.tsx'), /await save\.flush\(\)/);
  assert.match(source('screens/encounters/EncounterBuilder.tsx'), /flush\(\)/);
});

/* ── Refresh and recovery ───────────────────────────────────────────────────── */

test('a draft exists on the server before it can be typed into', () => {
  // Refresh safety for the two builders is not a local cache: the record is created up front,
  // so autosave has an id to write against and a reload lands on the thing that exists.
  assert.match(
    source('screens/builder/BuilderScreen.tsx'),
    /drafts\.create\(/,
    'the character builder creates its draft before the first answer',
  );

  const encounter = source('screens/encounters/EncounterBuilder.tsx');
  assert.match(encounter, /encounters\.create\(/);
  // And it takes over its own URL, so the back button does not make a second one.
  assert.match(encounter, /replace: true/);
});

test('a fight is recovered from the server, never from the screen that was showing it', () => {
  const combat = source('screens/combat/CombatScreen.tsx');
  // Every change is a command against a version. A conflict is re-read rather than merged,
  // because the screen is not the authority and cannot decide who won.
  assert.match(combat, /expectedVersion: current\.version \?\? 0/);
  assert.match(combat, /if \(stale\) loaded\.reload\(\)/);
  assert.equal(
    /combats\.save\(/.test(combat),
    false,
    'a whole-record write would silently overwrite whatever the other device did',
  );
});

/* ── What a conflict says ───────────────────────────────────────────────────── */

test('a conflict is explained in the product’s own words, not the transport’s', () => {
  const screens = [
    { file: 'screens/combat/CombatScreen.tsx', says: 'Somebody else changed this fight first' },
    { file: 'screens/player/PlayerCombat.tsx', says: 'The table moved on while you were deciding' },
  ];

  for (const { file, says } of screens) {
    const text = source(file);
    assert.ok(text.includes("error.code === 'conflict'"), `${file} branches on the stable code`);
    assert.ok(text.includes(says), `${file} does not say what happened in plain words`);
    // Never a status code, a route or a stack in front of somebody at a table.
    assert.equal(text.includes('error.status'), false, `${file} shows a transport detail`);
    assert.equal(text.includes('JSON.stringify(error'), false, `${file} dumps an error object`);
  }
});

/* ── Accessibility ──────────────────────────────────────────────────────────── */

test('every new status is announced, not only coloured', () => {
  // A save status, a connection recovery and an account change are all things somebody using
  // a screen reader has no other way to learn.
  assert.match(source('app/SaveStatus.tsx'), /role="status"[\s\S]{0,80}aria-live="polite"/);
  assert.match(source('app/DMShell.tsx'), /role="status" aria-live="polite"/);
  assert.match(source('screens/account.tsx'), /role="status"/);
});

test('a connection recovery is said in words as well as in colour', () => {
  const shell = source('app/DMShell.tsx');
  for (const phrase of ['Offline', 'Reconnecting', 'Catching up', 'Back in sync']) {
    assert.ok(shell.includes(phrase), `the shell never says "${phrase}"`);
  }
});

test('every dialog in the product is a real dialog', () => {
  // `showModal()` is what supplies the focus trap, the inert background, Escape and top-layer
  // stacking. A div with a high z-index supplies none of them, and the screens that need a
  // modal use the design system's rather than building one.
  assert.match(source('design-system/components/Overlay.tsx'), /dialog\.showModal\(\)/);
  assert.match(source('design-system/components/Overlay.tsx'), /aria-labelledby=\{titleId\}/);

  for (const file of screenFiles()) {
    const text = readFileSync(file, 'utf8');
    assert.equal(
      /position: 'fixed'[\s\S]{0,200}zIndex/.test(text),
      false,
      `${file} looks like a hand-rolled overlay`,
    );
  }
});

test('the account is reachable from both shells without crowding the thumb bar', () => {
  // Five destinations is the design's bottom-bar limit, so the player reaches the account
  // from the top of Home instead — a full-size icon button, not a sixth tab.
  assert.ok(PLAYER_NAV.length <= 5);
  assert.equal(
    PLAYER_NAV.some((entry) => entry.to.includes('account')),
    false,
  );
  assert.match(source('screens/PlayerHome.tsx'), /icon="user-circle" label="Account"/);
  assert.match(source('app/DMShell.tsx'), /to="\/dm\/account"/);
});

test('the player surface still renders at touch density', () => {
  // The 44px control floor is armed by the density attribute, not by each control asking.
  assert.match(source('app/PlayerShell.tsx'), /data-density="touch"/);
});

/* ── Signed out ─────────────────────────────────────────────────────────────── */

test('a signed-out visitor is offered a door, not an error', () => {
  const routes = source('app/routes.tsx');
  assert.match(routes, /status === 'signed-out'/);
  assert.match(routes, /<Navigate to="\/"/);

  // And the account screen, which is inside the shell, still answers when there is nobody.
  assert.match(source('screens/account.tsx'), /You are signed out/);
});

test('entry offers every door Phase 1 has', () => {
  const entry = source('screens/entry.tsx');
  for (const destination of ['/join', '/signup', '/play']) {
    assert.ok(entry.includes(`to="${destination}"`), `entry does not offer ${destination}`);
  }
});
