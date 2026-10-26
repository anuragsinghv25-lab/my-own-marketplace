import { setUserActive } from '@orbita/identity';
import { route } from '@/server/api/handler';
import { contracts } from '@/server/api/contracts';
import { identityDeps } from '@/server/deps';

export const POST = route(contracts.setUserStatus, async ({ session, meta, params, body }) =>
  setUserActive(identityDeps(), { ...session, meta }, params.id, body.active),
);
