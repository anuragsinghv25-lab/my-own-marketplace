import type { Metadata } from 'next';
import Link from 'next/link';
import { BadgeCheck, Inbox } from 'lucide-react';
import { oemDashboard } from '@orbita/brands';
import { getDb } from '@orbita/db';
import { Badge, Card, CardHeader, EmptyState, PageHeader } from '@orbita/ui';
import { GrantButtons, RevokeButton } from '@/components/seller/oem-actions';
import { CaseBadge } from '@/components/seller/case-status';
import { formatDateTime } from '@/lib/format';
import { requireSellerOrg } from '@/server/seller';

export const metadata: Metadata = { title: 'Your brands' };

export default async function OemPage() {
  const { session, orgId } = await requireSellerOrg();
  const d = await oemDashboard(getDb(), session, orgId);
  if (!d.brands.length)
    return (
      <>
        <PageHeader eyebrow="Seller app" title="Your brands" />
        <Card><EmptyState icon={<BadgeCheck size={22} />} title="You do not own a brand on Orbita yet" description="Brands become yours through the vendor assessment." action={<Link href="/seller/vendor-assessment" className="text-sm text-accent hover:underline">Start the vendor assessment</Link>} /></Card>
      </>
    );
  return (
    <>
      <PageHeader eyebrow="Seller app · OEM dashboard" title="Your brands" description="You decide who resells your brands, in which categories and zones, and until when." />
      <div className="mb-4 flex flex-wrap gap-2">
        {d.brands.map((b) => (
          <Card key={b.id} className="px-4 py-3">
            <div className="font-semibold">{b.name}</div>
            <div className="text-xs text-mute">{b.resellers} authorised reseller{b.resellers === 1 ? '' : 's'}</div>
          </Card>
        ))}
      </div>
      <div className="space-y-4">
        <Card>
          <CardHeader title="Waiting for you" description="Resellers asking to sell your brands." />
          {d.pending.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {d.pending.map((p) => (
                <li key={p.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{p.resellerName} <span className="text-mute font-normal">wants to sell</span> {p.brandName}</div>
                    <div className="text-sm text-mute">{p.categories.map((c) => c.name).join(', ')} · {formatDateTime(p.createdAt)}</div>
                    {p.message ? <p className="text-sm mt-1">“{p.message}”</p> : null}
                  </div>
                  {p.canDecide ? <GrantButtons id={p.id} resellerName={p.resellerName} brandName={p.brandName} categories={p.categories} /> : <Badge>A seller admin decides</Badge>}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<Inbox size={20} />} title="Nothing waiting" className="py-8" />
          )}
        </Card>
        <Card>
          <CardHeader title="Authorised resellers" />
          {d.resellers.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {d.resellers.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{r.resellerName} · {r.brandName}</div>
                    <div className="text-sm text-mute">{r.categories.map((c) => c.name).join(', ')}{r.regions.length ? ` · ${r.regions.join(', ')}` : ' · everywhere'}{r.validUntil ? ` · until ${r.validUntil}` : ''}</div>
                  </div>
                  {r.canDecide ? <RevokeButton id={r.id} resellerName={r.resellerName} /> : null}
                </li>
              ))}
            </ul>
          ) : <p className="border-t border-line px-5 py-4 text-sm text-mute">No authorised resellers yet.</p>}
        </Card>
        {d.history.length ? (
          <Card>
            <CardHeader title="Declined and revoked" />
            <ul className="divide-y divide-line border-t border-line">
              {d.history.map((h) => <li key={h.id} className="flex items-center gap-3 px-5 py-2.5 text-sm"><span className="flex-1">{h.resellerName} · {h.brandName}{h.decisionNote ? ` · ${h.decisionNote}` : ''}</span><CaseBadge status={h.status} /></li>)}
            </ul>
          </Card>
        ) : null}
      </div>
    </>
  );
}
