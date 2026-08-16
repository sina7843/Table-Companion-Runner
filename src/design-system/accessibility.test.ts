/**
 * The accessibility invariants, pinned.
 *
 * These are the rules that were fixed by hand once and would rot silently otherwise: an
 * icon with no name, a control revealed only by hover, a screen with no heading. Each is
 * checkable from the source, which is the only kind of check this project can run without
 * a browser — so it is the kind worth having.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');

function filesUnder(dir: string, extensions = ['.ts', '.tsx']): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full, extensions));
    else if (extensions.some((ext) => entry.endsWith(ext)) && !entry.includes('.test.'))
      out.push(full);
  }
  return out;
}

const source = (path: string) => readFileSync(path, 'utf8');

/* ── Names ──────────────────────────────────────────────────────────────────── */

test('every icon-only control is given a name', () => {
  // `IconButton` requires `label` in its type, so the check is that nobody has routed
  // around it with a bare button holding nothing but an icon.
  const offenders: string[] = [];

  for (const file of [...filesUnder(join(ROOT, 'screens')), ...filesUnder(join(ROOT, 'app'))]) {
    const text = source(file);
    // A <button> whose entire body is an <Icon .../> and which carries no aria-label.
    const bare = /<button(?![^>]*aria-label)[^>]*>\s*<Icon[^>]*\/>\s*<\/button>/g;
    if (bare.test(text)) offenders.push(file.replace(ROOT, 'src'));
  }

  assert.deepEqual(offenders, [], 'an icon is not a name');
});

test('the icon-button adapter cannot be constructed without a label', () => {
  const button = source(join(ROOT, 'design-system/components/Button.tsx'));
  // Required, not optional: `label?: string` would make every call site a judgement call.
  assert.match(button, /label: string;/);
});

/* ── Hover ──────────────────────────────────────────────────────────────────── */

test('nothing is revealed by hover alone', () => {
  // The approved CSS hides table row actions until hover or focus. That is fine on a
  // pointer and unusable on a touch screen, so the adapter layer must answer for every
  // such rule with a `hover: none` escape.
  const vendored = filesUnder(join(ROOT, 'design-system/components/css'), ['.css'])
    .map(source)
    .join('\n');

  const hidden = [...vendored.matchAll(/\.([a-z0-9_-]+)\s*\{[^}]*opacity:\s*0;[^}]*\}/g)]
    .map((match) => match[1])
    .filter((name): name is string => Boolean(name))
    // A keyframe's `from { opacity: 0 }` is an animation, not a hidden control.
    .filter((name) => !name.startsWith('tc-fade'));

  const adapters = source(join(ROOT, 'design-system/components/adapters.css'));
  const escape = adapters.slice(adapters.indexOf('@media (hover: none)'));

  for (const name of hidden) {
    const revealedByHover = new RegExp(`:hover[^{]*\\.${name}|\\.${name}[^{]*:hover`).test(
      vendored,
    );
    if (!revealedByHover) continue;

    assert.ok(
      escape.includes(`.${name}`),
      `.${name} is revealed by hover and has no touch escape in adapters.css`,
    );
  }
});

test('the touch escape asks the device, not the viewport', () => {
  const adapters = source(join(ROOT, 'design-system/components/adapters.css'));
  assert.ok(adapters.includes('@media (hover: none)'));
  // A width query would take the reveal away from a narrow window on a laptop, which
  // still has a pointer, and leave it broken on a wide tablet, which does not.
  assert.ok(!/@media[^{]*max-width[^{]*\{\s*\.tc-table__rowactions/.test(adapters));
});

/* ── Structure ──────────────────────────────────────────────────────────────── */

test('a page title and a section title are headings', () => {
  const shells = [
    source(join(ROOT, 'app/DMShell.tsx')),
    source(join(ROOT, 'app/PlayerShell.tsx')),
  ].join('\n');
  assert.match(shells, /<h1 className="tc-topbar__title">/);

  const section = source(join(ROOT, 'design-system/components/DataDisplay.tsx'));
  assert.match(section, /const Heading = `h\$\{level/);

  const empty = source(join(ROOT, 'design-system/components/Feedback.tsx'));
  assert.match(empty, /<h2 className="tc-empty__title">/);
});

test('the heading tags carry no user-agent styling of their own', () => {
  // A heading that shipped the browser's default margin and font-size would break the
  // approved type scale, which is why the semantics were not added until this existed.
  const shell = source(join(ROOT, 'app/shell.css'));
  assert.ok(shell.includes('h2.tc-section__title'));
  assert.match(shell, /font-size: inherit;/);
});

test('both shells expose a main landmark and a skip link', () => {
  for (const name of ['app/DMShell.tsx', 'app/PlayerShell.tsx']) {
    const text = source(join(ROOT, name));
    assert.ok(text.includes('id="main"'), `${name} has a main landmark`);
    assert.ok(text.includes('tc-skiplink'), `${name} has a skip link`);
  }
});

/* ── Overlays ───────────────────────────────────────────────────────────────── */

test('every overlay is a native dialog, so the trap and Escape are the platform ones', () => {
  const overlay = source(join(ROOT, 'design-system/components/Overlay.tsx'));

  // One helper drives all three; showModal is what supplies the focus trap and the
  // inert background, and `cancel` is intercepted so React stays the source of truth.
  assert.match(overlay, /dialog\.showModal\(\)/);
  assert.match(overlay, /addEventListener\('cancel'/);

  for (const component of ['Modal', 'Drawer', 'Sheet']) {
    assert.match(overlay, new RegExp(`export function ${component}\\(`), `${component} exists`);
  }
  assert.equal(
    (overlay.match(/useDialog\(open, onClose\)/g) ?? []).length,
    3,
    'all three overlays go through the one dialog helper',
  );
});

test('every dialog has its user-agent styling neutralised', () => {
  const adapters = source(join(ROOT, 'design-system/components/adapters.css'));
  const overlay = source(join(ROOT, 'design-system/components/Overlay.tsx'));

  // Whatever class an overlay renders with must be reset here, or it ships with the
  // browser's padding, groove border and canvas background over the approved geometry.
  const rendered = [...overlay.matchAll(/className="(tc-(?:modal|drawer|sheet))"/g)]
    .map((match) => match[1])
    .filter((name): name is string => Boolean(name));

  for (const name of rendered) {
    assert.ok(adapters.includes(`dialog.${name}`), `dialog.${name} needs a user-agent reset`);
    assert.ok(adapters.includes(`dialog.${name}::backdrop`), `dialog.${name} needs a scrim`);
  }
});

test('the context panel returns focus when it closes', () => {
  // It is deliberately not a dialog — the design forbids a scrim over a running fight —
  // so the one thing a dialog would have given it has to be done by hand.
  const panel = source(join(ROOT, 'app/ContextPanel.tsx'));
  assert.match(panel, /document\.activeElement/);
  assert.match(panel, /restoreTo\?\.focus\(\)/);
});

/* ── Motion ─────────────────────────────────────────────────────────────────── */

test('reduced motion stops every looping animation', () => {
  const css = filesUnder(join(ROOT, 'design-system'), ['.css']).map(source).join('\n');
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));

  const looping = [...css.matchAll(/animation:\s*([a-z0-9-]+)[^;]*infinite/g)]
    .map((match) => match[1])
    .filter((name): name is string => Boolean(name));

  assert.ok(looping.length > 0, 'there are looping animations to check');

  for (const name of looping) {
    // Either the keyframe is switched off, or its duration token is zeroed. A loop that
    // runs for ever is the one kind of motion a reduced-motion request really means.
    const stopped =
      reduced.includes(name) ||
      /--duration-[a-z]+:\s*0ms/.test(reduced) ||
      new RegExp(`${name}[\\s\\S]{0,400}animation: none`).test(reduced);
    assert.ok(stopped, `${name} loops and is not stopped under reduced motion`);
  }
});

/* ── Status is never colour alone ───────────────────────────────────────────── */

test('every state that has a colour also has a word', () => {
  // The row states, the connection states and the difficulty tones all render a label
  // beside their colour. This pins the three maps that would be the easiest to trim.
  const row = source(join(ROOT, 'design-system/components/Combat.tsx'));
  assert.match(row, /STATE_FLAG[\s\S]*active:[\s\S]*label: 'Turn'/);
  assert.match(row, /unconscious:[\s\S]*label: 'Down'/);
  assert.match(row, /defeated:[\s\S]*label: 'Out'/);

  const connection = source(join(ROOT, 'design-system/components/Feedback.tsx'));
  assert.match(connection, /CONNECTION_LABEL[\s\S]*live: 'Live'/);
  assert.match(connection, /reconnecting: 'Reconnecting'/);
  assert.match(connection, /offline: 'Offline'/);
});
