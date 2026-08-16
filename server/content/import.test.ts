/**
 * The content pipeline against a real database: reproducibility, the licence gate, and what an
 * upgrade to a newer source revision does to what is already stored.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDatabase, type Database } from '../db.ts';
import { migrate } from '../migrate.ts';
import { ContentRefused, hashBundle, importBundle, loadContent } from './import.ts';
import { createContentLibrary } from '../../src/domain/content/model.ts';
import * as adapter from '../../src/domain/ruleset/dnd5e/content.ts';

const DATABASE_URL = process.env.DATABASE_URL?.trim();
const skip = DATABASE_URL
  ? false
  : 'DATABASE_URL is not set. Run `docker compose up -d` and see .env.example.';

const TEST_SCHEMA = 'tc_test_content';
let db: Database;

const SRD = {
  id: 'srd-5.1',
  name: 'System Reference Document 5.1',
  publisher: 'Wizards of the Coast LLC',
  version: '5.1',
  license: {
    id: 'cc-by-4.0',
    name: 'Creative Commons Attribution 4.0 International',
    url: 'https://creativecommons.org/licenses/by/4.0/',
    redistributable: true,
    attribution: 'Includes material from the SRD 5.1, CC BY 4.0.',
  },
};

const UNLICENSED = {
  ...SRD,
  id: 'rulebook',
  name: 'Published rulebooks',
  version: 'n/a',
  license: {
    id: 'not-licensed',
    name: 'No redistribution licence',
    url: '',
    redistributable: false,
    attribution: '',
  },
};

const record = (kind: string, key: string, name: string, data: Record<string, unknown> = {}) => ({
  kind,
  key,
  name,
  systemId: 'dnd5e-2024',
  data: { key, ...data },
});

const bundle = (source: unknown, records: unknown[]) => JSON.stringify({ source, records });

before(async () => {
  if (!DATABASE_URL) return;
  const root = createDatabase(DATABASE_URL);
  try {
    await root.query(`drop schema if exists ${TEST_SCHEMA} cascade`);
    await root.query(`create schema ${TEST_SCHEMA}`);
  } finally {
    await root.close();
  }
  db = createDatabase(DATABASE_URL, { schema: TEST_SCHEMA });
  await migrate(db);
});

after(async () => {
  await db?.close();
});

/* ── The licence gate ───────────────────────────────────────────────────────── */

test('a source that may not be redistributed is refused, by name', { skip }, async () => {
  const raw = bundle(UNLICENSED, [record('monster', 'beholder', 'Beholder')]);

  const refused = await assert.rejects(
    () => importBundle(db, raw, { isProduction: true, allowUnlicensed: true }),
    (error: unknown) => error instanceof ContentRefused && /production/.test(error.message),
  );
  assert.equal(refused, undefined);

  // Outside production it still refuses unless a developer says so explicitly, and the refusal
  // carries the reason rather than a status code.
  await assert.rejects(
    () => importBundle(db, raw, { isProduction: false }),
    (error: unknown) => error instanceof ContentRefused && /--allow-unlicensed/.test(error.message),
  );

  const [stored] = await db.query<{ total: number }>(
    'select count(*)::int as total from content_records',
  );
  assert.equal(stored?.total, 0, 'nothing was written by a refused import');
});

test(
  'a development-only source can be loaded and still never reaches a library',
  { skip },
  async () => {
    await importBundle(db, bundle(UNLICENSED, [record('monster', 'beholder', 'Beholder')]), {
      isProduction: false,
      allowUnlicensed: true,
    });

    const [row] = await db.query<{ redistributable: boolean }>(
      "select redistributable from content_sources where id = 'rulebook'",
    );
    assert.equal(row?.redistributable, false, 'it is in the database, marked');

    // `loadContent` is what a deployment builds its library from, and it filters on the column.
    const loaded = await loadContent(db);
    assert.equal(
      loaded.some((entry) => entry.source.id === 'rulebook'),
      false,
      'and it is not something a screen can be served',
    );

    await db.query("delete from content_sources where id = 'rulebook'");
  },
);

/* ── Reproducibility ────────────────────────────────────────────────────────── */

test('the same bundle imports to the same rows and the same hash', { skip }, async () => {
  const raw = bundle(SRD, [
    record('species', 'human', 'Human'),
    record('class', 'fighter', 'Fighter', { hitDie: 10 }),
  ]);

  const first = await importBundle(db, raw);
  assert.equal(first.imported, 2);
  assert.equal(first.unchanged, false, 'nothing was there before');
  assert.equal(first.contentHash, hashBundle(raw));

  const second = await importBundle(db, raw);
  assert.equal(second.contentHash, first.contentHash);
  assert.equal(second.unchanged, true, 'the same bytes are recognised as the same import');

  const [rows] = await db.query<{ total: number }>(
    "select count(*)::int as total from content_records where source_id = 'srd-5.1'",
  );
  assert.equal(rows?.total, 2, 'importing twice does not accumulate');
});

test('line endings do not change what a bundle hashes to', { skip }, () => {
  const unix = '{\n  "a": 1\n}\n';
  assert.equal(hashBundle(unix), hashBundle(unix.replaceAll('\n', '\r\n')));
});

test('a duplicate key inside one bundle is dropped once and reported', { skip }, async () => {
  const report = await importBundle(
    db,
    bundle(SRD, [
      record('species', 'human', 'Human'),
      record('species', 'human', 'Human (again)'),
      record('class', 'fighter', 'Fighter'),
    ]),
  );

  assert.equal(report.imported, 2);
  assert.deepEqual(report.duplicates, ['species:human']);

  const [kept] = await db.query<{ name: string }>(
    "select name from content_records where kind = 'species' and key = 'human'",
  );
  assert.equal(kept?.name, 'Human', 'the first won');
});

test(
  'a record the source cannot state properly is refused and the rest import',
  { skip },
  async () => {
    const report = await importBundle(
      db,
      bundle(SRD, [
        record('species', 'human', 'Human'),
        { ...record('species', 'elf', 'Elf'), kind: 'sorcery' },
        { ...record('class', 'fighter', 'Fighter'), surprise: true },
        record('class', 'cleric', 'Cleric'),
      ]),
    );

    assert.equal(report.imported, 2);
    assert.equal(report.problems.length, 2);
    assert.ok(report.problems.some((problem) => problem.where.includes('elf')));
  },
);

/* ── Upgrading a source ─────────────────────────────────────────────────────── */

test('a newer revision replaces a source rather than accumulating with it', { skip }, async () => {
  await importBundle(
    db,
    bundle(SRD, [
      record('species', 'human', 'Human'),
      record('species', 'dwarf', 'Dwarf'),
      record('class', 'fighter', 'Fighter', { hitDie: 10 }),
    ]),
  );

  // The next revision renames one record, drops another and changes a third.
  const upgraded = await importBundle(
    db,
    bundle({ ...SRD, version: '5.2' }, [
      record('species', 'human', 'Human (revised)'),
      record('class', 'fighter', 'Fighter', { hitDie: 12 }),
    ]),
  );

  assert.equal(upgraded.imported, 2);

  const rows = await db.query<{
    kind: string;
    key: string;
    name: string;
    data: { hitDie?: number };
  }>(
    "select kind, key, name, data from content_records where source_id = 'srd-5.1' order by kind, key",
  );
  assert.deepEqual(
    rows.map((row) => `${row.kind}:${row.key}`),
    ['class:fighter', 'species:human'],
    'the record the new revision dropped is gone, not orphaned',
  );
  assert.equal(rows.find((row) => row.key === 'human')?.name, 'Human (revised)');
  assert.equal(rows.find((row) => row.key === 'fighter')?.data.hitDie, 12);

  const [source] = await db.query<{ version: string }>(
    "select version from content_sources where id = 'srd-5.1'",
  );
  assert.equal(source?.version, '5.2', 'and the source says which revision it now is');
});

/* ── What a deployment serves ───────────────────────────────────────────────── */

test(
  'the shipped bundles import, and the adapter can be pointed at what was stored',
  { skip },
  async () => {
    await db.query('delete from content_sources');

    for (const file of ['content/srd-5.1/character.json', 'content/srd-5.1/monsters.json']) {
      // Both come from one source and must not wipe each other, which is what `bundleId` is for.
      const report = await importBundle(db, await readFile(file, 'utf8'), { bundleId: file });
      assert.ok(report.imported > 0, `${file} imported nothing`);
      assert.deepEqual(report.problems, [], `${file} had problems`);
    }

    const records = await loadContent(db);
    assert.ok(records.length > 100);
    assert.ok(
      records.every((record_) => record_.source.license.redistributable),
      'only shippable content comes back',
    );

    // The whole point of the seam: a deployment serves what it imported, not what was bundled.
    const stored = createContentLibrary(records);
    adapter.useContentLibrary(stored);
    try {
      assert.ok(adapter.classes().length >= 8, 'the builder catalogue came from the database');
      assert.ok(adapter.libraryMonsters().length >= 40);
      assert.ok(
        adapter.libraryMonsters().every((monster) => monster.source === SRD.name),
        'and every creature still says where it came from',
      );
      const spells = adapter.spellsByClass();
      assert.ok(Object.keys(spells).length > 0);
    } finally {
      adapter.useContentLibrary(adapter.currentLibrary());
    }
  },
);

test('every stored record is traceable to a source and a licence', { skip }, async () => {
  const [orphans] = await db.query<{ total: number }>(
    `select count(*)::int as total from content_records r
      left join content_sources s on s.id = r.source_id
      where s.id is null`,
  );
  assert.equal(orphans?.total, 0, 'a record without a source is a record nobody can answer for');

  const [attribution] = await db.query<{ attribution: string }>(
    "select attribution from content_sources where id = 'srd-5.1'",
  );
  assert.match(attribution?.attribution ?? '', /SRD 5\.1/);
});
