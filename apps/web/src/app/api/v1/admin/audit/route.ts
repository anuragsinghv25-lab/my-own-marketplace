import { listAuditEvents } from '@orbita/audit';
import { getDb } from '@orbita/db';
import { route } from '@/server/api/handler';
import { contracts } from '@/server/api/contracts';

export const GET = route(contracts.listAudit, async ({ session, query }) =>
  listAuditEvents(getDb(), session.ability, query),
);
