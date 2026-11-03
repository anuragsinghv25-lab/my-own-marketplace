import type { Metadata } from 'next';
import { ArrowUpRight, Ban } from 'lucide-react';
import { escalations, listBlocks } from '@orbita/brands';
import { getDb } from '@orbita/db';
import { Card, CardHeader, EmptyState, PageHeader } from '@orbita/ui';
import { CaseTable } from '@/components/review/case-table';
import { ReviveButton } from '@/components/review/small-actions';
import { formatDateTime } from '@/lib/format';
import { plain } from '@/lib/plain';
import { requestMeta } from '@/server/request';
import { requirePermission } from '@/server/session';

export const metadata: Metadata = { title: 'Escalations' };

export default async function EscalationsPage() {
  const session = await requirePermission('read', 'Escalation');
  const ctx = { ...session, meta: await requestMeta() };
  const db = getDb();
  const [rows, blocks] = await Promise.all([escalations(db, ctx), session.ability.can('read', 'BrandBlock') ? listBlocks(db, session) : []]);
  const canRevive = session.ability.can('approve', 'BrandBlock');
  return (
    <>
      <PageHeader eyebrow="Review desk" title="Escalations" description="Cases reviewers sent up: seller verification, vendor assessments and brand requests. Approvers decide them, and revive brands blocked in a category." />
      <div className="space-y-4">
        <Card className="overflow-hidden">
          <CardHeader title="Escalated cases" />
          {rows.length ? <CaseTable rows={plain(rows) as never} showKind /> : <EmptyState icon={<ArrowUpRight size={20} />} title="Nothing escalated" className="py-8" />}
        </Card>
        <Card>
          <CardHeader title="Blocked brands" description="Rejected for every seller in these categories." />
          {blocks.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {blocks.map((b) => (
                <li key={b.b.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <Ban size={16} className="text-bad" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{b.brandName} in {b.categoryName}</div>
                    <div className="text-sm text-mute">{b.b.reason} · {formatDateTime(b.b.blockedAt)}</div>
                  </div>
                  {canRevive ? <ReviveButton id={b.b.id} label={`${b.brandName} in ${b.categoryName}`} /> : null}
                </li>
              ))}
            </ul>
          ) : <p className="border-t border-line px-5 py-4 text-sm text-mute">No blocked brands.</p>}
        </Card>
      </div>
    </>
  );
}
