'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarClock, CheckCircle2, CircleAlert, CornerUpLeft, Send, Trash2, Undo2 } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Dialog, Field, Textarea } from '@orbita/ui';
import { discardDraftAction, rescheduleAction, submitVersionAction, withdrawVersionAction } from '@/app/(app)/reviews/actions';
import { useRunner } from '@/components/common/use-runner';
import { Comments, type CommentView, type FieldOption } from '@/components/review/comments';
import { ScheduleFields, type ScheduleValue } from '@/components/review/schedule-fields';
import { Timeline } from '@/components/review/timeline';
import { formatDateTime } from '@/lib/format';

export interface ApprovalData {
  state: string;
  discardReason: string | null;
  readiness: { ready: boolean; problems: string[] } | null;
  schedule: { sellerGoLive: string; buyerGoLive: string; minCatalogs: number; testMode: boolean } | null;
  canSubmit: boolean;
  canWithdraw: boolean;
  canDiscard: boolean;
  canReschedule: boolean;
  canComment: boolean;
  request: {
    id: string;
    state: string;
    attempt: number;
    approverName: string | null;
    dueAt: string | null;
    submittedByName: string | null;
    comments: CommentView[];
    tasks: { id: string; attempt: number; createdAt: string; stage: string }[];
    decisions: { id: string; attempt: number; decision: string; decidedAt: string; byName: string | null; reasonLabel: string | null; note: string }[];
  } | null;
}

/** Submitting, withdrawing and discarding from the studio, with the approver's feedback beside it. */
export function ApprovalTab({ versionId, data, fields, today }: { versionId: string; data: ApprovalData; fields: FieldOption[]; today: string }) {
  const [dialog, setDialog] = useState<null | 'submit' | 'discard' | 'reschedule'>(null);
  const { pending, run } = useRunner();
  const r = data.request;
  const lastSendBack = r?.decisions.filter((d) => d.decision === 'send_back').at(-1);
  const editable = data.state === 'DRAFT' || data.state === 'SENT_BACK';
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
      <div className="space-y-4 min-w-0">
        {data.state === 'SENT_BACK' && lastSendBack ? (
          <Card className="p-5 border-warn/40">
            <div className="flex gap-3">
              <CornerUpLeft size={18} className="text-warn shrink-0 mt-0.5" />
              <div>
                <div className="font-medium">Sent back by {lastSendBack.byName}: {lastSendBack.reasonLabel}</div>
                <p className="text-sm mt-1 whitespace-pre-wrap">{lastSendBack.note}</p>
                <p className="text-xs text-mute mt-2">Fix what the comments ask, compile, and submit again. It goes back to the same approver.</p>
              </div>
            </div>
          </Card>
        ) : null}

        {editable ? (
          <Card>
            <CardHeader title={data.state === 'SENT_BACK' ? 'Submit again' : 'Submit for approval'} description="An approver who has not edited this version checks it, then approves and schedules it." />
            <div className="border-t border-line px-5 py-4 space-y-3">
              {data.readiness?.ready ? (
                <p className="flex items-center gap-2 text-sm text-ok"><CheckCircle2 size={16} /> Compiled, up to date, and every test case behaves as expected.</p>
              ) : (
                <ul className="space-y-1.5">
                  {(data.readiness?.problems ?? []).map((p) => (
                    <li key={p} className="flex gap-2 text-sm"><CircleAlert size={16} className="text-warn shrink-0 mt-0.5" /> {p}</li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                {data.canSubmit ? (
                  <Button disabled={!data.readiness?.ready} onClick={() => setDialog('submit')}>
                    <Send size={15} /> {data.state === 'SENT_BACK' ? 'Submit again' : 'Submit for approval'}
                  </Button>
                ) : null}
                {data.canDiscard ? (
                  <Button variant="danger" onClick={() => setDialog('discard')}>
                    <Trash2 size={15} /> Discard draft
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>
        ) : null}

        {data.state === 'IN_REVIEW' && r ? (
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-medium">Waiting for approval{r.attempt > 1 ? ` (attempt ${r.attempt})` : ''}</div>
                <p className="text-sm text-mute mt-0.5">
                  {r.approverName ? `${r.approverName} is reviewing it.` : 'No approver has picked it up yet.'}
                  {r.dueAt ? ` Due ${formatDateTime(r.dueAt)}.` : ''} The version is frozen while it is in review.
                </p>
              </div>
              {data.canWithdraw ? (
                <Button variant="secondary" loading={pending} onClick={() => run(() => withdrawVersionAction(versionId))}>
                  <Undo2 size={15} /> Withdraw
                </Button>
              ) : null}
            </div>
            <Link href={`/reviews/${r.id}`} className="mt-3 inline-block text-sm text-accent hover:underline">Open the review</Link>
          </Card>
        ) : null}

        {data.schedule && ['APPROVED', 'SCHEDULED', 'PUBLISHED', 'SUPERSEDED'].includes(data.state) ? (
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex gap-3">
                <CalendarClock size={18} className="text-ok shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium">{data.state === 'SCHEDULED' ? 'Approved and scheduled' : data.state === 'SUPERSEDED' ? 'Replaced by a newer version' : 'Approved and live'}</div>
                  <p className="text-sm text-mute mt-0.5">
                    Sellers from {data.schedule.sellerGoLive}, buyers from {data.schedule.buyerGoLive}
                    {data.schedule.minCatalogs ? ` once ${data.schedule.minCatalogs} catalogs exist` : ''}.
                  </p>
                  {data.schedule.testMode ? <Badge tone="ai" className="mt-2">Test mode before go-live</Badge> : null}
                </div>
              </div>
              {data.canReschedule ? <Button variant="secondary" onClick={() => setDialog('reschedule')}>Reschedule</Button> : null}
            </div>
          </Card>
        ) : null}

        {data.state === 'DISCARDED' ? (
          <Card className="p-5 text-sm">
            <div className="font-medium">Discarded</div>
            <p className="text-mute mt-1">{data.discardReason}</p>
            <p className="text-mute mt-2">Start a new version from <Link className="text-accent hover:underline" href="/workbench/status">Category status</Link>.</p>
          </Card>
        ) : null}

        {r ? (
          <Card>
            <CardHeader title="History of this review" />
            <div className="border-t border-line">
              <Timeline tasks={r.tasks} decisions={r.decisions} submitterName={r.submittedByName} />
            </div>
          </Card>
        ) : null}
      </div>

      <aside className="lg:sticky lg:top-[76px]">
        <Card className="p-5">
          {r ? (
            <Comments requestId={r.id} versionId={versionId} comments={r.comments} fields={fields} canComment={data.canComment} currentAttempt={r.attempt} compact />
          ) : (
            <p className="text-sm text-mute">The approver&apos;s comments appear here after you submit.</p>
          )}
        </Card>
      </aside>

      {dialog === 'submit' ? <SubmitDialog versionId={versionId} again={data.state === 'SENT_BACK'} onClose={() => setDialog(null)} /> : null}
      {dialog === 'discard' ? <DiscardDialog versionId={versionId} onClose={() => setDialog(null)} /> : null}
      {dialog === 'reschedule' && data.schedule ? <RescheduleDialog versionId={versionId} current={data.schedule} today={today} sellerLocked={data.state === 'PUBLISHED'} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}

function SubmitDialog({ versionId, again, onClose }: { versionId: string; again: boolean; onClose: () => void }) {
  const [note, setNote] = useState('');
  const { pending, run } = useRunner();
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={again ? 'Submit again' : 'Submit for approval'}
      description="The version freezes while it is reviewed. You can withdraw it until the approver starts."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={pending} onClick={() => run(() => submitVersionAction(versionId, note), onClose)}><Send size={15} /> Submit</Button>
        </>
      }
    >
      <Field label="Note for the approver (optional)" htmlFor="sb-note" hint={again ? 'Say what you changed.' : 'Anything they should look at first.'}>
        <Textarea id="sb-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Dialog>
  );
}

function DiscardDialog({ versionId, onClose }: { versionId: string; onClose: () => void }) {
  const [note, setNote] = useState('');
  const { pending, run } = useRunner();
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Discard this draft"
      description="The draft is closed for good. If the category has a live version, it keeps serving sellers."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={pending} disabled={note.trim().length < 5} onClick={() => run(() => discardDraftAction(versionId, note), onClose)}>Discard</Button>
        </>
      }
    >
      <Field label="Why?" htmlFor="dc-note" required>
        <Textarea id="dc-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Dialog>
  );
}

export function RescheduleDialog({ versionId, current, today, sellerLocked, onClose }: { versionId: string; current: ScheduleValue; today: string; sellerLocked: boolean; onClose: () => void }) {
  const [s, setS] = useState<ScheduleValue>(current);
  const { pending, run } = useRunner();
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Reschedule"
      description={sellerLocked ? 'Sellers already have this version; buyer go-live can still move.' : 'Possible until the version goes live.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={pending} disabled={s.buyerGoLive < s.sellerGoLive} onClick={() => run(() => rescheduleAction(versionId, s), onClose)}>Save</Button>
        </>
      }
    >
      <ScheduleFields value={s} onChange={setS} today={today} sellerLocked={sellerLocked} />
    </Dialog>
  );
}
