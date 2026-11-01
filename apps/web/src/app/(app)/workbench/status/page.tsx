import type { Metadata } from 'next';
import Link from 'next/link';
import { Activity } from 'lucide-react';
import { categoryStatusList, promoteDue, todayIn } from '@orbita/category-publishing';
import { getDb } from '@orbita/db';
import { Card, EmptyState, PageHeader } from '@orbita/ui';
import { StatusTable } from '@/components/review/status-table';
import { plain } from '@/lib/plain';
import { requirePermission } from '@/server/session';

export const metadata: Metadata = { title: 'Category status' };

export default async function CategoryStatusPage() {
  const session = await requirePermission('read', 'CategoryVersion');
  const db = getDb();
  await promoteDue(db);
  const rows = await categoryStatusList(db, session);
  const counts = {
    live: rows.filter((r) => r.status.key === 'live').length,
    sellers: rows.filter((r) => r.status.key === 'live_for_sellers').length,
    scheduled: rows.filter((r) => r.scheduled).length,
    down: rows.filter((r) => ['maintenance', 'down_for_buyers', 'down_for_sellers', 'deactivated'].includes(r.status.key)).length,
  };
  return (
    <>
      <PageHeader
        eyebrow="Category workbench"
        title="Category status"
        description="What sellers and buyers can use today, what goes live next, and any downtime. Start the next version of a live category here; the live one keeps serving until the new one is published."
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Live', counts.live],
          ['Live for sellers', counts.sellers],
          ['Scheduled', counts.scheduled],
          ['Down or deactivated', counts.down],
        ].map(([label, n]) => (
          <Card key={label} className="px-4 py-3">
            <div className="text-xs text-mute">{label}</div>
            <div className="text-2xl font-semibold tracking-tight">{n}</div>
          </Card>
        ))}
      </div>
      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Activity size={22} />}
            title="No listing categories yet"
            description="Listing categories appear here once they exist in the category tree."
            action={<Link href="/workbench/taxonomy" className="text-sm text-accent hover:underline">Open the category tree</Link>}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <StatusTable rows={plain(rows) as never} today={todayIn()} />
        </Card>
      )}
    </>
  );
}
