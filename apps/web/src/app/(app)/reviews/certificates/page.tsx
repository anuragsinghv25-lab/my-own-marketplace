import type { Metadata } from 'next';
import { FileBadge } from 'lucide-react';
import { getDb } from '@orbita/db';
import { listCertificates } from '@orbita/sellers';
import { Card, EmptyState, PageHeader, Table, TBody, TD, TH, THead, TR } from '@orbita/ui';
import { TabLinks } from '@/components/common/tab-links';
import { CertificateVerdict } from '@/components/review/small-actions';
import { CaseBadge } from '@/components/seller/case-status';
import { formatDateTime } from '@/lib/format';
import { requirePermission } from '@/server/session';

export const metadata: Metadata = { title: 'Certificates' };

export default async function CertificateDesk({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requirePermission('read', 'Certificate');
  const view = (await searchParams).view === 'all' ? 'all' : 'pending';
  const rows = await listCertificates(getDb(), session, view === 'pending' ? { status: 'pending' } : {});
  const canVerify = session.ability.can('approve', 'Certificate');
  return (
    <>
      <PageHeader eyebrow="Review desk" title="Certificates" description="Check each document against the issuer’s records (number, holder, validity), then verify or reject it." />
      <TabLinks base="/reviews/certificates" param="view" current={view} tabs={[{ key: 'pending', label: 'To check', count: view === 'pending' ? rows.length : undefined }, { key: 'all', label: 'All' }]} />
      {rows.length ? (
        <Card className="overflow-hidden">
          <Table>
            <THead><TH>Certificate</TH><TH>Seller</TH><TH className="hidden md:table-cell">Number · issuer</TH><TH className="hidden lg:table-cell">Valid</TH><TH>{view === 'pending' ? 'Decision' : 'Status'}</TH></THead>
            <TBody>
              {rows.map(({ c, typeName, orgName, filename }) => (
                <TR key={c.id}>
                  <TD><div className="font-medium">{typeName}</div><a href={`/api/files/${c.fileId}`} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">{filename}</a></TD>
                  <TD className="text-sm">{orgName}</TD>
                  <TD className="hidden md:table-cell text-sm"><span className="font-mono">{c.number}</span><div className="text-xs text-mute">{c.issuer}</div></TD>
                  <TD className="hidden lg:table-cell text-sm text-mute">{c.validFrom ?? '—'} to {c.validUntil ?? 'no expiry'}<div className="text-xs">added {formatDateTime(c.createdAt)}</div></TD>
                  <TD>{c.status === 'pending' && canVerify ? <CertificateVerdict id={c.id} /> : <CaseBadge status={c.status === 'pending' ? 'submitted' : c.status} />}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : <Card><EmptyState icon={<FileBadge size={22} />} title="Nothing to check" /></Card>}
    </>
  );
}
