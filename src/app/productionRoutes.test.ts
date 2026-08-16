import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./routes.tsx', import.meta.url), 'utf8');

test('the showcase route is explicitly gated to development', () => {
  assert.match(
    source,
    /import\.meta\.env\.DEV\s*\?\s*\[\{\s*path:\s*'\/dev\/showcase'/,
    'the fidelity showcase must not be present in the production route graph',
  );
});
