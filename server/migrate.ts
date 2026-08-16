/**
 * The migration runner.
 *
 * A directory of `.sql` files applied in filename order, each inside its own transaction,
 * each recorded by name in `schema_migrations`. That is the whole tool — a dependency for
 * this would be a dependency for forty lines.
 *
 * Migrations are additive by policy. Nothing here drops, truncates or resets anything, and
 * an already-applied file is skipped rather than re-run, so `npm run db:migrate` is safe to
 * run against a database a developer is in the middle of using.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase, type Db } from './db.ts';
import { readConfig } from './config.ts';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

async function readMigrations(): Promise<{ name: string; sql: string }[]> {
  const names = (await readdir(MIGRATIONS_DIR))
    .filter((name) => name.endsWith('.sql'))
    // Filenames are zero-padded (`001_`, `002_`), so a plain sort is the intended order.
    .toSorted((a, b) => a.localeCompare(b));

  return Promise.all(
    names.map(async (name) => ({
      name,
      sql: await readFile(path.join(MIGRATIONS_DIR, name), 'utf8'),
    })),
  );
}

export async function migrate(db: Db): Promise<MigrationResult> {
  await db.query(`
    create table if not exists schema_migrations (
      name       text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const done = new Set(
    (await db.query<{ name: string }>('select name from schema_migrations')).map((row) => row.name),
  );

  const result: MigrationResult = { applied: [], skipped: [] };

  for (const migration of await readMigrations()) {
    if (done.has(migration.name)) {
      result.skipped.push(migration.name);
      continue;
    }
    // One transaction per file: a migration that fails half way leaves the database on the
    // last complete version rather than on a shape no file describes.
    await db.tx(async (tx) => {
      await tx.query(migration.sql);
      await tx.query('insert into schema_migrations (name) values ($1)', [migration.name]);
    });
    result.applied.push(migration.name);
  }

  return result;
}

/**
 * What has not been applied yet, without applying anything.
 *
 * This is what makes a migration an explicit deployment step rather than a side effect of a
 * process starting: a release can ask "is the schema behind?" before it routes traffic, and a
 * readiness check can answer "not yet" instead of serving against a shape the code does not
 * expect. It creates the bookkeeping table if it is missing — reading is not a write anybody
 * has to think about — and touches nothing else.
 */
export async function pendingMigrations(db: Db): Promise<string[]> {
  await db.query(`
    create table if not exists schema_migrations (
      name       text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const done = new Set(
    (await db.query<{ name: string }>('select name from schema_migrations')).map((row) => row.name),
  );
  return (await readMigrations()).map((entry) => entry.name).filter((name) => !done.has(name));
}

/** True when this file was started directly, rather than imported by the server or a test. */
function isEntrypoint(): boolean {
  const invoked = process.argv[1];
  return invoked !== undefined && path.resolve(invoked) === fileURLToPath(import.meta.url);
}

if (isEntrypoint()) {
  const config = readConfig();
  const db = createDatabase(config.databaseUrl);

  // `--check` applies nothing and exits non-zero when the schema is behind, which is what a
  // deployment gate and a CI job both want: a question with an exit code.
  const check = process.argv.includes('--check');

  try {
    if (check) {
      const pending = await pendingMigrations(db);
      process.stdout.write(
        pending.length > 0
          ? `${pending.length} migration(s) pending: ${pending.join(', ')}\n`
          : 'Schema is up to date.\n',
      );
      if (pending.length > 0) process.exitCode = 1;
    } else {
      const { applied, skipped } = await migrate(db);
      process.stdout.write(
        applied.length > 0
          ? `Applied ${applied.length} migration(s): ${applied.join(', ')}\n`
          : `Nothing to apply; ${skipped.length} migration(s) already in place.\n`,
      );
    }
  } finally {
    await db.close();
  }
}
