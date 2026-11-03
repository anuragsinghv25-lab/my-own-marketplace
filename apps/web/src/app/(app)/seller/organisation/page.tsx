import type { Metadata } from 'next';
import { MapPin } from 'lucide-react';
import { listingCategories } from '@orbita/brands';
import { getDb } from '@orbita/db';
import { caseTimeline, CASE_SPECS, getOrg, GST_STATES, listMembers } from '@orbita/sellers';
import { Badge, Card, CardHeader, PageHeader } from '@orbita/ui';
import { TabLinks } from '@/components/common/tab-links';
import { CaseBadge, CaseHistory } from '@/components/seller/case-status';
import { AddAddressButton, ProfileForm, RemoveAddressButton, UsersPanel } from '@/components/seller/org-forms';
import { ReplyBox } from '@/components/seller/reply-box';
import { plain } from '@/lib/plain';
import { requireSellerOrg } from '@/server/seller';
import { respondVerificationAction } from '../actions';

export const metadata: Metadata = { title: 'Organisation' };

const TYPE: Record<string, string> = { proprietorship: 'Proprietorship', partnership: 'Partnership firm', llp: 'LLP', private_limited: 'Private limited company', public_limited: 'Public limited company', other: 'Other' };

export default async function OrganisationPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { session, orgId } = await requireSellerOrg();
  const sp = await searchParams;
  const tab = sp.tab === 'addresses' || sp.tab === 'users' ? sp.tab : 'profile';
  const db = getDb();
  const { org, addresses, stateName, canEdit, canManageUsers } = await getOrg(db, session, orgId);
  const verification = await caseTimeline(db, CASE_SPECS.seller_org, orgId);
  const ask = verification?.request.awaitingReplySince ? verification.detail.decisions.filter((d) => d.decision === 'request_info').at(-1) : null;
  const states = Object.entries(GST_STATES).map(([code, name]) => ({ code, name }));
  return (
    <>
      <PageHeader eyebrow="Seller app" title={org.legalName} description={`${TYPE[org.businessType]} · GSTIN ${org.gstin} · ${stateName}`} actions={<CaseBadge status={org.status} />} />
      {ask ? <div className="mb-4"><ReplyBox orgId={orgId} question={{ by: ask.byName, reason: ask.reasonLabel, note: ask.note }} send={respondVerificationAction.bind(null, orgId)} /></div> : null}
      <TabLinks base="/seller/organisation" current={tab} tabs={[{ key: 'profile', label: 'Profile' }, { key: 'addresses', label: 'Addresses', count: addresses.length }, { key: 'users', label: 'Users and divisions' }]} />
      {tab === 'profile' ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
          <Card>
            <CardHeader title="Profile" description="Legal name and GSTIN come from your registration; ask support to change them." />
            <div className="border-t border-line p-5">
              <ProfileForm orgId={orgId} initial={{ tradeName: org.tradeName, contactName: org.contactName, contactPhone: org.contactPhone, website: org.website }} editable={canEdit} />
            </div>
          </Card>
          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between"><span className="font-medium">Verification</span><CaseBadge status={org.status} /></div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-mute">GSTIN</dt><dd className="font-mono">{org.gstin}</dd>
              <dt className="text-mute">PAN</dt><dd className="font-mono">{org.pan}</dd>
              <dt className="text-mute">State</dt><dd>{stateName}</dd>
            </dl>
            {org.statusReason ? <p className="text-sm text-bad">{org.statusReason}</p> : null}
            {verification ? <CaseHistory submittedAt={plain(verification.request.submittedAt)} decisions={plain(verification.detail.decisions)} /> : <p className="text-sm text-mute">Verification starts once your email is confirmed.</p>}
          </Card>
        </div>
      ) : tab === 'addresses' ? (
        <Card>
          <CardHeader title="Addresses" description="Your registered office, factories and warehouses." actions={canEdit ? <AddAddressButton orgId={orgId} states={states} /> : null} />
          <ul className="divide-y divide-line border-t border-line">
            {addresses.map((a) => (
              <li key={a.id} className="flex items-start gap-3 px-5 py-3">
                <MapPin size={16} className="text-mute mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{a.label || a.kind}</span>
                    <Badge>{a.kind}</Badge>
                    {a.kind === 'manufacturing' ? <Badge tone={a.approved ? 'ok' : 'neutral'}>{a.approved ? 'Approved' : 'Not assessed'}</Badge> : null}
                  </div>
                  <div className="text-sm text-mute">{[a.line1, a.line2, a.city, GST_STATES[a.stateCode], a.pincode].filter(Boolean).join(', ')}</div>
                </div>
                {canEdit && a.kind !== 'registered' && !a.approved ? <RemoveAddressButton orgId={orgId} id={a.id} /> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <UsersPanel orgId={orgId} me={session.actor.id} {...plain(await listMembers(db, session, orgId))} categories={(await listingCategories(db)).map((c) => ({ id: c.id, path: c.path }))} canManage={canManageUsers} />
      )}
    </>
  );
}
