import 'server-only';
import { redirect } from 'next/navigation';
import { getDb } from '@orbita/db';
import { loadOrg, myOrgIds } from '@orbita/sellers';
import { requirePermission } from './session';

/** The seller app's session and the organisation it works for (sellers belong to one organisation). */
export async function requireSellerOrg() {
  const session = await requirePermission('access', 'SellerApp');
  const ids = await myOrgIds(getDb(), session.actor.id);
  if (!ids.length) redirect('/no-access');
  const org = await loadOrg(getDb(), ids[0]!);
  return { session, org, orgId: org.id };
}
