import type { Sql } from 'postgres';

/**
 * Keeps preview deployments away from the production database.
 *
 * Every production build stamps its database as `production` (a one-row table in a private schema
 * that the Supabase API does not expose). A preview build that finds that stamp skips migrations,
 * so an unmerged pull request can never change the production schema. A production build that
 * finds a `preview` stamp stops: it means the production variables point at the preview database.
 *
 * Local runs and CI (no VERCEL_ENV) migrate as before.
 */
export type MigrationDecision = { action: 'migrate' } | { action: 'skip'; reason: string };

export type DeployEnvironment = 'production' | 'preview' | 'development' | undefined;

export async function readStamp(sql: Sql): Promise<string | null> {
  const [exists] = await sql<{ ok: boolean }[]>`select to_regclass('orbita_internal.environment') is not null as ok`;
  if (!exists?.ok) return null;
  const [row] = await sql<{ value: string }[]>`select value from orbita_internal.environment where id = 1`;
  return row?.value ?? null;
}

async function writeStamp(sql: Sql, value: 'production' | 'preview') {
  await sql`create schema if not exists orbita_internal`;
  await sql`revoke all on schema orbita_internal from public`;
  await sql`create table if not exists orbita_internal.environment (id int primary key check (id = 1), value text not null, stamped_at timestamptz not null default now())`;
  await sql`insert into orbita_internal.environment (id, value) values (1, ${value}) on conflict (id) do nothing`;
}

export async function decideMigration(sql: Sql, env: DeployEnvironment): Promise<MigrationDecision> {
  if (env !== 'production' && env !== 'preview') return { action: 'migrate' };
  const stamp = await readStamp(sql);
  if (env === 'production') {
    if (stamp === 'preview')
      throw new Error('This database is stamped "preview" but a production build is using it. Point the Production DATABASE_URL at the production database.');
    if (!stamp) await writeStamp(sql, 'production');
    return { action: 'migrate' };
  }
  if (stamp === 'production')
    return {
      action: 'skip',
      reason: 'this preview build is connected to the production database. Give the Preview environment its own DATABASE_URL (docs/setup/deploy-r0.md, "Separate preview database").',
    };
  if (!stamp) await writeStamp(sql, 'preview');
  return { action: 'migrate' };
}
