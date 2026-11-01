import { liveCategory, promoteDue } from '@orbita/category-publishing';
import { getDb } from '@orbita/db';
import { route } from '@/server/api/handler';
import { contracts } from '@/server/api/contracts';

export const GET = route(contracts.liveCategory, async ({ session, params }) => {
  const db = getDb();
  await promoteDue(db);
  const r = await liveCategory(db, session, params.id);
  return {
    status: r.status,
    version: r.version,
    schedule: r.schedule ? { sellerGoLive: r.schedule.sellerGoLive, buyerGoLive: r.schedule.buyerGoLive, minCatalogs: r.schedule.minCatalogs, testMode: r.schedule.testMode } : null,
    hash: r.hash,
    contract: r.contract as Record<string, unknown> | null,
  };
});
