import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { baselineFromSupabase } from '../src/baseline';
import { testDatabaseUrl } from '../test-support/test-db';

const folder = path.resolve(import.meta.dirname, '../../../supabase/migrations');
const stub = readFileSync(path.resolve(import.meta.dirname, '../test-support/auth-stub.sql'), 'utf8');

describe.skipIf(!testDatabaseUrl)('migrations after Supabase already applied them', () => {
  const name = `orbita_test_baseline_${process.pid}`;
  const admin = () => postgres(testDatabaseUrl!, { max: 1, onnotice: () => {} });
  const url = () => {
    const u = new URL(testDatabaseUrl!);
    u.pathname = `/${name}`;
    return u.toString();
  };
  afterAll(async () => {
    const a = admin();
    await a.unsafe(`drop database if exists "${name}" with (force)`);
    await a.end();
  });

  it('records them instead of re-running them, then applies only new ones', async () => {
    const a = admin();
    await a.unsafe(`drop database if exists "${name}" with (force)`);
    await a.unsafe(`create database "${name}"`);
    await a.end();
    const sql = postgres(url(), { max: 1, onnotice: () => {} });
    try {
      await sql.unsafe(stub);
      // What the Supabase CLI / GitHub integration does: run each file and record its version.
      await sql`create schema supabase_migrations`;
      await sql`create table supabase_migrations.schema_migrations (version text primary key)`;
      for (const f of readdirSync(folder).filter((x) => x.endsWith('.sql')).sort()) {
        await sql.unsafe(readFileSync(path.join(folder, f), 'utf8'));
        await sql`insert into supabase_migrations.schema_migrations values (${f.split('_')[0]!})`;
      }
      const total = readdirSync(folder).filter((x) => x.endsWith('.sql')).length;
      expect(await baselineFromSupabase(sql, folder)).toBe(total);
      await migrate(drizzle(sql), { migrationsFolder: folder }); // would fail with "already exists" without the baseline
      expect(await baselineFromSupabase(sql, folder)).toBe(0); // idempotent
      const rows = await sql<{ n: number }[]>`select count(*)::int as n from drizzle.__drizzle_migrations`;
      expect(rows[0]?.n).toBe(total);
    } finally {
      await sql.end();
    }
  });
});
