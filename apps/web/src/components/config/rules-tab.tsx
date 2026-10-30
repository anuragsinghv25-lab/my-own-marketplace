'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, EyeOff, IndianRupee, ListFilter, Pencil, Plus, Scale, Trash2, X, XCircle } from 'lucide-react';
import { describeRule, opsFor, type Condition, type FieldDef, type Issue, type RuleInput, type RuleKind } from '@orbita/contract';
import { Badge, Button, Card, CardHeader, Dialog, EmptyState, Field, Input, Select, Switch, cn } from '@orbita/ui';
import { deleteRuleAction, saveRuleAction, setRuleEnabledAction } from '@/app/(app)/workbench/versions/actions';
import { useRunner } from '@/components/common/use-runner';

type Rule = RuleInput & { text: string };

const KINDS: { key: RuleKind; label: string; help: string; icon: React.ReactNode }[] = [
  { key: 'restrict', label: 'Limit values', help: 'Only some values or a narrower number range are allowed', icon: <ListFilter size={16} /> },
  { key: 'require', label: 'Make required', help: 'A specification becomes mandatory', icon: <Scale size={16} /> },
  { key: 'hide', label: 'Hide', help: 'A specification does not apply and is hidden', icon: <EyeOff size={16} /> },
  { key: 'price', label: 'Price band', help: 'Offer price must stay within limits', icon: <IndianRupee size={16} /> },
];
const KIND_TONE = { restrict: 'accent', require: 'warn', hide: 'neutral', price: 'ok' } as const;
const OP_LABEL: Record<Condition['op'], string> = {
  in: 'is one of',
  not_in: 'is not one of',
  gte: 'is at least',
  lte: 'is at most',
  between: 'is between',
  is_true: 'is yes',
  is_false: 'is no',
  filled: 'is filled in',
};

export function RulesTab({ versionId, ws, editable }: { versionId: string; ws: { rules: Rule[]; fields: FieldDef[]; issues: Issue[] }; editable: boolean }) {
  const [editing, setEditing] = useState<Rule | 'new' | null>(null);
  const { pending, run } = useRunner();
  return (
    <Card>
      <CardHeader
        title="Rules"
        description="Rules connect specifications: limit what can be chosen, require or hide specs, and set price bands. They run the same way in the seller's form, on the server and in test cases."
        actions={editable && ws.fields.length ? <Button onClick={() => setEditing('new')}><Plus size={15} /> New rule</Button> : null}
      />
      {!ws.rules.length ? (
        <EmptyState
          icon={<ListFilter size={22} />}
          title="No rules yet"
          description={ws.fields.length ? 'For example: when the processor is AMD, graphics cards are limited to AMD or NVIDIA.' : 'Add specifications first; rules are made from them.'}
        />
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {ws.rules.map((r) => {
            const issues = ws.issues.filter((i) => i.ref === r.id);
            return (
              <li key={r.id} className={cn('px-5 py-3', !r.enabled && 'opacity-60')}>
                <div className="flex flex-wrap items-start gap-3">
                  <Badge tone={KIND_TONE[r.kind]} className="mt-0.5">{KINDS.find((k) => k.key === r.kind)!.label}</Badge>
                  <div className="flex-1 min-w-[240px]">
                    {r.name ? <div className="text-sm font-medium">{r.name}</div> : null}
                    <div className={cn('text-sm', r.name && 'text-mute')}>{r.text}</div>
                    {r.message ? <div className="text-xs text-mute mt-0.5">Sellers see: “{r.message}”</div> : null}
                  </div>
                  {editable ? (
                    <div className="flex items-center gap-1">
                      <Switch checked={r.enabled} onCheckedChange={(v) => run(() => setRuleEnabledAction(versionId, r.id, v))} label={<span className="sr-only">On</span>} />
                      <Button size="icon" variant="ghost" aria-label="Edit rule" onClick={() => setEditing(r)}><Pencil size={14} /></Button>
                      <Button size="icon" variant="ghost" aria-label="Delete rule" loading={pending} onClick={() => run(() => deleteRuleAction(versionId, r.id))}><Trash2 size={14} /></Button>
                    </div>
                  ) : null}
                </div>
                {issues.map((i) => (
                  <p key={i.message} className={cn('mt-1.5 flex items-start gap-1.5 text-xs', i.severity === 'error' ? 'text-bad' : 'text-warn')}>
                    {i.severity === 'error' ? <XCircle size={13} className="mt-px" /> : <AlertTriangle size={13} className="mt-px" />} {i.message}
                  </p>
                ))}
              </li>
            );
          })}
        </ul>
      )}
      {editing ? <RuleBuilder key={editing === 'new' ? 'new' : editing.id} versionId={versionId} fields={ws.fields} initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </Card>
  );
}

const num = (s: string) => (s.trim() === '' ? undefined : Number(s));

function RuleBuilder({ versionId, fields, initial, onClose }: { versionId: string; fields: FieldDef[]; initial: Rule | null; onClose: () => void }) {
  const [r, setR] = useState<RuleInput>(initial ?? { id: 'draft', kind: 'restrict', name: '', enabled: true, when: [] });
  const [issues, setIssues] = useState<Issue[]>([]);
  const { pending, run } = useRunner();
  const byKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);
  const target = r.target ? byKey.get(r.target) : undefined;
  const targets = fields.filter((f) =>
    r.kind === 'restrict' ? ['select', 'multiselect', 'number', 'range'].includes(f.kind) : r.kind === 'hide' ? f.importance !== 'key' : r.kind === 'require' ? true : false,
  );
  const usable = fields.filter((f) => f.key !== r.target && opsFor(f.kind).length);
  const sentence = useMemo(() => {
    try {
      return describeRule(r, byKey);
    } catch {
      return '';
    }
  }, [r, byKey]);
  const setCond = (i: number, c: Partial<Condition>) => setR({ ...r, when: r.when.map((x, j) => (j === i ? { ...x, ...c } : x)) });
  const valid =
    (r.kind === 'price' ? r.priceMin != null || r.priceMax != null : !!r.target) &&
    (r.kind !== 'restrict' || (target && ['number', 'range'].includes(target.kind) ? r.min != null || r.max != null : (r.values ?? []).length > 0)) &&
    r.when.every((c) => c.key && (c.op === 'in' || c.op === 'not_in' ? (c.values ?? []).length > 0 : true));

  const save = () =>
    run(
      () =>
        saveRuleAction(versionId, {
          ruleId: initial?.id,
          kind: r.kind,
          name: r.name ?? '',
          enabled: r.enabled,
          when: r.when,
          target: r.kind === 'price' ? undefined : r.target,
          values: r.kind === 'restrict' && target && ['select', 'multiselect'].includes(target.kind) ? r.values : undefined,
          min: r.kind === 'restrict' ? (r.min ?? null) : null,
          max: r.kind === 'restrict' ? (r.max ?? null) : null,
          priceMin: r.kind === 'price' ? (r.priceMin ?? null) : null,
          priceMax: r.kind === 'price' ? (r.priceMax ?? null) : null,
          message: r.message,
        }),
      (s) => {
        const iss = ((s.data?.issues as Issue[]) ?? []).filter((i) => i.severity === 'error');
        if (iss.length) setIssues(iss);
        else onClose();
      },
    );

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={initial ? 'Edit rule' : 'New rule'}
      className="w-[min(760px,calc(100vw-2rem))]"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={pending} disabled={!valid} onClick={save}>Save rule</Button></>}
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Kind of rule">
          {KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              role="radio"
              aria-checked={r.kind === k.key}
              onClick={() => setR({ ...r, kind: k.key, target: k.key === 'price' ? undefined : r.target, values: undefined, min: null, max: null })}
              className={cn('rounded-xl border p-2.5 text-left', r.kind === k.key ? 'border-accent bg-accent/5' : 'border-line')}
            >
              <span className="flex items-center gap-1.5 text-sm font-medium">{k.icon} {k.label}</span>
              <span className="block text-[11px] text-mute leading-snug mt-0.5">{k.help}</span>
            </button>
          ))}
        </div>

        <section>
          <div className="text-sm font-medium mb-2">When</div>
          {r.when.length === 0 ? <p className="text-sm text-mute mb-2">Always (no condition).</p> : null}
          <div className="space-y-2">
            {r.when.map((c, i) => {
              const f = byKey.get(c.key);
              return (
                <div key={i} className="flex flex-wrap items-start gap-2 rounded-xl bg-soft p-2.5">
                  {i > 0 ? <span className="self-center text-xs font-medium text-mute">and</span> : null}
                  <Select aria-label="Specification" className="w-48" value={c.key} onChange={(e) => {
                    const nf = byKey.get(e.target.value);
                    setCond(i, { key: e.target.value, op: nf ? opsFor(nf.kind)[0]! : 'filled', values: undefined, value: undefined, value2: undefined });
                  }}>
                    <option value="">Specification…</option>
                    {usable.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                  </Select>
                  {f ? (
                    <Select aria-label="Condition" className="w-40" value={c.op} onChange={(e) => setCond(i, { op: e.target.value as Condition['op'] })}>
                      {opsFor(f.kind).map((op) => <option key={op} value={op}>{op === 'is_true' ? `is ${f.booleanLabels?.true ?? 'yes'}` : op === 'is_false' ? `is ${f.booleanLabels?.false ?? 'no'}` : OP_LABEL[op]}</option>)}
                    </Select>
                  ) : null}
                  {f && (c.op === 'in' || c.op === 'not_in') ? (
                    <ValuePicker options={(f.options ?? []).map((o) => o.value)} value={c.values ?? []} onChange={(v) => setCond(i, { values: v })} />
                  ) : null}
                  {f && (c.op === 'gte' || c.op === 'lte' || c.op === 'between') ? (
                    <div className="flex items-center gap-1.5">
                      <Input aria-label="Value" className="w-24" inputMode="decimal" value={c.value ?? ''} onChange={(e) => setCond(i, { value: num(e.target.value) })} />
                      {c.op === 'between' ? <><span className="text-xs text-mute">and</span><Input aria-label="Second value" className="w-24" inputMode="decimal" value={c.value2 ?? ''} onChange={(e) => setCond(i, { value2: num(e.target.value) })} /></> : null}
                      {f.unit ? <span className="text-xs text-mute">{f.unit.symbol}</span> : null}
                    </div>
                  ) : null}
                  <Button size="icon" variant="ghost" aria-label="Remove condition" className="ml-auto" onClick={() => setR({ ...r, when: r.when.filter((_, j) => j !== i) })}><X size={14} /></Button>
                </div>
              );
            })}
          </div>
          {r.when.length < 5 ? <Button size="sm" variant="secondary" className="mt-2" onClick={() => setR({ ...r, when: [...r.when, { key: '', op: 'in' }] })}><Plus size={14} /> Add condition</Button> : null}
        </section>

        {r.kind !== 'price' ? (
          <section className="space-y-3">
            <Field label="Then this specification" htmlFor="rb-target">
              <Select id="rb-target" value={r.target ?? ''} onChange={(e) => setR({ ...r, target: e.target.value || undefined, values: undefined, min: null, max: null, when: r.when.filter((c) => c.key !== e.target.value) })}>
                <option value="">Choose…</option>
                {targets.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </Select>
            </Field>
            {r.kind === 'restrict' && target && (target.kind === 'select' || target.kind === 'multiselect') ? (
              <div>
                <div className="text-sm font-medium mb-1.5">can only be</div>
                <ValuePicker options={(target.options ?? []).map((o) => o.value)} value={r.values ?? []} onChange={(v) => setR({ ...r, values: v })} />
              </div>
            ) : null}
            {r.kind === 'restrict' && target && (target.kind === 'number' || target.kind === 'range') ? (
              <div className="grid grid-cols-2 gap-3 max-w-sm">
                <Field label={`At least${target.unit ? ` (${target.unit.symbol})` : ''}`} htmlFor="rb-min"><Input id="rb-min" inputMode="decimal" value={r.min ?? ''} onChange={(e) => setR({ ...r, min: num(e.target.value) ?? null })} /></Field>
                <Field label={`At most${target.unit ? ` (${target.unit.symbol})` : ''}`} htmlFor="rb-max"><Input id="rb-max" inputMode="decimal" value={r.max ?? ''} onChange={(e) => setR({ ...r, max: num(e.target.value) ?? null })} /></Field>
              </div>
            ) : null}
          </section>
        ) : (
          <div className="grid grid-cols-2 gap-3 max-w-sm">
            <Field label="Lowest price (₹)" htmlFor="rb-pmin"><Input id="rb-pmin" inputMode="decimal" value={r.priceMin ?? ''} onChange={(e) => setR({ ...r, priceMin: num(e.target.value) ?? null })} /></Field>
            <Field label="Highest price (₹)" htmlFor="rb-pmax"><Input id="rb-pmax" inputMode="decimal" value={r.priceMax ?? ''} onChange={(e) => setR({ ...r, priceMax: num(e.target.value) ?? null })} /></Field>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Name (optional)" htmlFor="rb-name"><Input id="rb-name" value={r.name ?? ''} onChange={(e) => setR({ ...r, name: e.target.value })} placeholder="AMD pairs with AMD or NVIDIA graphics" /></Field>
          <Field label="Message to sellers (optional)" htmlFor="rb-msg"><Input id="rb-msg" value={r.message ?? ''} onChange={(e) => setR({ ...r, message: e.target.value })} placeholder="Why this rule exists" /></Field>
        </div>

        {valid && sentence ? (
          <div className="rounded-xl bg-ai/10 px-4 py-3 text-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ai mb-0.5">Reads as</div>
            {sentence}
          </div>
        ) : null}
        {issues.map((i) => <p key={i.message} className="flex items-start gap-1.5 text-sm text-bad"><XCircle size={15} className="mt-0.5" /> {i.message}</p>)}
      </div>
    </Dialog>
  );
}

function ValuePicker({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 max-w-full">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button key={o} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])} className={cn('h-7 rounded-full border px-2.5 text-xs', on ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-card text-mute hover:text-ink')}>
            {o}
          </button>
        );
      })}
    </div>
  );
}
