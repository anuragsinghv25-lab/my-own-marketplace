'use client';

import { useState } from 'react';
import { ArrowUpRight, CheckCircle2, Hand, MessageSquareMore, ShieldAlert, XCircle } from 'lucide-react';
import { Button, Checkbox, Dialog, Field, Select, Textarea } from '@orbita/ui';
import { claimCaseAction, decideCaseAction } from '@/app/(app)/reviews/seller-actions';
import { useRunner } from '@/components/common/use-runner';

type Decision = 'approve' | 'reject' | 'request_info' | 'escalate';
interface Reason { code: string; label: string; for: string[] }

const COPY: Record<Decision, { title: string; button: string; description: string }> = {
  approve: { title: 'Approve', button: 'Approve', description: 'The seller is told straight away.' },
  reject: { title: 'Reject', button: 'Reject', description: 'The seller sees your reason and note.' },
  request_info: { title: 'Ask the seller for more', button: 'Send to the seller', description: 'The request waits (no SLA runs) until they reply; it then comes back to you.' },
  escalate: { title: 'Escalate to an approver', button: 'Escalate', description: 'An approver decides it. Use this when you are unsure or the decision affects everyone.' },
};

/** The reviewer's (or, after escalation, the approver's) decisions on a seller-side request. */
export function CaseDecisionPanel({
  subjectType,
  subjectId,
  requestId,
  canDecide,
  whyNot,
  canClaim,
  canEscalate,
  reasons,
  categories,
}: {
  subjectType: 'seller_org' | 'vendor_assessment' | 'brand_request';
  subjectId: string;
  requestId: string;
  canDecide: boolean;
  whyNot: string | null;
  canClaim: boolean;
  canEscalate: boolean;
  reasons: Reason[];
  categories?: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState<Decision | null>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [cats, setCats] = useState<string[]>(categories?.map((c) => c.id) ?? []);
  const { pending, run } = useRunner();
  const choices = (d: Decision) => reasons.filter((r) => r.for.includes(d));
  const start = (d: Decision) => {
    setOpen(d);
    setReason(choices(d)[0]?.code ?? '');
    setNote('');
  };
  const needsNote = open !== 'approve';
  const send = () =>
    run(
      () => decideCaseAction(subjectType, subjectId, requestId, { decision: open!, reasonCode: reason || null, note, categoryIds: open === 'approve' && categories ? cats : undefined }),
      () => setOpen(null),
    );
  return (
    <div className="space-y-3">
      {whyNot ? (
        <div className="flex gap-2 rounded-xl bg-warn/10 px-3 py-2.5 text-sm">
          <ShieldAlert size={16} className="text-warn shrink-0 mt-0.5" />
          <span>{whyNot}</span>
        </div>
      ) : null}
      {canClaim ? (
        <Button variant="secondary" className="w-full" loading={pending} onClick={() => run(() => claimCaseAction(subjectType, requestId))}>
          <Hand size={15} /> Pick it up
        </Button>
      ) : null}
      {canDecide ? (
        <div className="grid gap-2">
          <Button onClick={() => start('approve')}><CheckCircle2 size={15} /> Approve</Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => start('request_info')}><MessageSquareMore size={15} /> Ask for more</Button>
            <Button variant="danger" onClick={() => start('reject')}><XCircle size={15} /> Reject</Button>
          </div>
          {canEscalate ? <Button variant="ghost" size="sm" onClick={() => start('escalate')}><ArrowUpRight size={14} /> Escalate to an approver</Button> : null}
        </div>
      ) : null}
      {open ? (
        <Dialog
          open
          onOpenChange={(o) => !o && setOpen(null)}
          title={COPY[open].title}
          description={COPY[open].description}
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(null)}>Cancel</Button>
              <Button variant={open === 'reject' ? 'danger' : 'primary'} loading={pending} disabled={(needsNote && note.trim().length < 5) || (open === 'approve' && !!categories && !cats.length) || (open !== 'approve' && open !== 'request_info' && !reason)} onClick={send}>
                {open === 'approve' && categories && cats.length < categories.length ? `Approve ${cats.length} of ${categories.length}` : COPY[open].button}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            {open === 'approve' && categories ? (
              <fieldset className="space-y-1.5">
                <legend className="text-sm font-medium mb-1">Categories to approve</legend>
                {categories.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={cats.includes(c.id)} onChange={(e) => setCats(e.target.checked ? [...cats, c.id] : cats.filter((x) => x !== c.id))} /> {c.name}
                  </label>
                ))}
              </fieldset>
            ) : null}
            {open !== 'approve' && choices(open).length ? (
              <Field label="Reason" htmlFor="cd-reason" required={open !== 'request_info'}>
                <Select id="cd-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
                  {open === 'request_info' ? <option value="">No specific reason</option> : null}
                  {choices(open).map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                </Select>
              </Field>
            ) : null}
            {open === 'reject' && reason === 'infringing' ? <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm">This blocks the brand in these categories for every seller until an approver revives it.</p> : null}
            <Field label={needsNote ? 'Note' : 'Note (optional)'} htmlFor="cd-note" required={needsNote} hint={open === 'request_info' ? 'Say exactly what to send.' : undefined}>
              <Textarea id="cd-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
