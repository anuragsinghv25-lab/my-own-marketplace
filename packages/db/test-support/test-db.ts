/**
 * Creates a fresh database for one test run: drop → create → auth stub → migrations.
 * Uses TEST_DATABASE_URL (a server URL whose database will be replaced); tests skip when unset.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { createDb } from '../src/client';

const here = path.dirname(fileURLToPath(import.meta.url));

export const testDatabaseUrl = process.env.TEST_DATABASE_URL;

export async function freshTestDb(name: string) {
  if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is not set');
  const admin = postgres(testDatabaseUrl, { max: 1, onnotice: () => {} });
  const dbName = `orbita_test_${name}_${process.pid}`;
  await admin.unsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  const u = new URL(testDatabaseUrl);
  u.pathname = `/${dbName}`;
  const url = u.toString();

  const setup = postgres(url, { max: 1, onnotice: () => {} });
  await setup.unsafe(readFileSync(path.join(here, 'auth-stub.sql'), 'utf8'));
  await migrate(drizzle(setup), { migrationsFolder: path.resolve(here, '../../../supabase/migrations') });
  await setup.end();

  const { db, sql } = createDb(url, { max: 3 });
  return {
    db,
    sql,
    url,
    async drop() {
      await sql.end();
      const a = postgres(testDatabaseUrl!, { max: 1, onnotice: () => {} });
      await a.unsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
      await a.end();
    },
  };
}
