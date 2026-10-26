import type { Metadata } from 'next';
import Link from 'next/link';
import { ScrollText } from 'lucide-react';
import { listAuditEvents } from '@orbita/audit';
import { getDb } from '@orbita/db';
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, Table, TBody, TD, TH, THead, TR, buttonClass } from '@orbita/ui';
import { actionTone } from '@/components/app/audit-list';
import { formatDateTime } from '@/lib/format';
import { requirePermission } from '@/server/session';

export const metadata: Metadata = { title: 'Audit log' };

const ACTIONS = [
  ['', 'All actions'],
  ['user.', 'User changes'],
  ['role.', 'Role changes'],
  ['auth.', 'Sign-ins and passwords'],
  ['user.invited', 'Invites'],
  ['role.granted', 'Roles granted'],
  ['role.revoked', 'Roles revoked'],
  ['user.deactivated', 'Deactivations'],
] as const;

const date = (v?: string) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v) : undefined);

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requirePermission('read', 'AuditEvent');
  const sp = await searchParams;
  const to = date(sp.to);
  if (to) to.setHours(23, 59, 59, 999);
  const page = await listAuditEvents(getDb(), session.ability, {
    actor: sp.actor || undefined,
    action: sp.action || undefined,
    q: sp.q || undefined,
    from: date(sp.from),
    to,
    before: sp.before ? Number(sp.before) || undefined : undefined,
    limit: 50,
  });
  const keep = new URLSearchParams(Object.entries(sp).filter(([k, v]) => k !== 'before' && v) as [string, string][]);

  return (
    <>
      <PageHeader
        eyebrow="Admin console"
        title="Audit log"
        description="Append-only record of every change: who did what, when, and the before/after values. Entries cannot be edited or deleted."
      />
      <Card>
        <form className="grid gap-2 px-4 py-3 border-b border-line sm:grid-cols-2 lg:grid-cols-[1fr_1fr_200px_150px_150px_auto]">
          <Input name="q" defaultValue={sp.q} placeholder="Search summary" className="h-10" aria-label="Search" />
          <Input name="actor" defaultValue={sp.actor} placeholder="Who (email or id)" className="h-10" aria-label="Actor" />
          <Select name="action" defaultValue={sp.action ?? ''} className="h-10" aria-label="Action">
            {ACTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          <Input name="from" type="date" defaultValue={sp.from} className="h-10" aria-label="From" />
          <Input name="to" type="date" defaultValue={sp.to} className="h-10" aria-label="To" />
          <Button type="submit" variant="secondary">
            Filter
          </Button>
        </form>
        {page.items.length === 0 ? (
          <EmptyState icon={<ScrollText size={22} />} title="No events" description="Nothing matches these filters." />
        ) : (
          <Table>
            <THead>
              <TH>When</TH>
              <TH>Who</TH>
              <TH>What</TH>
              <TH className="hidden lg:table-cell">Request</TH>
            </THead>
            <TBody>
              {page.items.map((e) => (
                <TR key={e.id}>
                  <TD className="whitespace-nowrap text-xs text-mute align-top">{formatDateTime(e.occurredAt)}</TD>
                  <TD className="text-xs align-top">{e.actorEmail ?? <span className="text-mute">system</span>}</TD>
                  <TD className="align-top">
                    <div className="flex flex-col items-start gap-1">
                      <Badge tone={actionTone(e.action)} className="font-mono text-[11px]">
                        {e.action}
                      </Badge>
                      <span className="text-sm">{e.summary}</span>
                    </div>
                    {e.before || e.after ? (
                      <details className="mt-1.5">
                        <summary className="cursor-pointer text-xs text-accent">Details</summary>
                        <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                          {(['before', 'after'] as const).map((k) =>
                            e[k] ? (
                              <div key={k}>
                                <div className="text-[11px] uppercase tracking-wider text-mute">{k}</div>
                                <pre className="mt-0.5 overflow-x-auto rounded-lg bg-soft p-2 text-[11px]">{JSON.stringify(e[k], null, 2)}</pre>
                              </div>
                            ) : null,
                          )}
                        </div>
                      </details>
                    ) : null}
                  </TD>
                  <TD className="hidden lg:table-cell align-top">
                    <code className="text-[11px] text-mute">{e.requestId ?? '—'}</code>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        {page.nextCursor ? (
          <div className="border-t border-line px-4 py-3 flex justify-center">
            <Link href={`/admin/audit?${new URLSearchParams({ ...Object.fromEntries(keep), before: String(page.nextCursor) })}`} className={buttonClass('secondary', 'sm')}>
              Older events
            </Link>
          </div>
        ) : null}
      </Card>
    </>
  );
}
