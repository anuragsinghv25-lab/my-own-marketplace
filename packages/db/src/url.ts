/**
 * Picks and cleans the Postgres connection string.
 *
 * - App (serverless functions): the Supabase **transaction pooler** (port 6543).
 * - Migrations: a session connection (port 5432), because DDL and advisory locks
 *   want a real session.
 *
 * Names cover both a hand-made setup (DATABASE_URL) and the variables the
 * Supabase ↔ Vercel integration creates (POSTGRES_URL, POSTGRES_URL_NON_POOLING).
 */
export function appDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return clean(env.DATABASE_URL ?? env.POSTGRES_URL);
}

export function migrationDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.DATABASE_URL_DIRECT) return clean(env.DATABASE_URL_DIRECT);
  const app = appDatabaseUrl(env);
  const nonPooling = clean(env.POSTGRES_URL_NON_POOLING);
  // Supabase's direct host (db.<ref>.supabase.co) is IPv6-only on most plans and Vercel builds
  // have no IPv6, so prefer the session pooler derived from the app URL when we have one.
  if (nonPooling && !(isDirectSupabaseHost(nonPooling) && app && isPoolerHost(app))) return nonPooling;
  if (!app) return nonPooling;
  const u = new URL(app);
  if (isPoolerHost(app) && u.port === '6543') u.port = '5432'; // same pooler, session mode
  return u.toString();
}

const isPoolerHost = (url: string) => new URL(url).hostname.endsWith('pooler.supabase.com');
const isDirectSupabaseHost = (url: string) => /^db\.[a-z0-9]+\.supabase\.co$/.test(new URL(url).hostname);

/** postgres.js forwards unknown query params to the server as settings; drop the ones Supabase adds. */
function clean(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const u = new URL(url);
  for (const p of ['supa', 'pgbouncer', 'connection_limit', 'pool_timeout']) u.searchParams.delete(p);
  // Dashboard connection strings omit sslmode; always encrypt traffic to Supabase.
  if (/\.supabase\.(com|co)$/.test(u.hostname) && !u.searchParams.has('sslmode')) u.searchParams.set('sslmode', 'require');
  return u.toString();
}
