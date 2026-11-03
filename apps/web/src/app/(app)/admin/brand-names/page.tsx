import type { Metadata } from 'next';
import { listProhibited } from '@orbita/brands';
import { getDb } from '@orbita/db';
import { Badge, Card, CardHeader, PageHeader, Table, TBody, TD, TH, THead, TR } from '@orbita/ui';
import { AddProhibited, RemoveProhibited } from '@/components/review/small-actions';
import { requirePermission } from '@/server/session';

export const metadata: Metadata = { title: 'Brand names' };

const LIST: Record<string, { label: string; tone: 'bad' | 'warn' | 'neutral' }> = { prohibited: { label: 'Prohibited', tone: 'bad' }, negative: { label: 'Not a brand', tone: 'neutral' }, legally_rejected: { label: 'Legally rejected', tone: 'warn' } };

export default async function BrandNamesPage() {
  const session = await requirePermission('read', 'ProhibitedName');
  const rows = await listProhibited(getDb(), session);
  const canEdit = session.ability.can('create', 'ProhibitedName');
  return (
    <>
      <PageHeader eyebrow="Admin console" title="Brand names" description="Names sellers can never register as a brand. The Brand Center checks them live as sellers type (ignoring case, spaces and punctuation)." />
      {canEdit ? <Card className="mb-4"><CardHeader title="Add a name" /><div className="border-t border-line p-5"><AddProhibited /></div></Card> : null}
      <Card className="overflow-hidden">
        <Table>
          <THead><TH>Name</TH><TH>List</TH><TH className="hidden md:table-cell">Reason</TH><TH className="w-12"><span className="sr-only">Actions</span></TH></THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="font-medium">{r.name}</TD>
                <TD><Badge tone={LIST[r.list]!.tone}>{LIST[r.list]!.label}</Badge></TD>
                <TD className="hidden md:table-cell text-sm text-mute">{r.reason || '—'}</TD>
                <TD>{canEdit ? <RemoveProhibited id={r.id} name={r.name} /> : null}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
