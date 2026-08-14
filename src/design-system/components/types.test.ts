import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cx, hpBand } from './types.ts';

// hpBand is the one piece of real logic in the adapter layer: it decides which of the
// four approved hit-point colours a row shows. Getting a boundary wrong means a
// bloodied character reads as healthy at the table, so the boundaries are pinned here.
test('hpBand maps hit points to the approved bands', () => {
  assert.equal(hpBand(58, 58), 'healthy');
  assert.equal(hpBand(30, 58), 'healthy', 'just over half is still healthy');
  assert.equal(hpBand(29, 58), 'damaged', 'exactly half is damaged');
  assert.equal(hpBand(12, 41), 'damaged', "the design's own 'Bloodied' sample");
  assert.equal(hpBand(15, 58), 'damaged');
  assert.equal(hpBand(14, 58), 'critical', 'a quarter or less is critical');
  assert.equal(hpBand(1, 58), 'critical');
  assert.equal(hpBand(0, 58), 'down');
  assert.equal(hpBand(-6, 58), 'down', 'overkill damage stays down, never wraps');
});

test('hpBand survives a zero or missing maximum', () => {
  // A monster saved without hit points is exactly what the design's "Encounter could
  // not start" error exists for — this must not divide by zero on the way there.
  assert.equal(hpBand(0, 0), 'down');
  assert.equal(hpBand(5, 0), 'healthy');
});

test('cx drops falsy class names', () => {
  assert.equal(cx('tc-btn', false, null, undefined, 'tc-btn--primary'), 'tc-btn tc-btn--primary');
  assert.equal(cx(), '');
});
