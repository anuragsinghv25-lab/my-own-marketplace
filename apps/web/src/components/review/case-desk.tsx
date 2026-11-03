import { Inbox } from 'lucide-react';
import { sellerQueue } from '@orbita/brands';
import { getDb } from '@orbita/db';
import type { CaseSubject, CaseView } from '@orbita/sellers';
import { Card, EmptyState, PageHeader } from '@orbita/ui';
import { TabLinks } from '@/components/common/tab-links';
import { plain } from '@/lib/plain';
import { requireSession } from '@/server/session';
import { requestMeta } from '@/server/request';
import { CaseTable } from './case-table';

const COPY: Record<CaseSubject, { title: string; description: string; base: string; subject: 'SellerOrg' | 'VendorAssessment' | 'BrandRequest' }> = {
  seller_org: { title: 'Seller verification', description: 'New sellers: check the GSTIN, legal name and contact details, then verify, ask for more, reject or escalate.', base: '/reviews/sellers', subject: 'SellerOrg' },
  vendor_assessment: { title: 'Vendor assessments', description: 'Manufacturers proving what they make and where. Approval makes the brands theirs.', base: '/reviews/vendors', subject: 'VendorAssessment' },
  brand_request: { title: 'Brand requests', description: 'Sellers asking to sell brands in categories. Same trademark and class approvals are automatic and do not reach you.', base: '/reviews/brands', subject: 'BrandRequest' },
};

/** The queue page shared by seller verification, vendor assessments and brand requests. */
export async function CaseDesk({ subjectType, view: raw }: { subjectType: CaseSubject; view?: string }) {
  const session = await requireSession();
  const c = COPY[subjectType];
  const ctx = { ...session, meta: await requestMeta() };
  const decides = session.ability.can('approve', c.subject);
  const view: CaseView = raw === 'all' || raw === 'mine' || raw === 'queue' ? raw : decides ? 'queue' : 'all';
  const db = getDb();
  const [rows, mine, queue] = await Promise.all([sellerQueue(db, ctx, subjectType, view), decides ? sellerQueue(db, ctx, subjectType, 'mine') : [], decides ? sellerQueue(db, ctx, subjectType, 'queue') : []]);
  return (
    <>
      <PageHeader eyebrow="Review desk" title={c.title} description={c.description} />
      <TabLinks base={c.base} param="view" current={view} tabs={[...(decides ? [{ key: 'queue', label: 'Queue', count: queue.length || undefined }, { key: 'mine', label: 'My worklist', count: mine.length || undefined }] : []), { key: 'all', label: 'All' }]} />
      {rows.length ? (
        <Card className="overflow-hidden"><CaseTable rows={plain(rows) as never} /></Card>
      ) : (
        <Card><EmptyState icon={<Inbox size={22} />} title={view === 'queue' ? 'The queue is empty' : view === 'mine' ? 'Nothing on your worklist' : 'Nothing here yet'} description="New requests appear here as sellers submit them." /></Card>
      )}
    </>
  );
}
