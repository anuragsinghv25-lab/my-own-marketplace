import { getUser, revokeRole } from '@orbita/identity';
import { route } from '@/server/api/handler';
import { contracts } from '@/server/api/contracts';
import { identityDeps } from '@/server/deps';

export const DELETE = route(contracts.revokeRole, async ({ session, meta, params }) => {
  const ctx = { ...session, meta };
  await revokeRole(identityDeps(), ctx, params.id, params.grantId);
  return getUser(identityDeps(), ctx, params.id);
});
