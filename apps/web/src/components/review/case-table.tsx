import Link from 'next/link';
import { AlarmClock } from 'lucide-react';
import { Badge, Table, TBody, TD, TH, THead, TR, cn } from '@orbita/ui';
import { formatDateTime, timeAgo } from '@/lib/format';

export interface CaseRowView {
  id: string;
  title: string;
  state: string;
  attempt: number;
  submittedAt: string;
  submitterName: string;
  assigneeName: string | null;
  dueAt: string | null;
  overdue: boolean;
  escalated: boolean;
  waitingOnSeller: boolean;
  link: string;
  kind?: string;
}

const STATE: Record<string, { label: string; tone: 'accent' | 'warn' | 'ok' | 'neutral' | 'bad' }> = {
  open: { label: 'Waiting', tone: 'accent' },
  approved: { label: 'Approved', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'bad' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
  discarded: { label: 'Closed', tone: 'neutral' },
};

export function CaseTable({ rows, showKind }: { rows: CaseRowView[]; showKind?: boolean }) {
  return (
    <Table>
      <THead>
        <TH>Request</TH>
        {showKind ? <TH>Kind</TH> : null}
        <TH>Status</TH>
        <TH className="hidden md:table-cell">Submitted</TH>
        <TH className="hidden lg:table-cell">Handled by</TH>
        <TH>Due</TH>
      </THead>
      <TBody>
        {rows.map((r) => (
          <TR key={r.id}>
            <TD><Link href={r.link} className="font-medium hover:underline">{r.title}</Link></TD>
            {showKind ? <TD className="text-sm text-mute">{r.kind}</TD> : null}
            <TD>
              <div className="flex flex-wrap gap-1">
                {r.state === 'open' && r.waitingOnSeller ? <Badge tone="warn">Waiting for the seller</Badge> : <Badge tone={STATE[r.state]?.tone ?? 'neutral'}>{STATE[r.state]?.label ?? r.state}</Badge>}
                {r.escalated && r.state === 'open' ? <Badge tone="ai">Escalated</Badge> : null}
                {r.attempt > 1 ? <Badge>attempt {r.attempt}</Badge> : null}
              </div>
            </TD>
            <TD className="hidden md:table-cell text-mute">{r.submitterName} · {timeAgo(r.submittedAt)}</TD>
            <TD className="hidden lg:table-cell text-mute">{r.state === 'open' ? (r.assigneeName ?? <span className="italic">Unassigned</span>) : '—'}</TD>
            <TD>
              {r.dueAt && r.state === 'open' && !r.waitingOnSeller ? (
                <span className={cn('inline-flex items-center gap-1 text-xs', r.overdue ? 'text-bad font-medium' : 'text-mute')}>
                  {r.overdue ? <AlarmClock size={13} /> : null}
                  {r.overdue ? `Overdue ${timeAgo(r.dueAt)}` : formatDateTime(r.dueAt)}
                </span>
              ) : <span className="text-xs text-mute">—</span>}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
