import type { Metadata } from 'next';
import Link from 'next/link';
import { Inbox } from 'lucide-react';
import { eligibleApprovers, promoteDue, reviewQueue, type DeskView } from '@orbita/category-publishing';
import { loadVersion } from '@orbita/category-config';
import { getDb } from '@orbita/db';
import { Card, EmptyState, PageHeader } from '@orbita/ui';
import { AreaHome } from '@/components/app/area-home';
import { TabLinks } from '@/components/common/tab-links';
import { DeskTable } from '@/components/review/desk-table';
import { plain } from '@/lib/plain';
import { upcomingFor } from '@/lib/upcoming';
import { requirePermission, roleLabels } from '@/server/session';

export const metadata: Metadata = { title: 'Review desk' };

const EMPTY: Record<DeskView, { title: string; description: string }> = {
  queue: { title: 'The queue is empty', description: 'Category versions you could approve appear here when a category team submits them.' },
  mine: { title: 'Nothing on your worklist', description: 'Pick something up from the queue, or wait for one to be assigned to you.' },
  all: { title: 'No category reviews yet', description: 'Every submitted category version, whatever its outcome, is listed here.' },
};

export default async function ReviewDeskPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requirePermission('access', 'ReviewDesk');
  if (!session.ability.can('read', 'ReviewRequest')) {
    return (
      <AreaHome
        eyebrow="Review desk"
        title={`Welcome, ${session.actor.fullName.split(' ')[0] || 'there'}`}
        description="Your queues of vendor assessments, brand requests, catalog reviews and escalations."
        name={session.actor.fullName || session.actor.email}
        roles={roleLabels(session.roles)}
        upcoming={upcomingFor(session.ability, 'ReviewDesk')}
      />
    );
  }
  const sp = await searchParams;
  const db = getDb();
  await promoteDue(db);
  const decides = session.ability.can('approve', 'CategoryVersion');
  const view: DeskView = sp.view === 'all' || sp.view === 'mine' || sp.view === 'queue' ? sp.view : decides ? 'mine' : 'all';
  const overdueOnly = sp.overdue === '1';
  const [rows, queue, mine] = await Promise.all([
    reviewQueue(db, session, view, { overdueOnly }),
    decides ? reviewQueue(db, session, 'queue') : Promise.resolve([]),
    decides ? reviewQueue(db, session, 'mine') : Promise.resolve([]),
  ]);
  const canAssign = session.ability.can('assign', 'ReviewRequest');
  let approvers: { id: string; name: string; email: string }[] = [];
  if (canAssign) {
    const seen = new Map<string, { id: string; name: string; email: string }>();
    for (const r of rows.filter((x) => x.state === 'open')) for (const a of await eligibleApprovers(db, await loadVersion(db, r.subjectId))) seen.set(a.id, a);
    approvers = [...seen.values()];
  }
  const tabs = [
    ...(decides ? [{ key: 'mine', label: 'My worklist', count: mine.length || undefined }, { key: 'queue', label: 'Queue', count: queue.length || undefined }] : []),
    { key: 'all', label: 'All requests' },
  ];
  return (
    <>
      <PageHeader
        eyebrow="Review desk"
        title="Category approvals"
        description="Category versions submitted for approval. Pick one up, comment on any specification, then approve and schedule it, or send it back."
        actions={
          <Link href={overdueOnly ? `/reviews?view=${view}` : `/reviews?view=${view}&overdue=1`} className="text-sm text-accent hover:underline">
            {overdueOnly ? 'Show everything' : 'Only overdue'}
          </Link>
        }
      />
      <TabLinks base="/reviews" param="view" current={view} tabs={tabs} />
      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={<Inbox size={22} />} title={overdueOnly ? 'Nothing overdue' : EMPTY[view].title} description={EMPTY[view].description} />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <DeskTable rows={plain(rows) as never} canAssign={canAssign} approvers={approvers} />
        </Card>
      )}
    </>
  );
}
