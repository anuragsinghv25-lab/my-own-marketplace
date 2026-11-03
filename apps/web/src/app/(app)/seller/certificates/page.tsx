import type { Metadata } from 'next';
import { FileBadge } from 'lucide-react';
import { getDb } from '@orbita/db';
import { certificateTypeList, listCertificates } from '@orbita/sellers';
import { Card, EmptyState, PageHeader, Table, TBody, TD, TH, THead, TR } from '@orbita/ui';
import { CaseBadge } from '@/components/seller/case-status';
import { AddCertificateButton } from '@/components/seller/certificate-form';
import { requireSellerOrg } from '@/server/seller';

export const metadata: Metadata = { title: 'Certificates' };

export default async function CertificatesPage() {
  const { session, orgId } = await requireSellerOrg();
  const db = getDb();
  const [rows, types] = await Promise.all([listCertificates(db, session, { orgId }), certificateTypeList(db)]);
  const canAdd = session.ability.can('create', 'Certificate');
  return (
    <>
      <PageHeader eyebrow="Seller app" title="Certificates" description="Upload once, verified once, reused for every product that needs it." actions={canAdd ? <AddCertificateButton orgId={orgId} types={types} /> : null} />
      {rows.length ? (
        <Card className="overflow-hidden">
          <Table>
            <THead><TH>Certificate</TH><TH>Number</TH><TH className="hidden md:table-cell">Valid until</TH><TH>Status</TH></THead>
            <TBody>
              {rows.map(({ c, typeName, filename }) => (
                <TR key={c.id}>
                  <TD><div className="font-medium">{typeName}</div><a href={`/api/files/${c.fileId}`} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">{filename}</a></TD>
                  <TD className="font-mono text-sm">{c.number}</TD>
                  <TD className="hidden md:table-cell text-sm text-mute">{c.validUntil ?? '—'}</TD>
                  <TD><CaseBadge status={c.status === 'pending' ? 'submitted' : c.status === 'verified' ? 'verified' : c.status} />{c.statusNote ? <div className="text-xs text-mute mt-1">{c.statusNote}</div> : null}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : (
        <Card><EmptyState icon={<FileBadge size={22} />} title="No certificates yet" description="Add BIS, ISI, ISO or other certificates your products need." /></Card>
      )}
    </>
  );
}
