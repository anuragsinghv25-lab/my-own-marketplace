import { getUser } from '@orbita/identity';
import { route } from '@/server/api/handler';
import { contracts } from '@/server/api/contracts';
import { identityDeps } from '@/server/deps';

export const GET = route(contracts.getUser, async ({ session, meta, params }) =>
  getUser(identityDeps(), { ...session, meta }, params.id),
);
