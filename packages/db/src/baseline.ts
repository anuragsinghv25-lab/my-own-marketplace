import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import type postgres from 'postgres';

/**
 * Migrations can reach the database two ways: our Vercel build (Drizzle, tracked in
 * drizzle.__drizzle_migrations) or Supabase's GitHub integration / `supabase db push`
 * (tracked in supabase_migrations.schema_migrations). Both read supabase/migrations.
 *
 * If Supabase already applied some files, record them in Drizzle's table first so Drizzle
 * does not run them a second time. Returns how many migrations were recorded.
 */
export async function baselineFromSupabase(sql: postgres.Sql, migrationsFolder: string): Promise<number> {
  const [state] = await sql<{ supa: boolean }[]>`
    select to_regclass('supabase_migrations.schema_migrations') is not null as supa`;
  if (!state?.supa) return 0;

  const applied = new Set(
    (await sql<{ version: string }[]>`select version from supabase_migrations.schema_migrations`).map((r) => r.version),
  );
  const journal = JSON.parse(readFileSync(path.join(migrationsFolder, 'meta/_journal.json'), 'utf8')) as {
    entries: { tag: string; when: number }[];
  };
  const files = readMigrationFiles({ migrationsFolder });

  await sql`create schema if not exists drizzle`;
  await sql`create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`;
  const recorded = new Set(
    (await sql<{ created_at: string }[]>`select created_at from drizzle.__drizzle_migrations`).map((r) => Number(r.created_at)),
  );

  let count = 0;
  for (const [i, entry] of journal.entries.entries()) {
    const version = entry.tag.split('_')[0]!;
    if (!applied.has(version)) break; // only a contiguous prefix; anything after it Drizzle applies normally
    if (recorded.has(entry.when)) continue;
    await sql`insert into drizzle.__drizzle_migrations (hash, created_at) values (${files[i]!.hash}, ${entry.when})`;
    count++;
  }
  return count;
}
