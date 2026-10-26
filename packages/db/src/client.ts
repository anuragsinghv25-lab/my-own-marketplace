import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { appDatabaseUrl } from './url';

export type Database = PostgresJsDatabase<typeof schema>;
/** A transaction handle has the same query API as the database. */
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
export type DbOrTx = Database | Tx;

declare global {
  // Reuse one pool per server instance (and across hot reloads in dev).
  var __orbitaDb: { db: Database; sql: postgres.Sql } | undefined;
}

export function createDb(url: string, opts: { max?: number } = {}) {
  const sql = postgres(url, {
    // The transaction pooler does not support prepared statements.
    prepare: false,
    max: opts.max ?? 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return { db: drizzle(sql, { schema, casing: 'snake_case' }), sql };
}

export function getDb(): Database {
  if (!globalThis.__orbitaDb) {
    const url = appDatabaseUrl();
    if (!url) throw new Error('DATABASE_URL (or POSTGRES_URL) is not set.');
    globalThis.__orbitaDb = createDb(url);
  }
  return globalThis.__orbitaDb.db;
}
