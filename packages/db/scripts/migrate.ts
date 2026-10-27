/**
 * Applies pending migrations from supabase/migrations.
 * Runs in the Vercel build (see apps/web/vercel.json) and in CI against a throwaway database.
 * Set SKIP_DB_MIGRATE=1 to skip.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { baselineFromSupabase } from '../src/baseline';
import { migrationDatabaseUrl } from '../src/url';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(here, '../../../supabase/migrations');

async function main() {
  if (process.env.SKIP_DB_MIGRATE === '1') {
    console.log('[migrate] SKIP_DB_MIGRATE=1, skipping.');
    return;
  }
  const url = migrationDatabaseUrl();
  if (!url) {
    console.warn('[migrate] No database URL found, skipping. Set DATABASE_URL or connect Supabase to Vercel.');
    return;
  }
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const started = Date.now();
    const baselined = await baselineFromSupabase(sql, migrationsFolder);
    if (baselined) console.log(`[migrate] ${baselined} migration(s) were already applied by Supabase; recorded them.`);
    await migrate(drizzle(sql), { migrationsFolder });
    console.log(`[migrate] Up to date (${Date.now() - started} ms).`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('[migrate] Failed:', err);
  process.exit(1);
});
