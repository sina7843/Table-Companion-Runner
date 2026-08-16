/**
 * Fidelity to the approved design system.
 *
 * The vendored CSS under `tokens/`, `components/css/` and `skins/` is a verbatim copy of
 * the approved source and is the visual contract. These checks are about the things that
 * drift *around* it: a screen inventing a colour, an application-layer stylesheet
 * restating a number the system already holds, a parallel type scale appearing one inline
 * style at a time.
 *
 * The design's own closing audit is the standard being applied: "No screen introduces a
 * container style, colour or type size that does not appear elsewhere."
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');

function filesUnder(dir: string, extensions: string[]): string[] {
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

/** The declared value of one custom property, or undefined when it is not there. */
const read = (text: string, token: string) =>
  new RegExp(`${token.replaceAll('-', '\\-')}\\s*:\\s*([^;]+);`).exec(text)?.[1]?.trim();

const screenFiles = () => [
  ...filesUnder(join(ROOT, 'screens'), ['.tsx']),
  ...filesUnder(join(ROOT, 'app'), ['.tsx']),
];

/* ── Colour ─────────────────────────────────────────────────────────────────── */

test('no screen names a colour the design system does not', () => {
  // Every hue in this product comes from a token. A literal here is a second palette
  // starting, and the second one never gets updated with the first.
  const offenders: string[] = [];

  for (const file of screenFiles()) {
    const literals = source(file).match(/#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)/g);
    if (literals) offenders.push(`${file.replace(ROOT, 'src')}: ${literals.join(', ')}`);
  }

  assert.deepEqual(offenders, [], 'colour belongs to the design system, not to a screen');
});

test('the application stylesheets name no colour of their own either', () => {
  const ours = [
    source(join(ROOT, 'app/shell.css')),
    source(join(ROOT, 'design-system/components/adapters.css')),
  ];

  for (const css of ours) {
    const literals = css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .match(/#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)/g);
    assert.equal(literals, null, `a literal colour appeared: ${literals?.join(', ')}`);
  }
});

/* ── Numbers the system already holds ───────────────────────────────────────── */

test('the application layer does not restate a number the tokens already carry', () => {
  // 232, 56, 360, 440, 48, 40, 44, 52 all exist as named layout or density tokens. Writing
  // one as a literal is how a frame stops moving when the system moves.
  const held: Record<string, string> = {
    '232px': '--layout-sidebar-width',
    '360px': '--layout-context-panel-width',
    '440px': '--layout-context-panel-wide',
    '48px': '--layout-topbar-height',
    '44px': '--touch-target-min',
  };

  const css = source(join(ROOT, 'app/shell.css')).replace(/\/\*[\s\S]*?\*\//g, '');
  const offenders: string[] = [];

  for (const [literal, token] of Object.entries(held)) {
    // A media query legitimately spells its breakpoint out — the design system documents
    // that its breakpoints are "mirrored literally in media queries".
    const outsideQueries = css
      .split('\n')
      .filter((line) => !line.includes('@media'))
      .join('\n');
    if (outsideQueries.includes(`: ${literal}`))
      offenders.push(`${literal} should be var(${token})`);
  }

  assert.deepEqual(offenders, []);
});

/* ── Type ───────────────────────────────────────────────────────────────────── */

test('every off-scale type size in a screen is one the approved design itself draws', () => {
  // The design's canvas uses a handful of sizes that are not on the token ramp — 26px for a
  // builder step title, 28px for the live-combat band, 22px, 20px, 19px, 14.5px, 12.5px.
  // Matching them is fidelity; inventing a new one is not. This is the closed list, and it
  // is closed on purpose: a new number here is a decision, not a detail.
  const fromTheDesign = new Set([12.5, 14.5, 19, 20, 22, 26, 28]);

  const offenders: string[] = [];
  for (const file of screenFiles()) {
    for (const match of source(file).matchAll(
      /fontSize:\s*'?([0-9]+(?:\.[0-9]+)?)(?:px)?'?[,\s}]/g,
    )) {
      const size = Number(match[1]);
      if (!fromTheDesign.has(size)) {
        offenders.push(`${file.replace(ROOT, 'src')}: fontSize ${size}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'a size not on the token ramp must be one the approved design draws',
  );
});

/* ── The vendored contract ──────────────────────────────────────────────────── */

test('the token ramp is the approved one, unchanged', () => {
  const css = source(join(ROOT, 'design-system/tokens/typography.css'));
  for (const [token, value] of Object.entries({
    '--text-display-size': '38px',
    '--text-page-title-size': '24px',
    '--text-section-title-size': '17px',
    '--text-card-title-size': '14px',
    '--text-mono-size': '12.5px',
    '--tracking-caps': '0.06em',
  })) {
    const match = new RegExp(`${token.replaceAll('-', '\\-')}\\s*:\\s*([^;]+);`).exec(css);
    assert.equal(match?.[1]?.trim(), value, `${token} has drifted from the approved source`);
  }
});

test('the three densities are the approved ones', () => {
  const css = source(join(ROOT, 'design-system/tokens/layout.css')).replaceAll('\r', '');

  const block = (selector: string) => {
    const start = css.indexOf(selector);
    assert.ok(start >= 0, `${selector} is missing`);
    return css.slice(start, css.indexOf('}', start));
  };

  // Comfortable is the default and lives on :root.
  assert.equal(read(css, '--density-row-height'), '40px');
  assert.equal(read(css, '--touch-target-min'), '44px');

  const compact = block("[data-density='compact']");
  assert.equal(read(compact, '--density-row-height'), '32px');
  assert.equal(read(compact, '--density-font-size'), 'var(--font-size-13)');

  const touch = block("[data-density='touch']");
  assert.equal(read(touch, '--density-row-height'), '52px');
  // The touch small control was raised to the 44px floor in TC-01; it must not slip back.
  assert.equal(read(touch, '--density-control-height-sm'), '44px');
});

test('the frame proportions come from tokens, not from the shell', () => {
  const nav = source(join(ROOT, 'design-system/components/css/nav.css'));
  assert.match(nav, /width: var\(--layout-sidebar-width\)/);
  assert.match(nav, /width: var\(--layout-sidebar-collapsed\)/);
  assert.match(nav, /var\(--layout-bottom-nav-height\)/);

  const shell = source(join(ROOT, 'app/shell.css'));
  assert.match(shell, /height: var\(--layout-topbar-height\)/);
  assert.match(shell, /var\(--layout-context-panel-wide\)/);
});

/* ── Micro-interaction ──────────────────────────────────────────────────────── */

test('nothing is allowed to animate for longer than the flash the design permits', () => {
  const motion = source(join(ROOT, 'design-system/tokens/motion.css'));
  const durations = [...motion.matchAll(/--duration-[a-z]+:\s*([0-9]+)ms/g)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value));

  assert.ok(durations.length > 0);
  assert.equal(
    Math.max(...durations),
    900,
    'the realtime highlight is the longest thing the design animates',
  );

  // The runner restates that number because a timeout cannot read a custom property.
  const runner = source(join(ROOT, 'screens/combat/CombatRunner.tsx'));
  assert.match(runner, /const FLASH_MS = 900;/);
  assert.match(runner, /--duration-flash/);
});
