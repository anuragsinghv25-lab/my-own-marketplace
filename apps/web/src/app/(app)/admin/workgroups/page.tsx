import type { Metadata } from 'next';
import { getDb } from '@orbita/db';
import { listUsers } from '@orbita/identity';
import { listWorkgroups } from '@orbita/taxonomy';
import { PageHeader } from '@orbita/ui';
import { WorkgroupsView, type WorkgroupRow } from '@/components/taxonomy/workgroups-view';
import { requestMeta } from '@/server/request';
import { requirePermission } from '@/server/session';

export const metadata: Metadata = { title: 'Workgroups' };

export default async function WorkgroupsPage() {
  const session = await requirePermission('read', 'Workgroup');
  const db = getDb();
  const rows = await listWorkgroups(db, session.ability);
  const canEdit = session.ability.can('update', 'Workgroup') && session.ability.can('grant', 'RoleGrant');
  const staff = canEdit
    ? (await listUsers({ db }, { ...session, meta: await requestMeta() }, { status: 'active' }))
        .filter((u) => u.kind === 'staff')
        .map((u) => ({ id: u.id, fullName: u.fullName, email: u.email }))
    : [];
  return (
    <>
      <PageHeader
        eyebrow="Admin console"
        title="Workgroups"
        description="Teams that own parts of the category tree. Members' category roles apply only inside their workgroup's categories."
      />
      <WorkgroupsView rows={JSON.parse(JSON.stringify(rows)) as WorkgroupRow[]} staff={staff} canEdit={canEdit} />
    </>
  );
}
