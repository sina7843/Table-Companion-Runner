import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDataSource } from './dataSource.ts';

test('development may deliberately run on fixtures with no API configured', () => {
  const source = createDataSource({ env: { PROD: false } });
  try {
    assert.equal(source.kind, 'fixtures');
  } finally {
    source.channel.close();
  }
});

test('production refuses to fall back to fixtures', () => {
  assert.throws(
    () => createDataSource({ env: { PROD: true } }),
    /Production requires VITE_API_BASE_URL/,
  );
});

test('production uses the API when it is configured', () => {
  const source = createDataSource({
    env: { PROD: true, VITE_API_BASE_URL: '/api' },
  });
  try {
    assert.equal(source.kind, 'api');
    assert.equal(source.description, 'API at /api');
  } finally {
    source.channel.close();
  }
});
