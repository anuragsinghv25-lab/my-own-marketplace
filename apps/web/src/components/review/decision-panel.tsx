'use client';

import { useState } from 'react';
import { CheckCircle2, CornerUpLeft, Hand, ShieldAlert, Trash2, UserRound } from 'lucide-react';
import { Button, Dialog, Field, Select, Textarea } from '@orbita/ui';
import { assignReviewsAction, claimReviewAction, decideAction } from '@/app/(app)/reviews/actions';
import { useRunner } from '@/components/common/use-runner';
import { nextMonday, ScheduleFields, type ScheduleValue } from './schedule-fields';

export interface Reason {
  code: string;
  label: string;
  for: ('send_back' | 'discard')[];
}

export function DecisionPanel({
  versionId,
  requestId,
  canDecide,
  whyNot,
  canClaim,
  canAssign,
  assigneeId,
  approvers,
  reasons,
  today,
  openComments,
}: {
  versionId: string;
  requestId: string;
  canDecide: boolean;
  whyNot: string | null;
  canClaim: boolean;
  canAssign: boolean;
  assigneeId: string | null;
  approvers: { id: string; name: string; email: string }[];
  reasons: Reason[];
  today: string;
  openComments: number;
}) {
  const [dialog, setDialog] = useState<null | 'approve' | 'send_back' | 'discard' | 'assign'>(null);
  const { pending, run } = useRunner();
  return (
    <div className="space-y-3">
      {whyNot ? (
        <div className="flex gap-2 rounded-xl bg-warn/10 px-3 py-2.5 text-sm">
          <ShieldAlert size={16} className="text-warn shrink-0 mt-0.5" />
          <span>{whyNot}</span>
        </div>
      ) : null}
      {canClaim ? (
        <Button variant="secondary" className="w-full" loading={pending} onClick={() => run(() => claimReviewAction(requestId))}>
          <Hand size={15} /> {assigneeId ? 'Take it over' : 'Pick it up'}
        </Button>
      ) : null}
      {canDecide ? (
        <div className="grid gap-2">
          <Button onClick={() => setDialog('approve')}>
            <CheckCircle2 size={15} /> Approve and schedule
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setDialog('send_back')}>
              <CornerUpLeft size={15} /> Send back
            </Button>
            <Button variant="danger" onClick={() => setDialog('discard')}>
              <Trash2 size={15} /> Discard
            </Button>
          </div>
        </div>
      ) : null}
      {canAssign ? (
        <Button variant="ghost" size="sm" className="w-full" onClick={() => setDialog('assign')}>
          <UserRound size={14} /> {assigneeId ? 'Reassign' : 'Assign to an approver'}
        </Button>
      ) : null}
      {dialog === 'approve' ? <ApproveDialog versionId={versionId} requestId={requestId} today={today} openComments={openComments} onClose={() => setDialog(null)} /> : null}
      {dialog === 'send_back' || dialog === 'discard' ? (
        <ReasonDialog kind={dialog} versionId={versionId} requestId={requestId} reasons={reasons.filter((r) => r.for.includes(dialog))} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === 'assign' ? <AssignDialog requestIds={[requestId]} current={assigneeId} approvers={approvers} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}

function ApproveDialog({ versionId, requestId, today, openComments, onClose }: { versionId: string; requestId: string; today: string; openComments: number; onClose: () => void }) {
  const [s, setS] = useState<ScheduleValue>({ sellerGoLive: today, buyerGoLive: nextMonday(today), minCatalogs: 0, testMode: false });
  const [note, setNote] = useState('');
  const { pending, run } = useRunner();
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Approve and schedule"
      description="A final compile must reproduce the contract you reviewed; the version and its contract are then frozen."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={pending} disabled={s.buyerGoLive < s.sellerGoLive} onClick={() => run(() => decideAction(versionId, requestId, { decision: 'approve', schedule: s, note }), onClose)}>
            {s.sellerGoLive === today ? 'Approve and go live' : 'Approve and schedule'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {openComments ? <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm">{openComments} comment{openComments === 1 ? ' is' : 's are'} still open. Approving closes the review anyway.</p> : null}
        <ScheduleFields value={s} onChange={setS} today={today} />
        <Field label="Note (optional)" htmlFor="ap-note">
          <Textarea id="ap-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

function ReasonDialog({ kind, versionId, requestId, reasons, onClose }: { kind: 'send_back' | 'discard'; versionId: string; requestId: string; reasons: Reason[]; onClose: () => void }) {
  const [reason, setReason] = useState(reasons[0]?.code ?? '');
  const [note, setNote] = useState('');
  const { pending, run } = useRunner();
  const back = kind === 'send_back';
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={back ? 'Send back to the category team' : 'Discard this version'}
      description={back ? 'They fix it and resubmit; it comes back to you.' : 'The version is closed for good. A version that is already live keeps serving.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={back ? 'primary' : 'danger'} loading={pending} disabled={!reason || note.trim().length < 5} onClick={() => run(() => decideAction(versionId, requestId, { decision: kind, reasonCode: reason, note }), onClose)}>
            {back ? 'Send back' : 'Discard'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Reason" htmlFor="rs-code" required>
          <Select id="rs-code" value={reason} onChange={(e) => setReason(e.target.value)}>
            {reasons.map((r) => (
              <option key={r.code} value={r.code}>{r.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Note" htmlFor="rs-note" required hint="At least a few words. Field-level comments you added are sent along.">
          <Textarea id="rs-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

export function AssignDialog({ requestIds, current, approvers, onClose }: { requestIds: string[]; current: string | null; approvers: { id: string; name: string; email: string }[]; onClose: () => void }) {
  const [who, setWho] = useState(current ?? '');
  const { pending, run } = useRunner();
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={requestIds.length > 1 ? `Assign ${requestIds.length} requests` : 'Assign to an approver'}
      description="Only approvers who did not edit or submit the version are listed. The status does not change."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={pending} disabled={!who || who === current} onClick={() => run(() => assignReviewsAction(requestIds, who), onClose)}>Assign</Button>
        </>
      }
    >
      <Field label="Approver" htmlFor="as-approver">
        <Select id="as-approver" value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">Choose…</option>
          {approvers.map((p) => (
            <option key={p.id} value={p.id}>{p.name || p.email}</option>
          ))}
        </Select>
      </Field>
    </Dialog>
  );
}
