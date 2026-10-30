'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Filter, GitCompareArrows, Layers, Plus, Search, Sparkles, Trash2, XCircle, AlertTriangle } from 'lucide-react';
import type { SpecView } from '@orbita/category-config';
import { renderTitle, type Contract, type Issue } from '@orbita/contract';
import { Badge, Button, Card, CardHeader, Checkbox, Dialog, EmptyState, Field, Input, Select, Textarea, cn } from '@orbita/ui';
import {
  addSpecAction,
  moveSpecAction,
  removeSpecAction,
  searchAttributesAction,
  setTitleTemplateAction,
  startFromAttributeSetAction,
  updateSpecAction,
} from '@/app/(app)/workbench/versions/actions';
import { useRunner } from '@/components/common/use-runner';

const TYPE_LABEL: Record<string, string> = {
  boolean: 'Yes / no',
  enumerable: 'One of a list',
  multi_enumerable: 'Several of a list',
  ordinal: 'Ranked list',
  group_ordinal: 'Grouped ranks',
  numeric: 'Number',
  numeric_range: 'Number range',
  measurable: 'Measurement',
  measurable_range: 'Measurement range',
  text: 'Text',
  key_value: 'Name / value pairs',
};
const LIST = ['enumerable', 'multi_enumerable', 'ordinal', 'group_ordinal'];
const NUMBER = ['numeric', 'numeric_range', 'measurable', 'measurable_range'];
const IMPORTANCE = [
  { key: 'key', label: 'Key spec', help: 'Identifies the product: required, in titles and duplicate checks' },
  { key: 'required', label: 'Required', help: 'Sellers must fill it in' },
  { key: 'recommended', label: 'Recommended', help: 'Counts towards listing quality' },
  { key: 'optional', label: 'Optional', help: 'Nice to have' },
] as const;
const IMP_TONE = { key: 'accent', required: 'warn', recommended: 'ok', optional: 'neutral' } as const;

interface AttrSetItem {
  attributeId: string;
  name: string;
  code: string;
  required: boolean;
  inheritedFrom: string | null;
}

export function SpecsTab({
  versionId,
  ws,
  editable,
}: {
  versionId: string;
  ws: { specs: SpecView[]; attributeSet: AttrSetItem[]; titleTemplate: string; issues: Issue[]; contract: Contract | null };
  editable: boolean;
}) {
  const { pending, run } = useRunner();
  const missing = ws.attributeSet.filter((a) => !ws.specs.some((s) => s.attributeId === a.attributeId));
  const groups = [...new Set(ws.specs.map((s) => s.groupName))];
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <TitleCard versionId={versionId} template={ws.titleTemplate} specs={ws.specs} contract={ws.contract} issues={ws.issues.filter((i) => i.section === 'title')} editable={editable} />
      <Card>
        <CardHeader
          title="Specifications"
          description="What sellers describe. Key specs lead the form, the title and duplicate checks; the rest is grouped as sellers will see it."
          actions={
            editable ? (
              <>
                {missing.length ? (
                  <Button variant="secondary" loading={pending} onClick={() => run(() => startFromAttributeSetAction(versionId))}>
                    <Sparkles size={15} /> Add {missing.length} from the attribute set
                  </Button>
                ) : null}
                <AddSpec versionId={versionId} groups={groups} taken={new Set(ws.specs.map((s) => s.attributeId))} />
              </>
            ) : null
          }
        />
        {ws.issues.filter((i) => i.section === 'specs' && !i.ref).map((i) => (
          <p key={i.message} className={cn('mx-5 mb-3 flex items-start gap-1.5 text-sm', i.severity === 'error' ? 'text-bad' : 'text-warn')}>
            {i.severity === 'error' ? <XCircle size={15} className="mt-0.5" /> : <AlertTriangle size={15} className="mt-0.5" />} {i.message}
          </p>
        ))}
        {!ws.specs.length ? (
          <EmptyState
            icon={<Layers size={22} />}
            title="No specifications yet"
            description={missing.length ? `This category's attribute set has ${missing.length} attributes ready to use.` : 'Add attributes from the library.'}
          />
        ) : (
          groups.map((g) => (
            <section key={g} className="border-t border-line">
              <GroupHeading name={g} count={ws.specs.filter((s) => s.groupName === g).length} />
              <ul className="divide-y divide-line">
                {ws.specs.filter((s) => s.groupName === g).map((s) => (
                  <SpecRow
                    key={s.id}
                    versionId={versionId}
                    s={s}
                    first={ws.specs[0]!.id === s.id}
                    last={ws.specs.at(-1)!.id === s.id}
                    groups={groups}
                    issues={ws.issues.filter((i) => i.ref === s.key)}
                    open={open === s.id}
                    onToggle={() => setOpen(open === s.id ? null : s.id)}
                    editable={editable}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </Card>
    </div>
  );
}

function GroupHeading({ name, count }: { name: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-5 pt-3 pb-1">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-mute">{name}</h3>
      <span className="text-[11px] text-mute">{count}</span>
    </div>
  );
}

function sampleFor(c: Contract) {
  const values: Record<string, unknown> = {};
  for (const f of c.fields) {
    if (f.kind === 'select') values[f.key] = f.options?.[0]?.value;
    else if (f.kind === 'multiselect') values[f.key] = f.options?.slice(0, 1).map((o) => o.value);
    else if (f.kind === 'number') values[f.key] = f.min ?? f.step ?? 16;
    else if (f.kind === 'boolean') values[f.key] = true;
  }
  return { values, brand: 'Orbis', model: 'G15' };
}

function TitleCard({ versionId, template, specs, contract, issues, editable }: { versionId: string; template: string; specs: SpecView[]; contract: Contract | null; issues: Issue[]; editable: boolean }) {
  const [t, setT] = useState(template);
  const { pending, run } = useRunner();
  const preview = useMemo(() => (contract ? renderTitle({ ...contract, titleTemplate: t.trim() || '{brand} {model} {key_specs}' }, sampleFor(contract)) : ''), [contract, t]);
  const insert = (token: string) => setT((x) => `${x}${x && !x.endsWith(' ') ? ' ' : ''}{${token}}`);
  return (
    <Card>
      <CardHeader title="Product title" description="Built from the brand, model and specs, so every title in the category reads the same way. Sellers cannot type over it." />
      <div className="border-t border-line px-5 py-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <Input value={t} onChange={(e) => setT(e.target.value)} placeholder="{brand} {model} {key_specs}" aria-label="Title template" className="flex-1 min-w-[260px] font-mono text-sm" disabled={!editable} />
          {editable ? <Button loading={pending} disabled={t === template} onClick={() => run(() => setTitleTemplateAction(versionId, t))}>Save</Button> : null}
        </div>
        {editable ? (
          <div className="flex flex-wrap gap-1.5">
            {['brand', 'model', 'key_specs', ...specs.map((s) => s.key)].map((k) => (
              <button key={k} type="button" onClick={() => insert(k)} className="rounded-md bg-soft px-2 py-0.5 font-mono text-[11px] text-mute hover:text-ink">
                {`{${k}}`}
              </button>
            ))}
          </div>
        ) : null}
        {preview ? <p className="text-sm"><span className="text-mute">Example: </span><span className="font-medium">{preview}</span></p> : null}
        {issues.map((i) => <p key={i.message} className={cn('text-sm', i.severity === 'error' ? 'text-bad' : 'text-warn')}>{i.message}</p>)}
      </div>
    </Card>
  );
}

function SpecRow({
  versionId,
  s,
  first,
  last,
  groups,
  issues,
  open,
  onToggle,
  editable,
}: {
  versionId: string;
  s: SpecView;
  first: boolean;
  last: boolean;
  groups: string[];
  issues: Issue[];
  open: boolean;
  onToggle: () => void;
  editable: boolean;
}) {
  const { pending, run } = useRunner();
  const narrowed = s.allowedValues ? `${s.allowedValues.length} of ${s.options.length} values` : LIST.includes(s.dataType) ? `${s.options.length} values` : '';
  return (
    <li>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5">
        <button type="button" onClick={onToggle} className="flex flex-1 min-w-[220px] items-center gap-2 text-left" aria-expanded={open}>
          {open ? <ChevronDown size={15} className="text-mute" /> : <ChevronRight size={15} className="text-mute" />}
          <span>
            <span className="block text-sm font-medium">{s.name}</span>
            <span className="block text-[11px] text-mute">
              {TYPE_LABEL[s.dataType]}
              {narrowed ? ` · ${narrowed}` : ''}
              {s.minValue != null || s.maxValue != null ? ` · ${s.minValue ?? '…'}–${s.maxValue ?? '…'}${s.units.find((u) => (s.unitId ? u.id === s.unitId : u.isDefault))?.symbol ? ` ${s.units.find((u) => (s.unitId ? u.id === s.unitId : u.isDefault))!.symbol}` : ''}` : ''}
              {' · '}<code>{s.key}</code>
            </span>
          </span>
        </button>
        <div className="flex items-center gap-1.5 text-mute">
          {s.filterable ? <Filter size={14} aria-label="Buyer filter" /> : null}
          {s.comparable ? <GitCompareArrows size={14} aria-label="Shown in comparisons" /> : null}
          {s.variantOption ? <Badge className="text-[10px]">Variant</Badge> : null}
        </div>
        <Badge tone={IMP_TONE[s.importance]}>{IMPORTANCE.find((i) => i.key === s.importance)!.label}</Badge>
        {issues.length ? (
          <span className={cn('inline-flex items-center gap-1 text-xs', issues.some((i) => i.severity === 'error') ? 'text-bad' : 'text-warn')}>
            {issues.some((i) => i.severity === 'error') ? <XCircle size={14} /> : <AlertTriangle size={14} />} {issues.length}
          </span>
        ) : null}
        {editable ? (
          <div className="flex gap-0.5">
            <Button size="icon" variant="ghost" aria-label={`Move ${s.name} up`} disabled={first || pending} onClick={() => run(() => moveSpecAction(versionId, s.id, 'up'))}><ArrowUp size={14} /></Button>
            <Button size="icon" variant="ghost" aria-label={`Move ${s.name} down`} disabled={last || pending} onClick={() => run(() => moveSpecAction(versionId, s.id, 'down'))}><ArrowDown size={14} /></Button>
            <Button size="icon" variant="ghost" aria-label={`Remove ${s.name}`} disabled={pending} onClick={() => run(() => removeSpecAction(versionId, s.id))}><Trash2 size={14} /></Button>
          </div>
        ) : null}
      </div>
      {issues.map((i) => (
        <p key={i.message} className={cn('px-12 pb-2 text-xs', i.severity === 'error' ? 'text-bad' : 'text-warn')}>{i.message}</p>
      ))}
      {open ? <SpecEditor versionId={versionId} s={s} groups={groups} editable={editable} onDone={onToggle} /> : null}
    </li>
  );
}

function SpecEditor({ versionId, s, groups, editable, onDone }: { versionId: string; s: SpecView; groups: string[]; editable: boolean; onDone: () => void }) {
  const [f, setF] = useState({
    importance: s.importance,
    groupName: s.groupName,
    filterable: s.filterable,
    comparable: s.comparable,
    variantOption: s.variantOption,
    preference: s.preference,
    multiple: s.multiple,
    allowedValues: s.allowedValues,
    minValue: s.minValue,
    maxValue: s.maxValue,
    step: s.step,
    decimals: s.decimals,
    unitId: s.unitId,
    sellerHint: s.sellerHint,
    buyerHint: s.buyerHint,
  });
  const { pending, run } = useRunner();
  const isList = LIST.includes(s.dataType);
  const isNumber = NUMBER.includes(s.dataType);
  const changed = Object.fromEntries(Object.entries(f).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify((s as unknown as Record<string, unknown>)[k])));
  const n = (v: string) => (v.trim() === '' ? null : Number(v));
  const av = s.attributeValidation;
  const allowed = f.allowedValues ?? s.options.map((o) => o.value);

  return (
    <div className="mx-5 mb-4 rounded-xl bg-soft p-4 space-y-4">
      <fieldset disabled={!editable} className="space-y-4">
        <div>
          <div className="text-sm font-medium mb-1.5">Importance</div>
          <div className="grid sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Importance">
            {IMPORTANCE.map((i) => (
              <button
                key={i.key}
                type="button"
                role="radio"
                aria-checked={f.importance === i.key}
                onClick={() => setF({ ...f, importance: i.key })}
                className={cn('rounded-xl border p-2.5 text-left', f.importance === i.key ? 'border-accent bg-card' : 'border-line bg-card/50')}
              >
                <span className="block text-sm font-medium">{i.label}</span>
                <span className="block text-[11px] text-mute leading-snug">{i.help}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Group" htmlFor={`g-${s.id}`}>
            <Input id={`g-${s.id}`} list={`gl-${s.id}`} value={f.groupName} onChange={(e) => setF({ ...f, groupName: e.target.value })} />
            <datalist id={`gl-${s.id}`}>{groups.map((g) => <option key={g} value={g} />)}</datalist>
          </Field>
          {isNumber || s.dataType === 'ordinal' || s.dataType === 'group_ordinal' ? (
            <Field label="In comparisons" htmlFor={`p-${s.id}`}>
              <Select id={`p-${s.id}`} value={f.preference} onChange={(e) => setF({ ...f, preference: e.target.value as SpecView['preference'] })}>
                <option value="none">No preference</option>
                <option value="higher">Higher is better</option>
                <option value="lower">Lower is better</option>
              </Select>
            </Field>
          ) : null}
          {s.dataType === 'enumerable' || s.dataType === 'multi_enumerable' ? (
            <Field label="Sellers choose" htmlFor={`m-${s.id}`}>
              <Select
                id={`m-${s.id}`}
                value={f.multiple === null ? 'type' : f.multiple ? 'many' : 'one'}
                onChange={(e) => setF({ ...f, multiple: e.target.value === 'type' ? null : e.target.value === 'many' })}
              >
                <option value="type">{s.dataType === 'enumerable' ? 'One value (library default)' : 'Several values (library default)'}</option>
                <option value="one">One value</option>
                <option value="many">Several values</option>
              </Select>
            </Field>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.filterable} onChange={(e) => setF({ ...f, filterable: e.target.checked })} /> Buyers can filter by it</label>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.comparable} onChange={(e) => setF({ ...f, comparable: e.target.checked })} /> Shown in comparisons</label>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.variantOption} onChange={(e) => setF({ ...f, variantOption: e.target.checked })} /> Variant option (R5)</label>
        </div>
        {isList ? (
          <div>
            <div className="flex items-center gap-3 mb-1.5">
              <span className="text-sm font-medium">Allowed values</span>
              <label className="flex items-center gap-1.5 text-xs text-mute">
                <Checkbox checked={f.allowedValues === null} onChange={(e) => setF({ ...f, allowedValues: e.target.checked ? null : s.options.map((o) => o.value) })} /> All {s.options.length} values
              </label>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
              {s.options.map((o) => {
                const on = allowed.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    aria-pressed={on}
                    disabled={f.allowedValues === null}
                    onClick={() => setF({ ...f, allowedValues: on ? allowed.filter((x) => x !== o.value) : [...allowed, o.value] })}
                    className={cn('h-7 rounded-full border px-2.5 text-xs disabled:opacity-60', on ? 'border-accent bg-card text-accent' : 'border-line text-mute')}
                  >
                    {o.value}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        {isNumber ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Field label="Minimum" htmlFor={`min-${s.id}`} hint={av.min !== undefined ? `Library: ${av.min}` : undefined}>
              <Input id={`min-${s.id}`} inputMode="decimal" value={f.minValue ?? ''} onChange={(e) => setF({ ...f, minValue: n(e.target.value) })} />
            </Field>
            <Field label="Maximum" htmlFor={`max-${s.id}`} hint={av.max !== undefined ? `Library: ${av.max}` : undefined}>
              <Input id={`max-${s.id}`} inputMode="decimal" value={f.maxValue ?? ''} onChange={(e) => setF({ ...f, maxValue: n(e.target.value) })} />
            </Field>
            <Field label="Step" htmlFor={`step-${s.id}`}>
              <Input id={`step-${s.id}`} inputMode="decimal" value={f.step ?? ''} onChange={(e) => setF({ ...f, step: n(e.target.value) })} />
            </Field>
            <Field label="Decimals" htmlFor={`dec-${s.id}`}>
              <Input id={`dec-${s.id}`} inputMode="numeric" value={f.decimals ?? ''} onChange={(e) => setF({ ...f, decimals: n(e.target.value) })} />
            </Field>
            {s.units.length ? (
              <Field label="Unit" htmlFor={`u-${s.id}`}>
                <Select id={`u-${s.id}`} value={f.unitId ?? ''} onChange={(e) => setF({ ...f, unitId: e.target.value || null })}>
                  <option value="">{s.units.find((u) => u.isDefault)?.symbol ?? 'Default'} (default)</option>
                  {s.units.filter((u) => !u.isDefault).map((u) => <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>)}
                </Select>
              </Field>
            ) : null}
          </div>
        ) : null}
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Hint for sellers" htmlFor={`sh-${s.id}`}>
            <Textarea id={`sh-${s.id}`} className="min-h-14" value={f.sellerHint} onChange={(e) => setF({ ...f, sellerHint: e.target.value })} />
          </Field>
          <Field label="Hint for buyers" htmlFor={`bh-${s.id}`}>
            <Textarea id={`bh-${s.id}`} className="min-h-14" value={f.buyerHint} onChange={(e) => setF({ ...f, buyerHint: e.target.value })} />
          </Field>
        </div>
      </fieldset>
      {editable ? (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onDone}>Close</Button>
          <Button loading={pending} disabled={!Object.keys(changed).length} onClick={() => run(() => updateSpecAction(versionId, s.id, changed), onDone)}>Save {s.name}</Button>
        </div>
      ) : null}
    </div>
  );
}

function AddSpec({ versionId, groups, taken }: { versionId: string; groups: string[]; taken: Set<string> }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState(groups[0] ?? 'General');
  const [results, setResults] = useState<Awaited<ReturnType<typeof searchAttributesAction>>>([]);
  const { pending, run } = useRunner();
  useEffect(() => {
    if (!open) return;
    let live = true;
    const t = setTimeout(async () => {
      const r = await searchAttributesAction(q.trim());
      if (live) setResults(r);
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, open]);
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus size={15} /> Add specification</Button>
      {open ? (
        <Dialog open onOpenChange={setOpen} title="Add a specification" description="Pick an attribute from the library. Missing one? Ask the platform admin to add it.">
          <div className="grid sm:grid-cols-[1fr_180px] gap-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the library" className="pl-9" autoFocus aria-label="Search attributes" />
            </div>
            <Input list="add-groups" value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Group" placeholder="Group" />
            <datalist id="add-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
          </div>
          <ul className="mt-3 divide-y divide-line">
            {results.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{r.name}{r.source !== 'custom' ? <span className="ml-1.5 text-[11px] text-mute">from {r.source === 'shopify' ? 'Shopify' : 'UNSPSC'}</span> : null}</div>
                  <div className="text-xs text-mute">{TYPE_LABEL[r.dataType]} · <code>{r.code}</code></div>
                </div>
                {taken.has(r.id) ? <Badge>Added</Badge> : <Button size="sm" loading={pending} onClick={() => run(() => addSpecAction(versionId, r.id, group))}>Add</Button>}
              </li>
            ))}
          </ul>
        </Dialog>
      ) : null}
    </>
  );
}
