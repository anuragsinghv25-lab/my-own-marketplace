import { latestContract } from '@orbita/category-config';
import { getDb } from '@orbita/db';
import { route } from '@/server/api/handler';
import { contracts } from '@/server/api/contracts';

export const GET = route(contracts.categoryContract, async ({ session, params }) => {
  const r = await latestContract(getDb(), session.ability, params.id);
  return { hash: r.hash, compiledAt: r.compiledAt.toISOString(), contract: r.contract as Record<string, unknown> };
});
