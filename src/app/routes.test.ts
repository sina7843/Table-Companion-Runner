/**
 * Navigation and the route graph, checked against each other.
 *
 * The bug this exists for is small and silent: a route is removed, the sidebar entry that
 * pointed at it stays, and the only symptom is a "not found" the DM sees at the table. The
 * reverse is just as quiet — a screen that exists but nothing links to.
 *
 * `routes.tsx` builds a browser router, which needs a DOM, so the graph is read from the
 * source rather than imported. That is a weaker check than walking the real router and it
 * is stated as such: it catches a destination with no route, not a route that renders wrong.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { campaignNavGroups, globalNavGroups, PLAYER_NAV } from './nav.ts';

const routes = readFileSync(join(import.meta.dirname, 'routes.tsx'), 'utf8');

/** Every `path:` literal in the route graph, child paths included. */
const declared = new Set(
  [...routes.matchAll(/path:\s*'([^']*)'/g)].map((match) => match[1] as string),
);

/** A destination resolves if its last segment is declared, or it is a shell index route. */
function resolves(to: string): boolean {
  if (to === '/dm' || to === '/play') return declared.has(to);
  const child = to.replace(/^\/(dm|play)\//, '');
  return declared.has(child) || declared.has(to);
}

test('every DM sidebar destination has a route behind it', () => {
  const entries = [...globalNavGroups(), ...campaignNavGroups('c-test')].flatMap(
    (group) => group.items,
  );
  assert.ok(entries.length > 0, 'the navigation was found');

  for (const entry of entries) {
    // A campaign-scoped destination is `/dm/campaigns/<id>/party`; the id is data, so what
    // is checked is the section it ends in.
    const target = entry.to.startsWith('/dm/campaigns/')
      ? (entry.to.split('/').pop() as string)
      : entry.to;
    assert.ok(
      resolves(entry.to) || declared.has(target),
      `${entry.label} points at ${entry.to}, which no route serves`,
    );
  }
});

test('every player bottom-bar destination has a route behind it', () => {
  for (const entry of PLAYER_NAV) {
    assert.ok(resolves(entry.to), `${entry.label} points at ${entry.to}, which no route serves`);
  }
});

test('the bottom bar stays within thumb reach', () => {
  // The approved design ships five. A sixth is what pushes the row below a comfortable
  // touch target on a small phone, which is why My characters is reached from Home instead.
  assert.ok(PLAYER_NAV.length <= 5, 'the player bottom bar holds at most five destinations');
});

test('no routed screen renders a placeholder that never resolves', () => {
  // A route whose content is a bare skeleton reads as "still loading" forever. Every screen
  // either loads real data or does not exist — the two Library sections the design shows and
  // Phase 1 has no content for were removed rather than faked.
  const screens = readFileSync(join(import.meta.dirname, '..', 'screens', 'index.tsx'), 'utf8');
  assert.doesNotMatch(screens, /PendingSection/);

  for (const gone of ['/dm/spells', '/dm/items']) {
    assert.ok(!routes.includes(gone.replace('/dm/', "path: '") + "'"), `${gone} is not routed`);
  }
});
