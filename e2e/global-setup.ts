/**
 * Builds the world the end-to-end suite runs in, once, before anything opens a browser.
 *
 * Drop, create, migrate, seed, start. The drop is why this points at a database of its own:
 * a suite that resets state is only safe when the state is its own, and `stack.ts` refuses to
 * be pointed at the developer's.
 */
import { Client } from 'pg';
import { createDatabase } from '../server/db.ts';
import { migrate } from '../server/migrate.ts';
import { seed } from '../server/seed.ts';
import { e2eDatabaseUrl, REMOTE_BASE_URL, startStack } from './stack.ts';

/** Creates the database itself, from the maintenance database beside it. */
async function recreateDatabase(url: string): Promise<void> {
  const target = new URL(url);
  const name = target.pathname.replace(/^\//, '');

  const admin = new URL(url);
  admin.pathname = '/postgres';

  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    // Sessions still attached would make the drop fail, and a leftover connection from a
    // previous run is exactly the thing that makes a suite "flaky on the second attempt".
    await client.query(
      `select pg_terminate_backend(pid) from pg_stat_activity
        where datname = $1 and pid <> pg_backend_pid()`,
      [name],
    );
    await client.query(`drop database if exists "${name}"`);
    await client.query(`create database "${name}"`);
  } finally {
    await client.end();
  }
}

export default async function globalSetup(): Promise<void> {
  // Against a deployment, its database is its own. Dropping it would be the single most
  // destructive thing this repository could do, so the remote path never reaches the drop.
  if (REMOTE_BASE_URL) {
    await startStack();
    return;
  }

  const url = e2eDatabaseUrl();
  await recreateDatabase(url);

  const db = createDatabase(url);
  try {
    await migrate(db);
    await seed(db);
  } finally {
    await db.close();
  }

  await startStack();
}
