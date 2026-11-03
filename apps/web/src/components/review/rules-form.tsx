'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Card, CardHeader, Checkbox, Field, Input } from '@orbita/ui';
import { updateReviewDefinitionAction } from '@/app/(app)/reviews/actions';
import { useRunner } from '@/components/common/use-runner';

interface Def {
  id: string;
  subjectType: string;
  name: string;
  stages: { key: string; label: string; role: string }[];
  reasonCodes: { code: string; label: string; for: ('send_back' | 'discard' | 'reject' | 'request_info' | 'escalate')[] }[];
  slaHours: number;
  reminderHours: number;
  maxAttempts: number;
}

const ROLE: Record<string, string> = { approver: 'Approver', reviewer: 'Reviewer' };

/** A review definition as data: SLA, reminders, attempt limit, stage names and reason codes. */
export function RulesForm({ def, editable }: { def: Def; editable: boolean }) {
  const [d, setD] = useState(def);
  const { pending, run } = useRunner();
  const setReason = (i: number, patch: Partial<Def['reasonCodes'][number]>) => setD({ ...d, reasonCodes: d.reasonCodes.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const toggleFor = (i: number, k: 'send_back' | 'discard', on: boolean) => {
    const cur = d.reasonCodes[i]!.for;
    setReason(i, { for: on ? [...new Set([...cur, k])] : cur.filter((x) => x !== k) });
  };
  return (
    <Card>
      <CardHeader title={d.name} description={`Used for: ${d.subjectType.replaceAll('_', ' ')}s`} />
      <div className="border-t border-line p-5 space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="SLA (hours)" htmlFor={`${d.id}-sla`} hint="Overdue after this; every eligible approver hears about it.">
            <Input id={`${d.id}-sla`} type="number" min={1} disabled={!editable} value={d.slaHours} onChange={(e) => setD({ ...d, slaHours: Number(e.target.value) })} />
          </Field>
          <Field label="Reminder after (hours)" htmlFor={`${d.id}-rem`}>
            <Input id={`${d.id}-rem`} type="number" min={1} disabled={!editable} value={d.reminderHours} onChange={(e) => setD({ ...d, reminderHours: Number(e.target.value) })} />
          </Field>
          <Field label="Submissions allowed" htmlFor={`${d.id}-max`} hint="After this many, approve or discard.">
            <Input id={`${d.id}-max`} type="number" min={1} max={20} disabled={!editable} value={d.maxAttempts} onChange={(e) => setD({ ...d, maxAttempts: Number(e.target.value) })} />
          </Field>
        </div>

        <div>
          <div className="text-sm font-medium mb-2">Stages</div>
          <ol className="space-y-2">
            {d.stages.map((s, i) => (
              <li key={s.key} className="flex items-center gap-3">
                <span className="h-7 w-7 rounded-full bg-soft grid place-items-center text-xs text-mute">{i + 1}</span>
                <Input aria-label={`Stage ${i + 1} name`} className="max-w-xs" disabled={!editable} value={s.label} onChange={(e) => setD({ ...d, stages: d.stages.map((x) => (x.key === s.key ? { ...x, label: e.target.value } : x)) })} />
                <span className="text-sm text-mute">decided by an {ROLE[s.role] ?? s.role}</span>
              </li>
            ))}
          </ol>
        </div>

        <div>
          <div className="text-sm font-medium mb-2">Reason codes</div>
          <ul className="space-y-2">
            {d.reasonCodes.map((r, i) => (
              <li key={i} className="grid gap-2 sm:grid-cols-[160px_1fr_auto_auto_auto] items-center">
                <Input aria-label="Code" disabled={!editable} value={r.code} onChange={(e) => setReason(i, { code: e.target.value })} className="font-mono text-[13px]" />
                <Input aria-label="Label" disabled={!editable} value={r.label} onChange={(e) => setReason(i, { label: e.target.value })} />
                <label className="flex items-center gap-1.5 text-xs"><Checkbox disabled={!editable} checked={r.for.includes('send_back')} onChange={(e) => toggleFor(i, 'send_back', e.target.checked)} /> Send back</label>
                <label className="flex items-center gap-1.5 text-xs"><Checkbox disabled={!editable} checked={r.for.includes('discard')} onChange={(e) => toggleFor(i, 'discard', e.target.checked)} /> Discard</label>
                {editable ? (
                  <Button variant="ghost" size="icon" aria-label={`Remove ${r.label}`} onClick={() => setD({ ...d, reasonCodes: d.reasonCodes.filter((_, j) => j !== i) })}>
                    <Trash2 size={15} />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {editable ? (
            <Button variant="secondary" size="sm" className="mt-2" onClick={() => setD({ ...d, reasonCodes: [...d.reasonCodes, { code: '', label: '', for: ['send_back'] }] })}>
              <Plus size={14} /> Add reason
            </Button>
          ) : null}
        </div>

        {editable ? (
          <div className="flex justify-end">
            <Button
              loading={pending}
              onClick={() =>
                run(() =>
                  updateReviewDefinitionAction(d.id, {
                    name: d.name,
                    slaHours: d.slaHours,
                    reminderHours: d.reminderHours,
                    maxAttempts: d.maxAttempts,
                    reasonCodes: d.reasonCodes,
                    stageLabels: Object.fromEntries(d.stages.map((s) => [s.key, s.label])),
                  }),
                )
              }
            >
              Save review rules
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
