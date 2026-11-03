import type { Metadata } from 'next';
import Link from 'next/link';
import { BadgeCheck, Building2, ChevronRight, Factory, FileBadge, Tags } from 'lucide-react';
import { oemDashboard, orgApprovals, orgAssessments, orgRequests } from '@orbita/brands';
import { getDb } from '@orbita/db';
import { caseTimeline, CASE_SPECS, listCertificates } from '@orbita/sellers';
import { Card, cn } from '@orbita/ui';
import { AreaHome } from '@/components/app/area-home';
import { CaseBadge } from '@/components/seller/case-status';
import { ReplyBox } from '@/components/seller/reply-box';
import { upcomingFor } from '@/lib/upcoming';
import { requireSellerOrg } from '@/server/seller';
import { roleLabels } from '@/server/session';
import { respondVerificationAction } from './actions';

export const metadata: Metadata = { title: 'Seller app' };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default async function SellerHome() {
  const { session, org, orgId } = await requireSellerOrg();
  const db = getDb();
  const [approvals, requests, vas, certs, verification, oem] = await Promise.all([
    orgApprovals(db, session, orgId),
    orgRequests(db, session, orgId),
    orgAssessments(db, session, orgId).catch(() => []),
    listCertificates(db, session, { orgId }),
    caseTimeline(db, CASE_SPECS.seller_org, orgId),
    oemDashboard(db, session, orgId),
  ]);
  const ask = verification?.request.awaitingReplySince ? verification.detail.decisions.filter((d) => d.decision === 'request_info').at(-1) : null;
  const va = vas[0];
  const steps = [
    { icon: Building2, title: 'Verify your business', href: '/seller/organisation', status: org.status, text: org.status === 'verified' ? `GSTIN ${org.gstin} verified.` : org.status === 'pending' ? 'Our team is checking your GSTIN and details.' : org.statusReason ?? 'Not verified.' },
    { icon: Factory, title: 'Vendor assessment (manufacturers)', href: '/seller/vendor-assessment', status: va?.status ?? null, text: va ? `${va.brandNames.join(', ') || 'No brands yet'}` : 'Only if you make products: it makes your brands yours and lets you authorise resellers.' },
    { icon: Tags, title: 'Brands you can sell', href: '/seller/brands', status: null, text: `${plural(new Set(approvals.map((a) => a.brandId)).size, 'brand')} in ${plural(approvals.length, 'category approval')} · ${plural(requests.filter((r) => ['submitted', 'info_requested', 'escalated'].includes(r.status)).length, 'request')} in review` },
    { icon: FileBadge, title: 'Certificates', href: '/seller/certificates', status: null, text: `${certs.filter((c) => c.c.status === 'verified').length} verified · ${certs.filter((c) => c.c.status === 'pending').length} waiting` },
    ...(oem.brands.length ? [{ icon: BadgeCheck, title: 'Your brands (OEM)', href: '/seller/oem', status: null, text: `${oem.brands.map((b) => b.name).join(', ')} · ${oem.pending.length} reseller requests waiting` }] : []),
  ];
  return (
    <AreaHome
      eyebrow="Seller app"
      title={org.tradeName || org.legalName}
      description="Get verified, prove which brands you may sell, and keep your certificates in one place. Catalogs and offers arrive with R5."
      name={session.actor.fullName || session.actor.email}
      roles={roleLabels(session.roles)}
      upcoming={upcomingFor(session.ability, 'SellerApp')}
    >
      {ask ? (
        <div className="mb-4">
          <ReplyBox orgId={orgId} question={{ by: ask.byName, reason: ask.reasonLabel, note: ask.note }} send={respondVerificationAction.bind(null, orgId)} />
        </div>
      ) : null}
      <Card className="mb-4 overflow-hidden">
        <ul className="divide-y divide-line">
          {steps.map((s) => (
            <li key={s.title}>
              <Link href={s.href} className="flex items-center gap-4 px-5 py-4 hover:bg-soft/60">
                <span className={cn('h-10 w-10 shrink-0 rounded-xl grid place-items-center', s.status === 'verified' || s.status === 'approved' ? 'bg-ok/10 text-ok' : 'bg-accent/10 text-accent')}>
                  <s.icon size={19} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    {s.title} {s.status ? <CaseBadge status={s.status} /> : null}
                  </span>
                  <span className="block text-sm text-mute truncate">{s.text}</span>
                </span>
                <ChevronRight size={16} className="text-mute" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </AreaHome>
  );
}
