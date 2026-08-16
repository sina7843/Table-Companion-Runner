/**
 * The content pipeline: a bundle on disk becomes normalised rows, or is refused.
 *
 * Deterministic by construction. The same bundle imported twice produces the same rows and the
 * same content hash; a source is replaced wholesale rather than merged into, so an import is
 * a statement of what that source now contains rather than an accumulation of everything it
 * has ever contained.
 *
 * **The legal boundary is enforced here and only here.** A source whose licence does not permit
 * redistribution is refused in production, by name, with the reason from `SOURCE_VERDICTS`. A
 * developer on their own machine can override that with an explicit flag, which is the whole
 * distinction between "usable for development" and "shippable" — and the flag is refused when
 * `NODE_ENV=production`, so there is no configuration that quietly ships unlicensed content.
 *
 * Source-shape parsing lives in this directory and nowhere else. No UI component and no generic
 * domain module knows what an SRD record looks like; by the time content leaves here it is a
 * `ContentRecord` and the shape it arrived in is forgotten.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mayRedistribute, verdictFor } from '../../src/domain/content/licenses.ts';
import type { ContentRecord, SourceRef } from '../../src/domain/content/model.ts';
import { validateBundle } from '../../src/domain/content/validate.ts';
import { readConfig } from '../config.ts';
import { createDatabase, type Db } from '../db.ts';
import { migrate } from '../migrate.ts';

/** Where the bundles live, relative to the repository root. */
const CONTENT_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'content');

export interface ImportOptions {
  /**
   * Which bundle this is, within its source.
   *
   * A source can be split across files — the SRD is a character catalogue and a bestiary — and
   * an import replaces the bundle it names rather than everything the source has provided.
   * Defaults to the source id, which is right when a source is one file.
   */
  bundleId?: string;
  /**
   * Import a source whose licence does not permit redistribution.
   *
   * For a developer working against a dataset they may read and may not ship. Refused outright
   * when `NODE_ENV=production`: there is no combination of flags that puts unlicensed content
   * in front of a user.
   */
  allowUnlicensed?: boolean;
  isProduction?: boolean;
}

export interface ImportReport {
  source: SourceRef;
  contentHash: string;
  imported: number;
  /** How many of them were creatures, which also reach the library the app serves. */
  creatures: number;
  /** Records dropped because an earlier record in the same bundle claimed the key. */
  duplicates: string[];
  problems: { where: string; message: string }[];
  /** True when this bundle produced exactly what the previous import of it did. */
  unchanged: boolean;
}

export class ContentRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentRefused';
  }
}

/** Stable across machines and runs: the bytes that were imported, not the object they became. */
export const hashBundle = (raw: string): string =>
  createHash('sha256').update(raw.replaceAll('\r\n', '\n')).digest('hex');

/**
 * Imports one bundle.
 *
 * Everything happens in one transaction, including the delete: a half-replaced source is a
 * catalogue nobody can reason about, and the alternative to atomicity here is a library that is
 * briefly missing half its creatures.
 */
export async function importBundle(
  db: Db,
  raw: string,
  options: ImportOptions = {},
): Promise<ImportReport> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new ContentRefused('That bundle is not valid JSON.');
  }

  const checked = validateBundle(parsed);
  if (checked.problems.length > 0 && checked.records.length === 0) {
    throw new ContentRefused(
      `That bundle did not validate: ${checked.problems[0]?.where} — ${checked.problems[0]?.message}`,
    );
  }

  const source = checked.records[0]?.source ?? (parsed as { source?: SourceRef }).source;
  if (!source) throw new ContentRefused('That bundle names no source.');

  if (!mayRedistribute(source.license)) {
    const verdict = verdictFor(source.id);
    if (options.isProduction) {
      throw new ContentRefused(
        `Refusing to import "${source.name}" into production: ${source.license.name}. ` +
          (verdict?.reason ?? 'No licence permits redistributing it.'),
      );
    }
    if (!options.allowUnlicensed) {
      throw new ContentRefused(
        `"${source.name}" is not redistributable (${source.license.name}). ` +
          `${verdict?.reason ?? ''} Pass --allow-unlicensed to load it for development only.`,
      );
    }
  }

  const contentHash = hashBundle(raw);
  const bundleId = options.bundleId ?? source.id;

  return db.tx(async (tx) => {
    const [existing] = await tx.query<{ content_hash: string }>(
      'select content_hash from content_sources where id = $1',
      [source.id],
    );

    await tx.query(
      `insert into content_sources
         (id, name, publisher, version, url, license_id, license_name, license_url,
          redistributable, attribution, content_hash, record_count, imported_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
       on conflict (id) do update set
         name = excluded.name, publisher = excluded.publisher, version = excluded.version,
         url = excluded.url, license_id = excluded.license_id,
         license_name = excluded.license_name, license_url = excluded.license_url,
         redistributable = excluded.redistributable, attribution = excluded.attribution,
         content_hash = excluded.content_hash,
         -- A source split across bundles counts what it now holds, not the last file seen.
         record_count = (
           select count(*) from content_records where source_id = excluded.id
         ) + excluded.record_count,
         imported_at = now()`,
      [
        source.id,
        source.name,
        source.publisher,
        source.version,
        source.url ?? null,
        source.license.id,
        source.license.name,
        source.license.url,
        source.license.redistributable,
        source.license.attribution,
        contentHash,
        checked.records.length,
      ],
    );

    // Replaced, not merged, and scoped to this bundle. A record the bundle dropped has to
    // disappear; a record from the source's *other* bundle has to survive.
    await tx.query('delete from content_records where source_id = $1 and bundle_id = $2', [
      source.id,
      bundleId,
    ]);

    for (const record of checked.records) {
      await tx.query(
        `insert into content_records (system_id, kind, key, name, source_id, bundle_id, data)
         values ($1,$2,$3,$4,$5,$6,$7::jsonb)
         on conflict (system_id, kind, key) do update set
           name = excluded.name, source_id = excluded.source_id,
           bundle_id = excluded.bundle_id, data = excluded.data`,
        [
          record.systemId,
          record.kind,
          record.key,
          record.name,
          source.id,
          bundleId,
          JSON.stringify(record.data),
        ],
      );
    }

    // Creatures also land in `monsters`, which is the table the library screen reads.
    //
    // Without this an imported catalogue is invisible: `content_records` holds it, the
    // repository serves `monsters`, and a fresh deployment shows an empty library however many
    // times the import ran. Only `db:seed` filled that table — and seeding demo data is not
    // something a production deployment does. TC-P09 found it by pointing the end-to-end suite
    // at a clean staging container, which is exactly what that validation is for.
    //
    // `origin` is `library` and the owner is nobody, which is what the database's own check
    // constraint requires of ingested reference data and what makes it uneditable.
    const creatures = checked.records.filter((record) => record.kind === 'monster');
    for (const creature of creatures) {
      const monster = creature.data as Record<string, unknown>;
      await tx.query(
        `insert into monsters (id, system_id, name, subtitle, origin, owner_user_id, cloned_from,
           challenge_label, challenge_rank, source, facets, attributes, health, derived, traits,
           action_groups, system_data, source_id, license_id)
         values ($1,$2,$3,$4,'library',null,null,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,
                 $11::jsonb,$12::jsonb,$13::jsonb,$14::jsonb,$15,$16)
         on conflict (id) do update set
           system_id = excluded.system_id, name = excluded.name, subtitle = excluded.subtitle,
           challenge_label = excluded.challenge_label, challenge_rank = excluded.challenge_rank,
           source = excluded.source, facets = excluded.facets, attributes = excluded.attributes,
           health = excluded.health, derived = excluded.derived, traits = excluded.traits,
           action_groups = excluded.action_groups, system_data = excluded.system_data,
           source_id = excluded.source_id, license_id = excluded.license_id
         where monsters.origin = 'library'`,
        [
          String(monster.id ?? `m-${creature.key}`),
          creature.systemId,
          creature.name,
          String(monster.subtitle ?? ''),
          String(monster.challengeLabel ?? ''),
          Number(monster.challengeRank ?? 0),
          source.name,
          JSON.stringify(monster.facets ?? {}),
          JSON.stringify(monster.attributes ?? []),
          JSON.stringify(monster.health ?? { current: 1, max: 1, temporary: 0 }),
          JSON.stringify(monster.derived ?? []),
          JSON.stringify(monster.traits ?? []),
          JSON.stringify(monster.actionGroups ?? []),
          JSON.stringify(monster.systemData ?? {}),
          source.id,
          source.license.id,
        ],
      );
    }

    return {
      source,
      contentHash,
      imported: checked.records.length,
      creatures: creatures.length,
      duplicates: checked.duplicates,
      problems: checked.problems,
      unchanged: existing?.content_hash === contentHash,
    };
  });
}

/** Every bundle under a directory, in filename order so a run is reproducible. */
export async function bundlePaths(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries.toSorted((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await bundlePaths(full)));
    else if (entry.name.endsWith('.json')) files.push(full);
  }
  return files;
}

/** Reads every content record back out, for building a library on the server. */
export async function loadContent(db: Db): Promise<ContentRecord[]> {
  const rows = await db.query<{
    system_id: string;
    kind: ContentRecord['kind'];
    key: string;
    name: string;
    data: Record<string, unknown>;
    source_id: string;
    source_name: string;
    publisher: string;
    version: string;
    url: string | null;
    license_id: string;
    license_name: string;
    license_url: string;
    redistributable: boolean;
    attribution: string;
  }>(
    `select r.system_id, r.kind, r.key, r.name, r.data,
            s.id as source_id, s.name as source_name, s.publisher, s.version, s.url,
            s.license_id, s.license_name, s.license_url, s.redistributable, s.attribution
       from content_records r join content_sources s on s.id = r.source_id
      -- Only what may be shipped. A development-only source can sit in the database and
      -- still never reach a screen.
      where s.redistributable
      order by r.kind, r.key`,
  );

  return rows.map((row) => ({
    key: row.key,
    systemId: row.system_id as ContentRecord['systemId'],
    kind: row.kind,
    name: row.name,
    data: row.data,
    source: {
      id: row.source_id,
      name: row.source_name,
      publisher: row.publisher,
      version: row.version,
      license: {
        id: row.license_id,
        name: row.license_name,
        url: row.license_url,
        redistributable: row.redistributable,
        attribution: row.attribution,
      },
      ...(row.url ? { url: row.url } : {}),
    },
  }));
}

/* ── The script ─────────────────────────────────────────────────────────────── */

if (process.argv[1]?.endsWith('import.ts')) {
  const config = readConfig();
  const allowUnlicensed = process.argv.includes('--allow-unlicensed');
  const directory = process.argv
    .find((value) => value.startsWith('--from='))
    ?.slice('--from='.length);

  const db = createDatabase(config.databaseUrl);
  try {
    await migrate(db);

    const root = directory ? path.resolve(directory) : path.join(CONTENT_ROOT, 'srd-5.1');
    const files = await bundlePaths(root);
    if (files.length === 0) {
      process.stderr.write(`No bundles under ${root}.\n`);
      process.exit(1);
    }

    for (const file of files) {
      const raw = await readFile(file, 'utf8');
      const report = await importBundle(db, raw, {
        allowUnlicensed,
        isProduction: config.isProduction,
        bundleId: path.relative(CONTENT_ROOT, file).replaceAll('\\', '/'),
      });
      process.stdout.write(
        `${path.relative(process.cwd(), file)} → ${report.imported} records from ` +
          `${report.source.name} ${report.source.version} (${report.source.license.name})` +
          `${report.unchanged ? ' — unchanged' : ''}\n`,
      );
      for (const duplicate of report.duplicates) {
        process.stdout.write(`  duplicate key dropped: ${duplicate}\n`);
      }
      for (const problem of report.problems) {
        process.stdout.write(`  refused: ${problem.where} — ${problem.message}\n`);
      }
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  } finally {
    await db.close();
  }
}
