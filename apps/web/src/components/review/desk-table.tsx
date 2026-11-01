'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlarmClock, UserRound } from 'lucide-react';
import { Badge, Button, Checkbox, Table, TBody, TD, TH, THead, TR, cn } from '@orbita/ui';
import { formatDateTime, timeAgo } from '@/lib/format';
import { AssignDialog } from './decision-panel';

export interface DeskRow {
  id: string;
  title: string;
  state: string;
  attempt: number;
  submittedAt: string;
  submitterName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  dueAt: string | null;
  overdue: boolean;
  canDecide: boolean;
  mineToSkip: boolean;
}

const STATE: Record<string, { label: string; tone: 'accent' | 'warn' | 'ok' | 'neutral' | 'bad' }> = {
  open: { label: 'Waiting', tone: 'accent' },
  sent_back: { label: 'Sent back', tone: 'warn' },
  approved: { label: 'Approved', tone: 'ok' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
  discarded: { label: 'Discarded', tone: 'neutral' },
};

/** Queue table with selection for bulk transfers (platform admins and approvers). */
export function DeskTable({ rows, canAssign, approvers }: { rows: DeskRow[]; canAssign: boolean; approvers: { id: string; name: string; email: string }[] }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);
  const selectable = rows.filter((r) => r.state === 'open');
  const all = selectable.length > 0 && picked.length === selectable.length;
  return (
    <>
      {canAssign && picked.length ? (
        <div className="mb-3 flex items-center gap-3 rounded-xl bg-accent/10 px-4 py-2 text-sm">
          <span className="font-medium">{picked.length} selected</span>
          <Button size="sm" onClick={() => setAssigning(true)}>
            <UserRound size={14} /> Assign…
          </Button>
          <button type="button" className="text-xs text-mute hover:underline" onClick={() => setPicked([])}>Clear</button>
        </div>
      ) : null}
      <Table>
        <THead>
          {canAssign ? (
            <TH className="w-10">
              <Checkbox aria-label="Select all waiting requests" checked={all} onChange={(e) => setPicked(e.target.checked ? selectable.map((r) => r.id) : [])} />
            </TH>
          ) : null}
          <TH>Category version</TH>
          <TH>Status</TH>
          <TH className="hidden md:table-cell">Submitted</TH>
          <TH className="hidden lg:table-cell">Approver</TH>
          <TH>Due</TH>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.id}>
              {canAssign ? (
                <TD>
                  {r.state === 'open' ? (
                    <Checkbox aria-label={`Select ${r.title}`} checked={picked.includes(r.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, r.id] : picked.filter((x) => x !== r.id))} />
                  ) : null}
                </TD>
              ) : null}
              <TD>
                <Link href={`/reviews/${r.id}`} className="font-medium hover:underline">{r.title.split(' › ').at(-1)}</Link>
                <div className="text-xs text-mute truncate max-w-[360px]">{r.title.split(' › ').slice(0, -1).join(' › ')}</div>
              </TD>
              <TD>
                <div className="flex flex-wrap gap-1">
                  <Badge tone={STATE[r.state]?.tone ?? 'neutral'}>{STATE[r.state]?.label ?? r.state}</Badge>
                  {r.attempt > 1 ? <Badge>attempt {r.attempt}</Badge> : null}
                  {r.state === 'open' && r.mineToSkip ? <Badge tone="warn">Your work</Badge> : null}
                </div>
              </TD>
              <TD className="hidden md:table-cell text-mute">
                {r.submitterName} · {timeAgo(r.submittedAt)}
              </TD>
              <TD className="hidden lg:table-cell text-mute">{r.state === 'open' ? (r.assigneeName ?? <span className="italic">Unassigned</span>) : '—'}</TD>
              <TD>
                {r.dueAt && r.state === 'open' ? (
                  <span className={cn('inline-flex items-center gap-1 text-xs', r.overdue ? 'text-bad font-medium' : 'text-mute')} title={formatDateTime(r.dueAt)}>
                    {r.overdue ? <AlarmClock size={13} /> : null}
                    {r.overdue ? `Overdue ${timeAgo(r.dueAt)}` : formatDateTime(r.dueAt)}
                  </span>
                ) : (
                  <span className="text-xs text-mute">—</span>
                )}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      {assigning ? <AssignDialog requestIds={picked} current={null} approvers={approvers} onClose={() => { setAssigning(false); setPicked([]); }} /> : null}
    </>
  );
}
