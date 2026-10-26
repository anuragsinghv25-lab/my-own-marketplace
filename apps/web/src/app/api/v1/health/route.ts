import { sql } from 'drizzle-orm';
import { getDb } from '@orbita/db';
import { env } from '@/server/env';
import { route } from '@/server/api/handler';
import { contracts } from '@/server/api/contracts';

export const dynamic = 'force-dynamic';

export const GET = route(contracts.health, async () => {
  let database: 'ok' | 'error' | 'not_configured' = 'not_configured';
  if (env.databaseUrl()) {
    try {
      await getDb().execute(sql`select 1`);
      database = 'ok';
    } catch {
      database = 'error';
    }
  }
  return {
    status: database === 'ok' ? 'ok' : 'degraded',
    database,
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
    time: new Date().toISOString(),
  };
});
