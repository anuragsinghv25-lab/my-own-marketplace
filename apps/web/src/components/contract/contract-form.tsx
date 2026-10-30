'use client';

import { useMemo } from 'react';
import { AlertCircle, EyeOff, Lock, Plus, X } from 'lucide-react';
import { evaluate, type Contract, type Evaluation, type FieldDef, type FieldState, type Sample } from '@orbita/contract';
import { Badge, Button, Field, Input, Select, cn } from '@orbita/ui';

const IMPORTANCE: Record<FieldDef['importance'], { label: string; tone: 'accent' | 'warn' | 'neutral' | 'ok' }> = {
  key: { label: 'Key spec', tone: 'accent' },
  required: { label: 'Required', tone: 'warn' },
  recommended: { label: 'Recommended', tone: 'ok' },
  optional: { label: 'Optional', tone: 'neutral' },
};

const num = (s: string) => (s.trim() === '' ? undefined : Number(s));

/**
 * The seller form, generated from a Category Contract. Every field, option, limit and message
 * comes from the contract and `evaluate`; nothing about a category is written here. R5 uses the
 * same component for real listings, so what a category manager previews is what sellers get.
 */
export function ContractForm({
  contract,
  sample,
  onChange,
  showCore = true,
  showOffer = true,
}: {
  contract: Contract;
  sample: Sample;
  onChange: (s: Sample) => void;
  showCore?: boolean;
  showOffer?: boolean;
}) {
  const ev = useMemo(() => evaluate(contract, sample), [contract, sample]);
  const set = (key: string, v: unknown) => onChange({ ...sample, values: { ...sample.values, [key]: v } });
  const hiddenCount = contract.fields.filter((f) => !ev.fields[f.key]!.visible).length;
  const errFor = (k: string) => ev.errors.filter((e) => e.key === k).map((e) => e.message.replace(/^[^:]+: /, ''));

  return (
    <div className="space-y-6">
      {showCore ? (
        <section className="grid sm:grid-cols-2 gap-4">
          <Field label="Brand" htmlFor="cf-brand" hint="Chosen from your approved brands (R4).">
            <Input id="cf-brand" value={sample.brand ?? ''} onChange={(e) => onChange({ ...sample, brand: e.target.value })} placeholder="Orbis" />
          </Field>
          <Field label="Model" htmlFor="cf-model">
            <Input id="cf-model" value={sample.model ?? ''} onChange={(e) => onChange({ ...sample, model: e.target.value })} placeholder="G15" />
          </Field>
        </section>
      ) : null}

      {contract.groups.map((g) => {
        const fields = contract.fields.filter((f) => f.group === g && ev.fields[f.key]!.visible);
        if (!fields.length) return null;
        return (
          <section key={g}>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-mute mb-3">{g}</h4>
            <div className="grid sm:grid-cols-2 gap-x-4 gap-y-4">
              {fields.map((f) => (
                <FieldInput key={f.key} f={f} st={ev.fields[f.key]!} value={sample.values[f.key]} errors={errFor(f.key)} onChange={(v) => set(f.key, v)} />
              ))}
            </div>
          </section>
        );
      })}
      {hiddenCount ? (
        <p className="flex items-center gap-1.5 text-xs text-mute">
          <EyeOff size={13} /> {hiddenCount} specification{hiddenCount === 1 ? '' : 's'} hidden because {hiddenCount === 1 ? 'it does' : 'they do'} not apply to the values chosen.
        </p>
      ) : null}

      {showOffer ? (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-mute mb-3">Your offer</h4>
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Selling unit" htmlFor="cf-unit">
              <Select id="cf-unit" defaultValue={contract.offer.sellingUnits[0]}>
                {contract.offer.sellingUnits.map((u) => <option key={u} value={u}>{u}</option>)}
              </Select>
            </Field>
            {contract.offer.priceLabel === 'offer_price_with_mrp' ? (
              <Field label="MRP (₹)" htmlFor="cf-mrp" required>
                <Input id="cf-mrp" type="number" inputMode="decimal" value={sample.mrp ?? ''} onChange={(e) => onChange({ ...sample, mrp: num(e.target.value) ?? null })} />
              </Field>
            ) : null}
            <Field
              label="Offer price (₹)"
              htmlFor="cf-price"
              required
              hint={ev.priceBand ? bandText(ev.priceBand) : contract.offer.discountBand ? `Enter the MRP to see the allowed band (${contract.offer.discountBand.min}–${contract.offer.discountBand.max}% off).` : undefined}
            >
              <Input id="cf-price" type="number" inputMode="decimal" value={sample.price ?? ''} onChange={(e) => onChange({ ...sample, price: num(e.target.value) ?? null })} />
            </Field>
          </div>
          {ev.errors.filter((e) => e.key === null).map((e) => (
            <p key={e.message} className="mt-2 flex items-start gap-1.5 text-sm text-bad"><AlertCircle size={15} className="mt-0.5 shrink-0" /> {e.message}</p>
          ))}
        </section>
      ) : null}
    </div>
  );
}

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;
function bandText(b: NonNullable<Evaluation['priceBand']>) {
  if (b.min !== null && b.max !== null) return `Allowed: ${rupees(b.min)} to ${rupees(b.max)}.`;
  if (b.min !== null) return `At least ${rupees(b.min)}.`;
  return `At most ${rupees(b.max!)}.`;
}

function FieldInput({ f, st, value, errors, onChange }: { f: FieldDef; st: FieldState; value: unknown; errors: string[]; onChange: (v: unknown) => void }) {
  const id = `cf-${f.key}`;
  const narrowed = st.by.length > 0 && ((st.options && f.options && st.options.length < f.options.length) || st.min !== f.min || st.max !== f.max);
  const limits =
    f.kind === 'number' || f.kind === 'range'
      ? [st.min != null ? `min ${st.min}` : null, st.max != null ? `max ${st.max}` : null, f.step ? `step ${f.step}` : null].filter(Boolean).join(' · ')
      : '';
  const hint = [f.sellerHint, limits, narrowed ? 'Limited by a category rule for the values chosen.' : ''].filter(Boolean).join(' ');
  return (
    <div className={cn(f.kind === 'multiselect' || f.kind === 'keyvalue' ? 'sm:col-span-2' : '')}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <label htmlFor={id} className="text-sm font-medium">{f.label}</label>
        {st.required ? <span className="text-bad" aria-hidden>*</span> : null}
        <Badge tone={IMPORTANCE[f.importance].tone} className="ml-auto text-[10px]">{IMPORTANCE[f.importance].label}</Badge>
        {narrowed ? <Lock size={12} className="text-ai" aria-label="limited by a rule" /> : null}
      </div>
      <Control f={f} st={st} id={id} value={value} onChange={onChange} />
      {hint ? <p className="mt-1 text-xs text-mute">{hint}</p> : null}
      {errors.map((e) => <p key={e} className="mt-1 text-xs text-bad">{e}</p>)}
    </div>
  );
}

function Control({ f, st, id, value, onChange }: { f: FieldDef; st: FieldState; id: string; value: unknown; onChange: (v: unknown) => void }) {
  const allowed = st.options ?? f.options ?? [];
  switch (f.kind) {
    case 'select': {
      const v = typeof value === 'string' ? value : '';
      const stray = v && !allowed.some((o) => o.value === v);
      return (
        <Select id={id} value={v} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">Choose…</option>
          {stray ? <option value={v}>{v} (not allowed)</option> : null}
          {allowed.map((o) => <option key={o.value} value={o.value}>{o.value}</option>)}
        </Select>
      );
    }
    case 'multiselect': {
      const v = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div id={id} role="group" aria-label={f.label} className="flex flex-wrap gap-1.5">
          {allowed.map((o) => {
            const on = v.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={on}
                onClick={() => onChange(on ? v.filter((x) => x !== o.value) : [...v, o.value])}
                className={cn('h-8 rounded-full border px-3 text-sm', on ? 'border-accent bg-accent/10 text-accent' : 'border-line text-mute hover:text-ink')}
              >
                {o.value}
              </button>
            );
          })}
        </div>
      );
    }
    case 'boolean': {
      const labels = f.booleanLabels ?? { true: 'Yes', false: 'No' };
      return (
        <div id={id} role="radiogroup" aria-label={f.label} className="inline-flex rounded-xl bg-soft p-1">
          {([true, false] as const).map((b) => (
            <button key={String(b)} type="button" role="radio" aria-checked={value === b} onClick={() => onChange(value === b ? undefined : b)} className={cn('h-8 rounded-lg px-4 text-sm', value === b ? 'bg-card shadow-soft text-ink' : 'text-mute')}>
              {b ? labels.true : labels.false}
            </button>
          ))}
        </div>
      );
    }
    case 'number':
      return (
        <div className="relative">
          <Input id={id} type="number" inputMode="decimal" step={f.step ?? 'any'} value={typeof value === 'number' ? value : ''} onChange={(e) => onChange(num(e.target.value))} className={f.unit ? 'pr-12' : ''} />
          {f.unit ? <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-mute">{f.unit.symbol}</span> : null}
        </div>
      );
    case 'range': {
      const r = (value ?? {}) as { min?: number; max?: number };
      return (
        <div className="flex items-center gap-2">
          <Input id={id} aria-label={`${f.label} from`} type="number" value={r.min ?? ''} onChange={(e) => onChange({ ...r, min: num(e.target.value) })} />
          <span className="text-mute">to</span>
          <Input aria-label={`${f.label} to`} type="number" value={r.max ?? ''} onChange={(e) => onChange({ ...r, max: num(e.target.value) })} />
          {f.unit ? <span className="text-sm text-mute">{f.unit.symbol}</span> : null}
        </div>
      );
    }
    case 'keyvalue': {
      const rows = Array.isArray(value) ? (value as { key: string; value: string }[]) : [];
      const put = (next: typeof rows) => onChange(next.length ? next : undefined);
      return (
        <div className="space-y-2" id={id}>
          {rows.map((p, i) => (
            <div key={i} className="flex gap-2">
              <Input aria-label="Name" value={p.key} onChange={(e) => put(rows.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} />
              <Input aria-label="Value" value={p.value} onChange={(e) => put(rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
              <Button size="icon" variant="ghost" aria-label="Remove row" onClick={() => put(rows.filter((_, j) => j !== i))}><X size={14} /></Button>
            </div>
          ))}
          <Button size="sm" variant="secondary" onClick={() => put([...rows, { key: '', value: '' }])}><Plus size={14} /> Add row</Button>
        </div>
      );
    }
    default:
      return <Input id={id} value={typeof value === 'string' ? value : ''} maxLength={f.maxLength} onChange={(e) => onChange(e.target.value)} />;
  }
}

