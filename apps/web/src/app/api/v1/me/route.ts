import { ROLES } from '@orbita/authz';
import { route } from '@/server/api/handler';
import { contracts } from '@/server/api/contracts';

export const GET = route(contracts.me, async ({ session }) => ({
  id: session.actor.id,
  email: session.actor.email,
  fullName: session.actor.fullName,
  status: session.profile.status,
  roles: session.grants.map((g) => ({ role: g.role, label: ROLES[g.role].label, scopeType: g.scopeType, scopeId: g.scopeId })),
  areas: session.areas,
  homePath: session.homePath,
}));
