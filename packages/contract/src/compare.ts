import type { Contract, FieldDef, OfferTerms } from './types';

/**
 * What changed between two contracts, in words a reviewer can scan. Colours in the UI:
 * added = green, removed = red, modified = orange, state = yellow (a spec's importance tier
 * or a required/optional switch: the field is the same, its standing changed).
 */
export type ChangeKind = 'added' | 'removed' | 'modified' | 'state';
export type ChangeArea = 'spec' | 'rule' | 'flag' | 'title' | 'offer';

export interface ContractChange {
  area: ChangeArea;
  /** spec key, rule name, flag key, offer term */
  key: string;
  label: string;
  kind: ChangeKind;
  /** one line per detail, e.g. "Maximum: 64 → 128" */
  details: string[];
}

const show = (v: unknown): string => {
  if (v === undefined || v === null || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.map(show).join(', ') : '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') {
    const r = v as { min?: unknown; max?: unknown };
    if ('min' in r || 'max' in r) return `${show(r.min)} to ${show(r.max)}`;
    return JSON.stringify(v);
  }
  return String(v);
};

const IMPORTANCE: Record<string, string> = { key: 'Key', required: 'Required', recommended: 'Recommended', optional: 'Optional' };

function fieldChanges(a: FieldDef, b: FieldDef): { state: string[]; other: string[] } {
  const state: string[] = [];
  const other: string[] = [];
  if (a.importance !== b.importance) state.push(`Importance: ${IMPORTANCE[a.importance] ?? a.importance} → ${IMPORTANCE[b.importance] ?? b.importance}`);
  else if (a.required !== b.required) state.push(`Required: ${show(a.required)} → ${show(b.required)}`);
  const simple: [keyof FieldDef, string][] = [
    ['label', 'Name'],
    ['group', 'Group'],
    ['min', 'Minimum'],
    ['max', 'Maximum'],
    ['step', 'Step'],
    ['decimals', 'Decimals'],
    ['maxLength', 'Maximum length'],
    ['pattern', 'Pattern'],
    ['filterable', 'Search filter'],
    ['comparable', 'Comparable'],
    ['variantOption', 'Variant option'],
    ['preference', 'Better when'],
    ['sellerHint', 'Seller hint'],
    ['buyerHint', 'Buyer hint'],
  ];
  for (const [k, name] of simple) if (show(a[k]) !== show(b[k])) other.push(`${name}: ${show(a[k])} → ${show(b[k])}`);
  if ((a.unit?.symbol ?? '') !== (b.unit?.symbol ?? '')) other.push(`Unit: ${show(a.unit?.symbol)} → ${show(b.unit?.symbol)}`);
  const av = new Set((a.options ?? []).map((o) => o.value));
  const bv = new Set((b.options ?? []).map((o) => o.value));
  const added = [...bv].filter((v) => !av.has(v));
  const removed = [...av].filter((v) => !bv.has(v));
  if (added.length) other.push(`Values added: ${added.join(', ')}`);
  if (removed.length) other.push(`Values removed: ${removed.join(', ')}`);
  return { state, other };
}

const OFFER_LABELS: Record<keyof OfferTerms, string> = {
  sellingUnits: 'Selling units',
  priceLabel: 'Price label',
  discountBand: 'Discount off MRP',
  maxImages: 'Maximum images',
  videoAllowed: 'Video allowed',
  countryOfOriginRequired: 'Country of origin required',
  certificatesRequired: 'Certificates required',
  allowedSellers: 'Allowed sellers',
};

const band = (b: OfferTerms['discountBand']) => (b ? `${b.min}% to ${b.max}%` : '—');

/** Changes from `before` to `after`. A null `before` means everything in `after` is new. */
export function compareContracts(before: Contract | null, after: Contract): ContractChange[] {
  const out: ContractChange[] = [];
  const bf = new Map((before?.fields ?? []).map((f) => [f.key, f]));
  const af = new Map(after.fields.map((f) => [f.key, f]));
  for (const f of after.fields) {
    const old = bf.get(f.key);
    if (!old) {
      out.push({ area: 'spec', key: f.key, label: f.label, kind: 'added', details: [`${IMPORTANCE[f.importance] ?? f.importance} · ${f.group}`] });
      continue;
    }
    const { state, other } = fieldChanges(old, f);
    if (state.length) out.push({ area: 'spec', key: f.key, label: f.label, kind: 'state', details: state });
    if (other.length) out.push({ area: 'spec', key: f.key, label: f.label, kind: 'modified', details: other });
  }
  for (const f of before?.fields ?? []) if (!af.has(f.key)) out.push({ area: 'spec', key: f.key, label: f.label, kind: 'removed', details: [] });

  // Rules get new ids in every version, so they are matched by name (or by their sentence when unnamed).
  const ruleKey = (r: Contract['rules'][number]) => (r.name?.trim() ? `name:${r.name.trim().toLowerCase()}` : `text:${r.text}`);
  const br = new Map((before?.rules ?? []).map((r) => [ruleKey(r), r]));
  const ar = new Map(after.rules.map((r) => [ruleKey(r), r]));
  for (const r of after.rules) {
    const old = br.get(ruleKey(r));
    const label = r.name?.trim() || r.text;
    if (!old) out.push({ area: 'rule', key: ruleKey(r), label, kind: 'added', details: [r.text] });
    else if (old.text !== r.text || (old.message ?? '') !== (r.message ?? ''))
      out.push({ area: 'rule', key: ruleKey(r), label, kind: 'modified', details: [`Was: ${old.text}`, `Now: ${r.text}`] });
  }
  for (const r of before?.rules ?? []) if (!ar.has(ruleKey(r))) out.push({ area: 'rule', key: ruleKey(r), label: r.name?.trim() || r.text, kind: 'removed', details: [r.text] });

  // with nothing earlier every flag is "new"; the reviewer reads them as offer terms instead
  const keys = new Set(before ? [...Object.keys(before.flags), ...Object.keys(after.flags)] : []);
  const flagLabel = (k: string) => k.charAt(0).toUpperCase() + k.slice(1).replaceAll('_', ' ');
  for (const k of [...keys].sort()) {
    const was = before?.flags[k];
    const now = after.flags[k];
    if (show(was) === show(now)) continue;
    const kind: ChangeKind = !before || was === undefined ? 'added' : now === undefined ? 'removed' : 'modified';
    out.push({ area: 'flag', key: k, label: flagLabel(k), kind, details: kind === 'modified' ? [`${show(was)} → ${show(now)}`] : [show(now ?? was)] });
  }

  if ((before?.titleTemplate ?? '') !== after.titleTemplate)
    out.push({ area: 'title', key: 'title', label: 'Product title template', kind: before ? 'modified' : 'added', details: [`${show(before?.titleTemplate)} → ${show(after.titleTemplate)}`] });

  if (before) {
    for (const k of Object.keys(OFFER_LABELS) as (keyof OfferTerms)[]) {
      const was = k === 'discountBand' ? band(before.offer[k]) : show(before.offer[k]);
      const now = k === 'discountBand' ? band(after.offer[k]) : show(after.offer[k]);
      if (was !== now) out.push({ area: 'offer', key: k, label: OFFER_LABELS[k], kind: 'modified', details: [`${was} → ${now}`] });
    }
  }
  return out;
}
