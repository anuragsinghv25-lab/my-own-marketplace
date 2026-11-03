import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus, Tags } from 'lucide-react';
import { orgApprovals, orgRequests, sentAuthorisations } from '@orbita/brands';
import { getDb } from '@orbita/db';
import { Badge, buttonClass, Card, EmptyState, PageHeader, Table, TBody, TD, TH, THead, TR } from '@orbita/ui';
import { TabLinks } from '@/components/common/tab-links';
import { CaseBadge } from '@/components/seller/case-status';
import { formatDateTime } from '@/lib/format';
import { requireSellerOrg } from '@/server/seller';

export const metadata: Metadata = { title: 'Brands' };

const RELATION: Record<string, string> = { owner: 'Owner', manufacturer_for_owner: 'Makes for owner', authorised_reseller: 'Authorised reseller', unbranded: 'Unbranded' };
const SOURCE: Record<string, string> = { review: 'Reviewed', auto: 'Automatic', owner_authorisation: 'By the owner' };

export default async function BrandsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { session, orgId } = await requireSellerOrg();
  const sp = await searchParams;
  const tab = sp.tab === 'requests' || sp.tab === 'authorisations' ? sp.tab : 'approved';
  const db = getDb();
  const [approvals, requests, auths] = await Promise.all([orgApprovals(db, session, orgId), orgRequests(db, session, orgId), sentAuthorisations(db, session, orgId)]);
  const canAdd = session.ability.can('create', 'BrandRequest');
  return (
    <>
      <PageHeader
        eyebrow="Seller app · Brand Center"
        title="Brands"
        description="Which brands you may sell, and where. Approved brand-category pairs decide what you can list from R5."
        actions={canAdd ? <Link href="/seller/brands/new" className={buttonClass('primary')}><Plus size={15} /> Add a brand</Link> : null}
      />
      <TabLinks
        base="/seller/brands"
        current={tab}
        tabs={[
          { key: 'approved', label: 'Approved', count: approvals.length },
          { key: 'requests', label: 'Requests', count: requests.filter((r) => !['approved', 'rejected', 'withdrawn'].includes(r.status)).length || undefined },
          { key: 'authorisations', label: 'Asked owners', count: auths.length || undefined },
        ]}
      />
      {tab === 'approved' ? (
        approvals.length ? (
          <Card className="overflow-hidden">
            <Table>
              <THead><TH>Brand</TH><TH>Category</TH><TH>As</TH><TH className="hidden md:table-cell">How</TH><TH className="hidden lg:table-cell">Limits</TH></THead>
              <TBody>
                {approvals.map((a) => (
                  <TR key={a.id}>
                    <TD className="font-medium">{a.brandName}</TD>
                    <TD>{a.categoryName}</TD>
                    <TD><Badge>{RELATION[a.relation]}</Badge></TD>
                    <TD className="hidden md:table-cell text-sm text-mute">{SOURCE[a.source]}</TD>
                    <TD className="hidden lg:table-cell text-sm text-mute">{[a.regions.length ? a.regions.join(', ') : null, a.validUntil ? `until ${a.validUntil}` : null].filter(Boolean).join(' · ') || '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        ) : (
          <Card><EmptyState icon={<Tags size={22} />} title="No brands yet" description="Add a brand you own, make or resell, and pick the categories you want to sell it in." action={canAdd ? <Link href="/seller/brands/new" className="text-sm text-accent hover:underline">Add a brand</Link> : undefined} /></Card>
        )
      ) : tab === 'requests' ? (
        <Card className="overflow-hidden">
          {requests.length ? (
            <Table>
              <THead><TH>Brand</TH><TH>As</TH><TH>Status</TH><TH className="hidden md:table-cell">Categories</TH><TH className="hidden lg:table-cell">Updated</TH></THead>
              <TBody>
                {requests.map((r) => (
                  <TR key={r.id}>
                    <TD><Link href={`/seller/brands/requests/${r.id}`} className="font-medium hover:underline">{r.brandName}</Link></TD>
                    <TD className="text-sm">{RELATION[r.relation]}</TD>
                    <TD><CaseBadge status={r.status} /></TD>
                    <TD className="hidden md:table-cell text-sm text-mute">{r.categories}</TD>
                    <TD className="hidden lg:table-cell text-sm text-mute">{formatDateTime(r.decidedAt ?? r.submittedAt ?? r.createdAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : <p className="px-5 py-6 text-sm text-mute">No requests yet.</p>}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {auths.length ? (
            <Table>
              <THead><TH>Brand</TH><TH>Owner</TH><TH>Status</TH><TH className="hidden md:table-cell">Granted</TH></THead>
              <TBody>
                {auths.map(({ a, brandName, ownerName }) => (
                  <TR key={a.id}>
                    <TD className="font-medium">{brandName}</TD>
                    <TD className="text-sm">{ownerName}</TD>
                    <TD><CaseBadge status={a.status} />{a.decisionNote ? <div className="text-xs text-mute mt-1">{a.decisionNote}</div> : null}</TD>
                    <TD className="hidden md:table-cell text-sm text-mute">{a.status === 'granted' ? `${a.grantedCategoryIds.length} categor${a.grantedCategoryIds.length === 1 ? 'y' : 'ies'}${a.regions.length ? ` · ${a.regions.join(', ')}` : ''}` : '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : <p className="px-5 py-6 text-sm text-mute">You have not asked a brand owner on Orbita yet.</p>}
        </Card>
      )}
    </>
  );
}
