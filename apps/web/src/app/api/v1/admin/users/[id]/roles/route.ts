import { getUser, grantRole } from '@orbita/identity';
import { route } from '@/server/api/handler';
import { contracts } from '@/server/api/contracts';
import { identityDeps } from '@/server/deps';

export const POST = route(contracts.grantRole, async ({ session, meta, params, body }) => {
  const ctx = { ...session, meta };
  await grantRole(identityDeps(), ctx, params.id, body);
  return getUser(identityDeps(), ctx, params.id);
});
