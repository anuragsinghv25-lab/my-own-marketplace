'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarClock, MoreHorizontal, Plus, Wrench, X } from 'lucide-react';
import { Badge, Button, Dialog, Field, Input, Menu, MenuContent, MenuItem, MenuTrigger, Select, Table, TBody, TD, TH, THead, TR, Textarea } from '@orbita/ui';
import { cancelStatusAction, createNextVersionAction, setStatusAction } from '@/app/(app)/reviews/actions';
import { useRunner } from '@/components/common/use-runner';
import { RescheduleDialog } from '@/components/config/approval-tab';
import { formatDateTime } from '@/lib/format';
import { versionStateLabel } from '@/lib/version-state';
import type { ScheduleValue } from './schedule-fields';

export interface StatusRow {
  nodeId: string;
  name: string;
  path: string[];
  status: { key: string; label: string; sellers: boolean; buyers: boolean; testMode: boolean; note: string };
  override: { id: string; status: string; reason: string; endsAt: string | null } | null;
  upcoming: { id: string; status: string; reason: string; startsAt: string; endsAt: string | null }[];
  live: { id: string; number: number; schedule: ScheduleValue | null; canReschedule: boolean } | null;
  scheduled: { id: string; number: number; schedule: ScheduleValue | null; canReschedule: boolean } | null;
  open: { id: string; number: number; state: string } | null;
  canOperate: boolean;
  canStartNext: boolean;
}

const TONE: Record<string, 'ok' | 'accent' | 'warn' | 'bad' | 'neutral'> = {
  live: 'ok',
  live_for_sellers: 'accent',
  scheduled: 'accent',
  never_live: 'neutral',
  deactivated: 'bad',
  down_for_buyers: 'warn',
  down_for_sellers: 'warn',
  maintenance: 'warn',
};

const STATUS_CHOICES = [
  { value: 'maintenance', label: 'Down for maintenance' },
  { value: 'down_for_buyers', label: 'Down for buyers' },
  { value: 'down_for_sellers', label: 'Down for sellers' },
  { value: 'deactivated', label: 'Deactivated (approvers only)' },
];

export function StatusTable({ rows, today }: { rows: StatusRow[]; today: string }) {
  const [dialog, setDialog] = useState<null | { kind: 'status' | 'reschedule'; row: StatusRow; target?: 'live' | 'scheduled' }>(null);
  const { pending, run } = useRunner();
  const router = useRouter();
  return (
    <>
      <Table>
        <THead>
          <TH>Listing category</TH>
          <TH>Status</TH>
          <TH className="hidden md:table-cell">Live version</TH>
          <TH className="hidden lg:table-cell">Next</TH>
          <TH className="w-12"><span className="sr-only">Actions</span></TH>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.nodeId}>
              <TD>
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-mute truncate max-w-[320px]">{r.path.slice(0, -1).join(' › ')}</div>
              </TD>
              <TD>
                <div className="flex flex-wrap items-center gap-1">
                  <Badge tone={TONE[r.status.key] ?? 'neutral'}>{r.status.label}</Badge>
                  {r.status.testMode ? <Badge tone="ai">Test mode</Badge> : null}
                </div>
                <div className="text-xs text-mute mt-1 max-w-[340px]">{r.status.note}</div>
                {r.upcoming.map((u) => (
                  <div key={u.id} className="text-xs text-warn mt-1 inline-flex items-center gap-1">
                    <CalendarClock size={12} /> {u.status.replaceAll('_', ' ')} from {formatDateTime(u.startsAt)}
                    {r.canOperate ? (
                      <button type="button" aria-label="Cancel planned status" className="ml-1 hover:text-ink" onClick={() => run(() => cancelStatusAction(u.id))}>
                        <X size={12} />
                      </button>
                    ) : null}
                  </div>
                ))}
              </TD>
              <TD className="hidden md:table-cell">
                {r.live ? (
                  <Link href={`/workbench/versions/${r.live.id}`} className="text-sm hover:underline">
                    v{r.live.number}
                  </Link>
                ) : (
                  <span className="text-mute text-sm">—</span>
                )}
                {r.live?.schedule ? <div className="text-xs text-mute">sellers {r.live.schedule.sellerGoLive} · buyers {r.live.schedule.buyerGoLive}</div> : null}
              </TD>
              <TD className="hidden lg:table-cell">
                {r.scheduled ? (
                  <Link href={`/workbench/versions/${r.scheduled.id}`} className="text-sm hover:underline">
                    v{r.scheduled.number} on {r.scheduled.schedule?.sellerGoLive}
                  </Link>
                ) : r.open ? (
                  <Link href={`/workbench/versions/${r.open.id}`} className="text-sm hover:underline">
                    v{r.open.number} · {versionStateLabel(r.open.state)}
                  </Link>
                ) : (
                  <span className="text-mute text-sm">—</span>
                )}
              </TD>
              <TD>
                {r.canOperate || r.canStartNext || r.live?.canReschedule || r.scheduled?.canReschedule ? (
                  <Menu>
                    <MenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`Actions for ${r.name}`}>
                        <MoreHorizontal size={16} />
                      </Button>
                    </MenuTrigger>
                    <MenuContent>
                      {r.canStartNext ? (
                        <MenuItem onSelect={() => run(() => createNextVersionAction(r.nodeId), (s) => router.push(`/workbench/versions/${(s.data as { id: string }).id}`))}>
                          <Plus size={14} /> {r.live || r.scheduled ? 'Start the next version' : 'Start a new version'}
                        </MenuItem>
                      ) : null}
                      {r.scheduled?.canReschedule ? (
                        <MenuItem onSelect={() => setDialog({ kind: 'reschedule', row: r, target: 'scheduled' })}>
                          <CalendarClock size={14} /> Reschedule v{r.scheduled.number}
                        </MenuItem>
                      ) : null}
                      {r.live?.canReschedule ? (
                        <MenuItem onSelect={() => setDialog({ kind: 'reschedule', row: r, target: 'live' })}>
                          <CalendarClock size={14} /> Move buyer go-live
                        </MenuItem>
                      ) : null}
                      {r.canOperate ? (
                        <MenuItem onSelect={() => setDialog({ kind: 'status', row: r })}>
                          <Wrench size={14} /> Downtime or deactivation…
                        </MenuItem>
                      ) : null}
                      {r.canOperate && r.override ? (
                        <MenuItem onSelect={() => run(() => setStatusAction(r.nodeId, { status: 'active', reason: 'Back to normal' }))}>
                          <X size={14} /> End “{r.status.label}”
                        </MenuItem>
                      ) : null}
                    </MenuContent>
                  </Menu>
                ) : null}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      {pending ? <span className="sr-only" role="status">Working…</span> : null}
      {dialog?.kind === 'status' ? <StatusDialog row={dialog.row} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === 'reschedule' ? (
        <RescheduleDialog
          versionId={(dialog.target === 'live' ? dialog.row.live : dialog.row.scheduled)!.id}
          current={(dialog.target === 'live' ? dialog.row.live : dialog.row.scheduled)!.schedule!}
          today={today}
          sellerLocked={dialog.target === 'live'}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}

function StatusDialog({ row, onClose }: { row: StatusRow; onClose: () => void }) {
  const [status, setStatus] = useState('maintenance');
  const [reason, setReason] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const { pending, run } = useRunner();
  // datetime-local is the viewer's local time; the browser converts it to an instant
  const iso = (v: string) => (v ? new Date(v).toISOString() : null);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Downtime for ${row.name}`}
      description="Takes the category away from sellers, buyers or both, now or in a planned window. Recorded with your reason."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={pending} disabled={reason.trim().length < 5} onClick={() => run(() => setStatusAction(row.nodeId, { status, reason, startsAt: iso(startsAt), endsAt: iso(endsAt) }), onClose)}>
            Set status
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Status" htmlFor="st-status">
          <Select id="st-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_CHOICES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="From" htmlFor="st-from" hint="Empty = now">
            <Input id="st-from" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </Field>
          <Field label="Until" htmlFor="st-until" hint="Empty = until changed">
            <Input id="st-until" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </Field>
        </div>
        <Field label="Reason" htmlFor="st-reason" required>
          <Textarea id="st-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Cleaning up RAM values after the supplier change" />
        </Field>
      </div>
    </Dialog>
  );
}
