import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlarmClock, ChevronRight, ExternalLink } from 'lucide-react';
import { checkBrandName, listingCategories, loadRequest, loadVa, sellerCase } from '@orbita/brands';
import { getDb } from '@orbita/db';
import { isAppError } from '@orbita/domain';
import { filesById, GST_STATES, orgForCase, PAN_HOLDER, type CaseSubject } from '@orbita/sellers';
import { Badge, Card, CardHeader, cn } from '@orbita/ui';
import { CaseBadge } from '@/components/seller/case-status';
import { FileLinks } from '@/components/seller/file-picker';
import { formatDateTime, timeAgo } from '@/lib/format';
import { plain } from '@/lib/plain';
import { requestMeta } from '@/server/request';
import { requireSession } from '@/server/session';
import { CaseDecisionPanel } from './case-decision-panel';

const BACK: Record<CaseSubject, { href: string; label: string }> = {
  seller_org: { href: '/reviews/sellers', label: 'Seller verification' },
  vendor_assessment: { href: '/reviews/vendors', label: 'Vendor assessments' },
  brand_request: { href: '/reviews/brands', label: 'Brand requests' },
};
const WORDS: Record<string, string> = { approve: 'Approved', reject: 'Rejected', request_info: 'Asked the seller for more', respond: 'The seller replied', escalate: 'Escalated', withdraw: 'Withdrawn by the seller' };
const OEM = { oem: 'OEM', deemed_oem: 'Deemed OEM', oem_fabricator: 'OEM fabricator' } as const;
const RELATION: Record<string, string> = { owner: 'Owner', manufacturer_for_owner: 'Makes it for the owner', authorised_reseller: 'Authorised reseller', unbranded: 'Unbranded' };

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-mute">{k}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

/** One seller-side review: what was submitted on the left, decisions on the right. */
export async function CaseReview({ subjectType, requestId }: { subjectType: CaseSubject; requestId: string }) {
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) notFound();
  const session = await requireSession();
  const ctx = { ...session, meta: await requestMeta() };
  const db = getDb();
  let c: Awaited<ReturnType<typeof sellerCase>>;
  try {
    c = await sellerCase(db, ctx, subjectType, requestId);
  } catch (e) {
    if (isAppError(e) && (e.code === 'NOT_FOUND' || e.code === 'FORBIDDEN')) notFound();
    throw e;
  }
  const { org, addresses } = await orgForCase(db, c.orgId);
  const subjectId = c.request.subjectId;
  let summary: React.ReactNode = null;
  let categories: { id: string; name: string }[] | undefined;
  const decisionFiles = await filesById(db, c.decisions.flatMap((d) => d.fileIds ?? []));

  if (subjectType === 'seller_org') {
    const reg = addresses.find((a) => a.kind === 'registered');
    summary = (
      <Card>
        <CardHeader title="Business details" description="Check them against the GST portal before verifying." actions={<a href="https://services.gst.gov.in/services/searchtp" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">GST portal search <ExternalLink size={13} /></a>} />
        <dl className="border-t border-line px-5 py-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <Row k="Legal name">{org.legalName}</Row>
          <Row k="Trade name">{org.tradeName || '—'}</Row>
          <Row k="GSTIN"><span className="font-mono">{org.gstin}</span> <Badge tone="ok">format and check digit valid</Badge></Row>
          <Row k="PAN"><span className="font-mono">{org.pan}</span> · {PAN_HOLDER[org.pan[3]!] ?? 'unknown holder type'}</Row>
          <Row k="State">{GST_STATES[org.stateCode]}</Row>
          <Row k="Business type">{org.businessType.replaceAll('_', ' ')}</Row>
          <Row k="Contact">{org.contactName} · {org.contactEmail} · {org.contactPhone}</Row>
          <Row k="Registered office">{reg ? [reg.line1, reg.line2, reg.city, GST_STATES[reg.stateCode], reg.pincode].filter(Boolean).join(', ') : '—'}</Row>
          <Row k="Registered">{formatDateTime(org.createdAt)}</Row>
        </dl>
      </Card>
    );
  } else if (subjectType === 'vendor_assessment') {
    const va = await loadVa(db, subjectId);
    const files = await filesById(db, va.fileIds);
    const checks = await Promise.all(va.brandNames.map(async (n) => ({ n, c: await checkBrandName(db, n) })));
    summary = (
      <Card>
        <CardHeader title={`${OEM[va.oemType]} for ${va.brandNames.join(', ')}`} description={`${org.legalName} · ${org.status === 'verified' ? 'verified seller' : 'seller not verified'}`} />
        <dl className="border-t border-line px-5 py-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <Row k="Brands">
            <ul className="space-y-1">
              {checks.map(({ n, c: ch }) => (
                <li key={n}>
                  <span className="font-medium">{n}</span>{' '}
                  {ch.problem ? <Badge tone="bad">{ch.problem}</Badge> : ch.existing?.ownerOrgId && ch.existing.ownerOrgId !== c.orgId ? <Badge tone="bad">already owned by {ch.existing.ownerName}</Badge> : ch.existing ? <Badge>on Orbita, no owner yet</Badge> : <Badge tone="ok">new brand</Badge>}
                </li>
              ))}
            </ul>
          </Row>
          <Row k="Manufacturing">
            <ul className="space-y-1">
              {addresses.filter((a) => va.addressIds.includes(a.id)).map((a) => <li key={a.id}>{a.label ? `${a.label}: ` : ''}{[a.line1, a.line2, a.city, GST_STATES[a.stateCode], a.pincode].filter(Boolean).join(', ')}</li>)}
            </ul>
          </Row>
          <Row k="Evidence"><FileLinks files={plain(files)} /></Row>
          <Row k="Description">{va.description || '—'}</Row>
        </dl>
      </Card>
    );
  } else {
    const r = await loadRequest(db, subjectId);
    const files = await filesById(db, [...r.fileIds, ...(r.trademark?.certificateFileId ? [r.trademark.certificateFileId] : [])]);
    const cats = await listingCategories(db);
    categories = r.categoryNodeIds.map((id) => ({ id, name: cats.find((x) => x.id === id)?.path ?? id }));
    const check = await checkBrandName(db, r.brandName);
    summary = (
      <Card>
        <CardHeader title={`${r.brandName}: ${RELATION[r.relation]}`} description={`${org.legalName} · ${r.brandKind} brand`} />
        <dl className="border-t border-line px-5 py-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <Row k="Brand">{check.existing?.ownerName ? `Owned by ${check.existing.ownerName}${check.existing.ownerOrgId === c.orgId ? ' (this seller)' : ''}` : 'No verified owner on Orbita'}</Row>
          {r.trademark ? (
            <>
              <Row k="Trademark">{r.trademark.applicationNumber} · class {r.trademark.niceClass} · {r.trademark.markType} mark{r.trademark.validUntil ? ` · valid until ${r.trademark.validUntil}` : ''}</Row>
              <Row k="Owner on certificate">{r.trademark.ownerName} {r.ownerNameMatches === false ? <Badge tone="warn">not the seller: proof attached</Badge> : <Badge tone="ok">the seller</Badge>}</Row>
            </>
          ) : null}
          {r.brandKind === 'unregistered' ? <Row k="Undertaking">{r.undertakingAccepted ? 'Accepted' : 'Not accepted'}</Row> : null}
          <Row k="Categories"><ul className="space-y-0.5">{categories.map((x) => <li key={x.id}>{x.name}</li>)}</ul></Row>
          <Row k="Documents"><FileLinks files={plain(files)} /></Row>
          <Row k="Note">{r.note || '—'}</Row>
        </dl>
      </Card>
    );
  }

  const due = c.openTask?.dueAt;
  return (
    <>
      <nav className="mb-2 flex items-center gap-1 text-xs text-mute"><Link href={BACK[subjectType].href} className="hover:underline">{BACK[subjectType].label}</Link><ChevronRight size={12} /></nav>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight">{c.request.title}</h1>
        <div className="flex flex-wrap gap-1.5">
          {c.request.state === 'open' ? (c.request.awaitingReplySince ? <Badge tone="warn">Waiting for the seller</Badge> : <Badge tone="accent">{c.stage?.label ?? 'Waiting'}</Badge>) : <CaseBadge status={c.request.state} />}
          {c.request.attempt > 1 ? <Badge>attempt {c.request.attempt}</Badge> : null}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
        <div className="min-w-0">{summary}</div>
        <aside className="space-y-4 lg:sticky lg:top-[76px]">
          <Card className="p-5 space-y-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-mute">Submitted</dt><dd>{c.submittedByName} · {timeAgo(c.request.submittedAt)}</dd>
              <dt className="text-mute">Handled by</dt><dd>{c.openTask?.assigneeId ? c.tasks.find((t) => t.id === c.openTask!.id)?.assigneeName : <span className="italic text-mute">{c.request.state === 'open' ? 'Not picked up' : '—'}</span>}</dd>
              {due && c.request.state === 'open' && !c.request.awaitingReplySince ? (
                <>
                  <dt className="text-mute">Due</dt>
                  <dd className={cn('inline-flex items-center gap-1', c.overdue && 'text-bad')}>{c.overdue ? <AlarmClock size={14} /> : null}{formatDateTime(due)}</dd>
                </>
              ) : null}
            </dl>
            {c.request.state === 'open' ? (
              <CaseDecisionPanel subjectType={subjectType} subjectId={subjectId} requestId={requestId} canDecide={c.canDecide} whyNot={c.request.awaitingReplySince ? 'Waiting for the seller to reply.' : c.whyNot} canClaim={c.canClaim} canEscalate={c.canEscalate} reasons={plain(c.reasons)} categories={categories} />
            ) : null}
          </Card>
          <Card className="p-5">
            <div className="font-medium mb-3">History</div>
            <ol className="space-y-3">
              <li className="text-sm"><span className="font-medium">Submitted</span> <span className="text-mute">by {c.submittedByName} · {formatDateTime(c.request.submittedAt)}</span></li>
              {c.decisions.map((d) => (
                <li key={d.id} className="text-sm">
                  <span className="font-medium">{WORDS[d.decision] ?? d.decision}</span> <span className="text-mute">{d.byName ? `by ${d.byName} ` : ''}· {formatDateTime(d.decidedAt)}</span>
                  {d.reasonLabel || d.note ? <p className="mt-0.5 whitespace-pre-wrap">{[d.reasonLabel, d.note].filter(Boolean).join(' · ')}</p> : null}
                  {d.fileIds?.length ? <div className="mt-1"><FileLinks files={plain(decisionFiles.filter((f) => d.fileIds.includes(f.id)))} /></div> : null}
                </li>
              ))}
            </ol>
          </Card>
        </aside>
      </div>
    </>
  );
}
