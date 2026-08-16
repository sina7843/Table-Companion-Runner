/**
 * The PostgreSQL connection, and the only place `pg` is imported.
 *
 * Two operations, because two is all the store needs: run a statement, and run several
 * inside one transaction. No query builder, no ORM, no migrations framework — the schema is
 * SQL files and the queries are SQL strings, which is the smallest thing that can be read
 * and reviewed as what actually reaches the database.
 *
 * `tx` hands the callback a `Db` bound to one client, so a store method written against the
 * interface works identically inside and outside a transaction.
 */
import pg from 'pg';

// `pg` is CommonJS. The default-import-then-destructure form is the one that works under
// Node's ESM/CJS interop regardless of how named exports are detected.
const { Pool } = pg;

export interface Db {
  /** Runs a statement and returns its rows. */
  query<TRow>(text: string, params?: readonly unknown[]): Promise<TRow[]>;
  /**
   * Runs `fn` inside a transaction, committing on return and rolling back on throw.
   *
   * Nested calls reuse the enclosing transaction rather than opening a second one, so a
   * store method that transacts internally is still safe to call from a larger transaction.
   */
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
}

export interface Database extends Db {
  close(): Promise<void>;
}

function clientDb(client: pg.PoolClient): Db {
  return {
    async query<TRow>(text: string, params: readonly unknown[] = []): Promise<TRow[]> {
      const result = await client.query(text, params as unknown[]);
      return result.rows as TRow[];
    },
    // Already inside a transaction: run the callback on the same client. Opening a second
    // BEGIN here would be a silent no-op in PostgreSQL and a lie in the code.
    tx: (fn) => fn(clientDb(client)),
  };
}

export interface DatabaseOptions {
  /**
   * PostgreSQL schema to resolve unqualified names against.
   *
   * Every pooled connection is opened with this `search_path`, which is what lets the
   * integration tests build the whole schema in a namespace of their own and leave a
   * developer's working data untouched.
   */
  schema?: string;
  /** Where a dropped idle connection is reported. Injectable so tests stay quiet. */
  onPoolError?: (error: unknown) => void;
}

export function createDatabase(connectionString: string, options: DatabaseOptions = {}): Database {
  const pool = new Pool({
    connectionString,
    ...(options.schema ? { options: `-c search_path=${options.schema}` } : {}),
  });

  // An idle pooled connection can be dropped by the server at any time — a restart, a
  // failover, an administrator disconnecting it. `pg` reports that as an `error` event on
  // the pool, and an unhandled one is an uncaught exception that takes the whole process
  // down. A database blip must not be an API outage: the broken client is discarded, the
  // next request opens a new one, and only the log knows it happened.
  pool.on('error', (error) => {
    (options.onPoolError ?? ((cause) => process.stderr.write(`[database] ${String(cause)}\n`)))(
      error,
    );
  });

  return {
    async query<TRow>(text: string, params: readonly unknown[] = []): Promise<TRow[]> {
      const result = await pool.query(text, params as unknown[]);
      return result.rows as TRow[];
    },

    async tx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const value = await fn(clientDb(client));
        await client.query('COMMIT');
        return value;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {
          // A rollback that fails means the connection is already gone; the original
          // error is the one worth reporting, so it is not replaced here.
        });
        throw error;
      } finally {
        client.release();
      }
    },

    close: () => pool.end(),
  };
}

/** ISO-8601, the format every `Timestamp` in the domain uses. */
export function iso(value: Date | string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
