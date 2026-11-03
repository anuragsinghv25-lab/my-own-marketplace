import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { hasApprovedVa, listingCategories, loadRequest, orgApprovals, requestReadiness } from '@orbita/brands';
import { getDb } from '@orbita/db';
import { isAppError } from '@orbita/domain';
import { caseTimeline, CASE_SPECS, filesById } from '@orbita/sellers';
import { Badge, Card, CardHeader, PageHeader } from '@orbita/ui';
import { BrandJourney } from '@/components/seller/brand-journey';
import { CaseBadge, CaseHistory } from '@/components/seller/case-status';
import { FileLinks } from '@/components/seller/file-picker';
import { ReplyBox } from '@/components/seller/reply-box';
import { WithdrawButton } from '@/components/seller/withdraw-button';
import { plain } from '@/lib/plain';
import { requireSellerOrg } from '@/server/seller';
import { respondRequestAction, withdrawRequestAction } from '../../../actions';

export const metadata: Metadata = { title: 'Brand request' };

const RELATION: Record<string, string> = { owner: 'Owner', manufacturer_for_owner: 'Makes it for the owner', authorised_reseller: 'Authorised reseller', unbranded: 'Unbranded' };

export default async function BrandRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { session, org, orgId } = await requireSellerOrg();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = getDb();
  let r: Awaited<ReturnType<typeof loadRequest>>;
  try {
    r = await loadRequest(db, id);
  } catch (e) {
    if (isAppError(e)) notFound();
    throw e;
  }
  if (r.orgId !== orgId) notFound();
  const cats = await listingCategories(db);
  const nameOf = (c: string) => cats.find((x) => x.id === c)?.path ?? c;

  if (r.status === 'draft') {
    const files = await filesById(db, [...r.fileIds, ...(r.trademark?.certificateFileId ? [r.trademark.certificateFileId] : [])]);
    const pick = (ids: string[]) => files.filter((f) => ids.includes(f.id)).map((f) => ({ id: f.id, filename: f.filename }));
    return (
      <>
        <PageHeader eyebrow="Seller app · Brand Center" title={`${r.brandName}: draft`} description="Finish the request and submit it." />
        <BrandJourney
          orgId={orgId}
          categories={cats.map((c) => ({ id: c.id, path: c.path }))}
          verified={org.status === 'verified'}
          hasApprovedVa={await hasApprovedVa(db, orgId)}
          initial={{
            id: r.id,
            brandName: r.brandName,
            relation: r.relation,
            brandKind: r.brandKind,
            trademark: r.trademark ? { markType: r.trademark.markType, applicationNumber: r.trademark.applicationNumber, niceClass: r.trademark.niceClass, ownerName: r.trademark.ownerName, validUntil: r.trademark.validUntil ?? '', certificate: pick(r.trademark.certificateFileId ? [r.trademark.certificateFileId] : []) } : null,
            categoryNodeIds: r.categoryNodeIds,
            ownerNameMatches: r.ownerNameMatches,
            undertakingAccepted: r.undertakingAccepted,
            files: pick(r.fileIds),
            note: r.note,
          }}
        />
      </>
    );
  }

  const [t, files, approvals, ready] = await Promise.all([
    caseTimeline(db, CASE_SPECS.brand_request, id),
    filesById(db, [...r.fileIds, ...(r.trademark?.certificateFileId ? [r.trademark.certificateFileId] : [])]),
    orgApprovals(db, session, orgId),
    requestReadiness(db, r),
  ]);
  const approvedHere = new Set(approvals.filter((a) => a.brandId === r.brandId).map((a) => a.categoryId));
  const ask = t?.request.awaitingReplySince ? t.detail.decisions.filter((d) => d.decision === 'request_info').at(-1) : null;
  return (
    <>
      <nav className="mb-2 flex items-center gap-1 text-xs text-mute"><Link href="/seller/brands?tab=requests" className="hover:underline">Brand requests</Link><ChevronRight size={12} />{r.brandName}</nav>
      <PageHeader title={r.brandName} description={`${RELATION[r.relation]} · ${r.brandKind}`} actions={<><CaseBadge status={r.status} />{['submitted', 'info_requested'].includes(r.status) ? <WithdrawButton action={withdrawRequestAction.bind(null, id)} /> : null}</>} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
        <div className="space-y-4 min-w-0">
          {ask ? <ReplyBox orgId={orgId} question={{ by: ask.byName, reason: ask.reasonLabel, note: ask.note }} send={respondRequestAction.bind(null, id)} /> : null}
          {r.decisionNote && ['rejected', 'approved', 'partially_approved'].includes(r.status) ? <Card className="p-5 text-sm"><span className="font-medium">Decision note: </span>{r.decisionNote}</Card> : null}
          <Card>
            <CardHeader title="Categories" />
            <ul className="divide-y divide-line border-t border-line">
              {r.categoryNodeIds.map((c) => (
                <li key={c} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <span>{nameOf(c)}</span>
                  {approvedHere.has(c) ? <Badge tone="ok">Approved</Badge> : r.status === 'rejected' || r.status === 'partially_approved' ? <Badge tone="bad">Not approved</Badge> : <Badge>In review</Badge>}
                </li>
              ))}
            </ul>
          </Card>
          {r.trademark ? (
            <Card className="p-5">
              <div className="font-medium mb-2">Trademark</div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-mute">Application</dt><dd>{r.trademark.applicationNumber} ({r.trademark.markType} mark)</dd>
                <dt className="text-mute">Class</dt><dd>{r.trademark.niceClass}</dd>
                <dt className="text-mute">Owner on certificate</dt><dd>{r.trademark.ownerName}{r.ownerNameMatches === false ? ' (not us: proof attached)' : ''}</dd>
                <dt className="text-mute">Valid until</dt><dd>{r.trademark.validUntil ?? '—'}</dd>
              </dl>
            </Card>
          ) : null}
          <Card className="p-5"><div className="font-medium mb-2">Documents</div><FileLinks files={plain(files)} /></Card>
        </div>
        <Card className="p-5 space-y-4">
          <div className="text-sm"><span className="text-mute">Readiness at submission: </span>{ready.score}%</div>
          {t ? <CaseHistory submittedAt={plain(r.submittedAt)} decisions={plain(t.detail.decisions)} /> : <p className="text-sm text-mute">{r.status === 'approved' ? 'Approved automatically: the same trademark was already approved for you.' : 'No review yet.'}</p>}
        </Card>
      </div>
    </>
  );
}
