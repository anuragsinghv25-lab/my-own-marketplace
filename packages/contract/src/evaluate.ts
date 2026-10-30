import { formatValue, holds, isEmpty } from './logic';
import type { Contract, ContractRule, EvalProblem, Evaluation, FieldDef, FieldState, Sample } from './types';

const WEIGHT: Record<FieldDef['importance'], number> = { key: 3, required: 2, recommended: 1, optional: 0.5 };
const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/** Drops empty values (blank text, empty lists) so "left empty" means the same everywhere. */
export function sanitize(values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (isEmpty(v)) continue;
    if (Array.isArray(v) && v.every((x) => typeof x === 'string')) out[k] = [...new Set(v as string[])];
    else out[k] = typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

function ruleApplies(r: ContractRule, values: Record<string, unknown>, hidden: Set<string>) {
  return r.when.every((c) => holds(c, hidden.has(c.key) ? undefined : values[c.key]));
}

function checkValue(f: FieldDef, st: FieldState, v: unknown, problems: EvalProblem[]) {
  const bad = (message: string, ruleId?: string) => problems.push({ key: f.key, message: `${f.label}: ${message}`, ...(ruleId ? { ruleId } : {}) });
  const restrictedBy = st.by.at(-1);
  switch (f.kind) {
    case 'boolean':
      if (typeof v !== 'boolean') bad('choose yes or no.');
      return;
    case 'select': {
      if (typeof v !== 'string') return bad('choose one value.');
      if (!(f.options ?? []).some((o) => o.value === v)) return bad(`"${v}" is not one of the allowed values.`);
      if (!(st.options ?? []).some((o) => o.value === v)) bad(`"${v}" is not allowed with the other values chosen.`, restrictedBy);
      return;
    }
    case 'multiselect': {
      if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) return bad('choose one or more values.');
      const notAllowed = (v as string[]).filter((x) => !(f.options ?? []).some((o) => o.value === x));
      if (notAllowed.length) return bad(`${notAllowed.join(', ')} not allowed.`);
      const notNow = (v as string[]).filter((x) => !(st.options ?? []).some((o) => o.value === x));
      if (notNow.length) bad(`${notNow.join(', ')} not allowed with the other values chosen.`, restrictedBy);
      return;
    }
    case 'number': {
      if (typeof v !== 'number' || !Number.isFinite(v)) return bad('enter a number.');
      if (st.min != null && v < st.min) bad(`must be at least ${st.min}${f.unit ? ` ${f.unit.symbol}` : ''}.`, f.min != null && st.min === f.min ? undefined : restrictedBy);
      if (st.max != null && v > st.max) bad(`must be at most ${st.max}${f.unit ? ` ${f.unit.symbol}` : ''}.`, f.max != null && st.max === f.max ? undefined : restrictedBy);
      if (f.step != null && Math.abs(v / f.step - Math.round(v / f.step)) > 1e-9) bad(`must be in steps of ${f.step}.`);
      if (f.decimals != null) {
        const d = (String(v).split('.')[1] ?? '').length;
        if (d > f.decimals) bad(`use at most ${f.decimals} decimal place${f.decimals === 1 ? '' : 's'}.`);
      }
      return;
    }
    case 'range': {
      const r = v as { min?: unknown; max?: unknown };
      if (!r || typeof r.min !== 'number' || typeof r.max !== 'number') return bad('enter a from and a to value.');
      if (r.min > r.max) bad('the from value is above the to value.');
      if (st.min != null && r.min < st.min) bad(`must start at ${st.min} or more.`, restrictedBy);
      if (st.max != null && r.max > st.max) bad(`must end at ${st.max} or less.`, restrictedBy);
      return;
    }
    case 'text': {
      if (typeof v !== 'string') return bad('enter text.');
      if (f.maxLength != null && v.length > f.maxLength) bad(`at most ${f.maxLength} characters.`);
      if (f.pattern && !new RegExp(f.pattern, 'u').test(v)) bad('does not match the expected format.');
      return;
    }
    case 'keyvalue':
      if (!Array.isArray(v) || v.some((p) => !p || typeof p.key !== 'string' || typeof p.value !== 'string' || !p.key || !p.value))
        bad('every row needs a name and a value.');
  }
}

/** Renders the title template; tokens with no value disappear without leaving double spaces. */
export function renderTitle(c: Contract, s: Sample, hidden: Set<string> = new Set()): string {
  const byKey = new Map(c.fields.map((f) => [f.key, f]));
  const keySpecs = c.fields
    .filter((f) => f.importance === 'key' && !hidden.has(f.key))
    .map((f) => formatValue(f, s.values[f.key]))
    .filter(Boolean)
    .join(' ');
  const out = c.titleTemplate
    .replace(/\{([^}]*)\}/g, (_, raw: string) => {
      const t = raw.trim();
      if (t === 'brand') return s.brand ?? '';
      if (t === 'model') return s.model ?? '';
      if (t === 'key_specs') return keySpecs;
      const f = byKey.get(t);
      return f && !hidden.has(t) ? formatValue(f, s.values[t]) : '';
    })
    .replace(/\s+/g, ' ')
    .replace(/\s+([,)])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .trim();
  return out.length > c.titleMaxLength ? `${out.slice(0, c.titleMaxLength - 1).trimEnd()}…` : out;
}

/**
 * Applies the contract to a sample product: which fields show, which are required, what values
 * and numbers are allowed, which price band applies, and every problem. Same answer in the
 * browser, on the server and in contract test cases.
 */
export function evaluate(c: Contract, sample: Sample): Evaluation {
  const values = sanitize(sample.values);
  const hidden = new Set<string>();
  let active: ContractRule[] = [];
  // hiding a field can switch off rules that depended on it, so iterate until stable
  for (let pass = 0; pass < 6; pass++) {
    active = c.rules.filter((r) => ruleApplies(r, values, hidden));
    const next = new Set(active.filter((r) => r.kind === 'hide').map((r) => r.target!));
    if (next.size === hidden.size && [...next].every((k) => hidden.has(k))) break;
    hidden.clear();
    next.forEach((k) => hidden.add(k));
  }

  const fields: Record<string, FieldState> = {};
  for (const f of c.fields) {
    const st: FieldState = { visible: !hidden.has(f.key), required: f.required, by: [] };
    if (f.options) st.options = f.options;
    if (f.min != null) st.min = f.min;
    if (f.max != null) st.max = f.max;
    fields[f.key] = st;
  }
  for (const r of active) {
    if (r.kind === 'price' || !r.target) continue;
    const st = fields[r.target]!;
    if (r.kind === 'hide') {
      st.visible = false;
      st.required = false;
    } else if (r.kind === 'require') st.required = true;
    else if (r.values?.length) st.options = (st.options ?? []).filter((o) => r.values!.includes(o.value));
    else {
      if (r.min != null) st.min = Math.max(st.min ?? -Infinity, r.min);
      if (r.max != null) st.max = Math.min(st.max ?? Infinity, r.max);
    }
    st.by.push(r.id);
  }
  for (const k of hidden) fields[k]!.required = false;

  const errors: EvalProblem[] = [];
  const ignored: string[] = [];
  const byRule = new Map(c.rules.map((r) => [r.id, r]));
  for (const f of c.fields) {
    const st = fields[f.key]!;
    const v = values[f.key];
    if (!st.visible) {
      if (v !== undefined) {
        ignored.push(f.key);
        const why = byRule.get(st.by.at(-1) ?? '');
        errors.push({ key: f.key, message: `${f.label}: does not apply here${why ? ` (${why.text.replace(/\.$/, '')})` : ''}; remove it.`, ruleId: why?.id });
      }
      continue;
    }
    if (v === undefined) {
      if (st.required) {
        const reqRule = st.by.map((id) => byRule.get(id)).find((r) => r?.kind === 'require');
        errors.push({ key: f.key, message: `${f.label} is required${reqRule ? ` (${reqRule.text.replace(/\.$/, '')})` : ''}.`, ...(reqRule ? { ruleId: reqRule.id } : {}) });
      }
      continue;
    }
    const before = errors.length;
    checkValue(f, st, v, errors);
    for (let i = before; i < errors.length; i++) {
      const rid = errors[i]!.ruleId;
      const rule = rid ? byRule.get(rid) : undefined;
      if (rule?.message) errors[i]!.message = `${errors[i]!.message} ${rule.message}`;
    }
  }
  for (const k of Object.keys(values)) if (!fields[k]) errors.push({ key: k, message: `"${k}" is not a specification of this category.` });

  // price
  let priceBand: Evaluation['priceBand'] = null;
  const priceRules = active.filter((r) => r.kind === 'price');
  const reasons: string[] = [];
  let lo: number | null = null;
  let hi: number | null = null;
  for (const r of priceRules) {
    if (r.priceMin != null) lo = Math.max(lo ?? -Infinity, r.priceMin);
    if (r.priceMax != null) hi = Math.min(hi ?? Infinity, r.priceMax);
    reasons.push(r.text);
  }
  const band = c.offer.discountBand;
  const mrp = typeof sample.mrp === 'number' && sample.mrp > 0 ? sample.mrp : null;
  if (band && mrp) {
    const dLo = Math.round(mrp * (1 - band.max / 100) * 100) / 100;
    const dHi = Math.round(mrp * (1 - band.min / 100) * 100) / 100;
    lo = Math.max(lo ?? -Infinity, dLo);
    hi = Math.min(hi ?? Infinity, dHi);
    reasons.push(`Discount of ${band.min}–${band.max}% off the MRP of ${rupees(mrp)}.`);
  }
  if (lo !== null || hi !== null) priceBand = { min: lo, max: hi, reasons };
  if (c.offer.priceLabel === 'offer_price_with_mrp' && sample.price != null && !mrp) errors.push({ key: null, message: 'Give the MRP: buyers see the price against it.' });
  if (typeof sample.price === 'number') {
    if (sample.price <= 0) errors.push({ key: null, message: 'The price must be above zero.' });
    if (mrp && sample.price > mrp) errors.push({ key: null, message: 'The price cannot be above the MRP.' });
    if (priceBand) {
      if (lo !== null && hi !== null && lo > hi) errors.push({ key: null, message: 'No price is possible: the price rules and the discount band do not overlap.' });
      else if ((lo !== null && sample.price < lo) || (hi !== null && sample.price > hi))
        errors.push({
          key: null,
          message: `The price must be ${lo !== null && hi !== null ? `between ${rupees(lo)} and ${rupees(hi)}` : lo !== null ? `at least ${rupees(lo)}` : `at most ${rupees(hi!)}`}.`,
          ...(priceRules[0] ? { ruleId: priceRules.at(-1)!.id } : {}),
        });
    }
  }

  // quality: share of visible fields filled, weighted by importance
  let got = 0;
  let total = 0;
  for (const f of c.fields) {
    if (!fields[f.key]!.visible) continue;
    total += WEIGHT[f.importance];
    if (values[f.key] !== undefined && !errors.some((e) => e.key === f.key)) got += WEIGHT[f.importance];
  }
  return {
    fields,
    errors,
    ignored,
    activeRules: active.map((r) => r.id),
    priceBand,
    title: renderTitle(c, { ...sample, values }, hidden),
    quality: total ? Math.round((got / total) * 100) : 0,
  };
}
