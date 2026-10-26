import { inviteUser, listUsers } from '@orbita/identity';
import { route } from '@/server/api/handler';
import { contracts } from '@/server/api/contracts';
import { identityDeps } from '@/server/deps';

export const GET = route(contracts.listUsers, async ({ session, meta, query }) => ({
  items: await listUsers(identityDeps(), { ...session, meta }, query),
}));

export const POST = route(contracts.inviteUser, async ({ session, meta, body }) =>
  inviteUser(identityDeps(), { ...session, meta }, body),
);
