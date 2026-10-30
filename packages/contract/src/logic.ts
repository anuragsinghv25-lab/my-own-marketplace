import type { Condition, ContractRule, FieldDef, FieldKind, Option, RuleInput } from './types';

export const isEmpty = (v: unknown) =>
  v === undefined ||
  v === null ||
  (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) && v !== null && Object.keys(v).length === 0);

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v === undefined || v === null || v === '' ? [] : [String(v)]);

/** Which condition operators make sense for a field kind. */
export function opsFor(kind: FieldKind): Condition['op'][] {
  switch (kind) {
    case 'select':
    case 'multiselect':
      return ['in', 'not_in', 'filled'];
    case 'number':
      return ['gte', 'lte', 'between', 'filled'];
    case 'boolean':
      return ['is_true', 'is_false'];
    default:
      return ['filled'];
  }
}

/** Does the condition hold for this value? An empty value only satisfies nothing (not even not_in). */
export function holds(c: Condition, value: unknown): boolean {
  switch (c.op) {
    case 'filled':
      return !isEmpty(value);
    case 'is_true':
      return value === true;
    case 'is_false':
      return value === false;
    case 'in': {
      const got = asList(value);
      return got.some((v) => (c.values ?? []).includes(v));
    }
    case 'not_in': {
      const got = asList(value);
      return got.length > 0 && !got.some((v) => (c.values ?? []).includes(v));
    }
    case 'gte':
      return typeof value === 'number' && value >= (c.value ?? -Infinity);
    case 'lte':
      return typeof value === 'number' && value <= (c.value ?? Infinity);
    case 'between':
      return typeof value === 'number' && value >= (c.value ?? -Infinity) && value <= (c.value2 ?? Infinity);
  }
}

// ---------------------------------------------------------------------------
// Satisfiability: could two sets of conditions hold at the same time?

interface Domain {
  /** list fields: values still possible (null = any) */
  allowed: Set<string> | null;
  /** list fields: values that must not be chosen */
  banned: Set<string>;
  /** multiselect: each set needs at least one of its values chosen */
  needs: string[][];
  lo: number;
  hi: number;
  bool: boolean | null;
  boolConflict: boolean;
}

export function satisfiable(conds: Condition[], fields: Map<string, FieldDef>): boolean {
  const doms = new Map<string, Domain>();
  for (const c of conds) {
    const f = fields.get(c.key);
    const d =
      doms.get(c.key) ??
      ({
        allowed: f?.options ? new Set(f.options.map((o) => o.value)) : null,
        banned: new Set(),
        needs: [],
        lo: f?.min ?? -Infinity,
        hi: f?.max ?? Infinity,
        bool: null,
        boolConflict: false,
      } as Domain);
    doms.set(c.key, d);
    const multi = f?.kind === 'multiselect';
    switch (c.op) {
      case 'in':
        if (multi) d.needs.push(c.values ?? []);
        else d.allowed = new Set([...(d.allowed ?? new Set(c.values ?? []))].filter((v) => (c.values ?? []).includes(v)));
        break;
      case 'not_in':
        (c.values ?? []).forEach((v) => d.banned.add(v));
        break;
      case 'gte':
        d.lo = Math.max(d.lo, c.value ?? -Infinity);
        break;
      case 'lte':
        d.hi = Math.min(d.hi, c.value ?? Infinity);
        break;
      case 'between':
        d.lo = Math.max(d.lo, c.value ?? -Infinity);
        d.hi = Math.min(d.hi, c.value2 ?? Infinity);
        break;
      case 'is_true':
      case 'is_false': {
        const b = c.op === 'is_true';
        if (d.bool !== null && d.bool !== b) d.boolConflict = true;
        d.bool = b;
        break;
      }
      case 'filled':
        break;
    }
  }
  for (const d of doms.values()) {
    if (d.boolConflict || d.lo > d.hi) return false;
    const pool = d.allowed ? [...d.allowed].filter((v) => !d.banned.has(v)) : null;
    if (pool && pool.length === 0) return false;
    for (const need of d.needs) if (!need.some((v) => !d.banned.has(v) && (!pool || pool.includes(v)))) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Words

const list = (vs: string[]) => (vs.length <= 1 ? (vs[0] ?? '') : `${vs.slice(0, -1).join(', ')} or ${vs.at(-1)}`);
const num = (n: number, f?: FieldDef) => `${Number.isInteger(n) ? n : Number(n.toFixed(4))}${f?.unit ? ` ${f.unit.symbol}` : ''}`;
const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export function describeCondition(c: Condition, f?: FieldDef): string {
  const name = f?.label ?? c.key;
  switch (c.op) {
    case 'in':
      return `${name} is ${list(c.values ?? [])}`;
    case 'not_in':
      return `${name} is not ${list(c.values ?? [])}`;
    case 'gte':
      return `${name} is at least ${num(c.value ?? 0, f)}`;
    case 'lte':
      return `${name} is at most ${num(c.value ?? 0, f)}`;
    case 'between':
      return `${name} is between ${num(c.value ?? 0, f)} and ${num(c.value2 ?? 0, f)}`;
    case 'is_true':
      return `${name} is ${f?.booleanLabels?.true ?? 'yes'}`;
    case 'is_false':
      return `${name} is ${f?.booleanLabels?.false ?? 'no'}`;
    case 'filled':
      return `${name} is filled in`;
  }
}

export function describeRule(r: RuleInput | ContractRule, fields: Map<string, FieldDef>): string {
  const when = r.when.length ? `When ${r.when.map((c) => describeCondition(c, fields.get(c.key))).join(' and ')}, ` : '';
  const t = r.target ? fields.get(r.target) : undefined;
  const tName = t?.label ?? r.target ?? '';
  const cap = (s: string) => (when ? s : s.charAt(0).toUpperCase() + s.slice(1));
  switch (r.kind) {
    case 'restrict':
      if (r.values?.length) return `${when}${cap(`${tName} can only be ${list(r.values)}`)}.`;
      if (r.min != null && r.max != null) return `${when}${cap(`${tName} must be between ${num(r.min, t)} and ${num(r.max, t)}`)}.`;
      if (r.min != null) return `${when}${cap(`${tName} must be at least ${num(r.min, t)}`)}.`;
      return `${when}${cap(`${tName} must be at most ${num(r.max ?? 0, t)}`)}.`;
    case 'require':
      return `${when}${cap(`${tName} is required`)}.`;
    case 'hide':
      return `${when}${cap(`${tName} does not apply and is hidden`)}.`;
    case 'price': {
      const lo = r.priceMin != null ? rupees(r.priceMin) : null;
      const hi = r.priceMax != null ? rupees(r.priceMax) : null;
      const band = lo && hi ? `between ${lo} and ${hi}` : lo ? `at least ${lo}` : `at most ${hi}`;
      return `${when}${cap(`the offer price must be ${band} per unit`)}.`;
    }
  }
}

/** A value as a person reads it, with its unit. */
export function formatValue(f: FieldDef, v: unknown): string {
  if (isEmpty(v)) return '';
  switch (f.kind) {
    case 'boolean':
      return v === true ? (f.booleanLabels?.true ?? 'Yes') : (f.booleanLabels?.false ?? 'No');
    case 'multiselect':
      return asList(v).join(', ');
    case 'number':
      return typeof v === 'number' ? num(v, f) : String(v);
    case 'range': {
      const r = v as { min?: number; max?: number };
      return `${r.min ?? ''}–${r.max ?? ''}${f.unit ? ` ${f.unit.symbol}` : ''}`;
    }
    case 'keyvalue':
      return Array.isArray(v) ? (v as { key: string; value: string }[]).map((p) => `${p.key}: ${p.value}`).join('; ') : '';
    default:
      return String(v);
  }
}

export const optionValues = (opts?: Option[]) => (opts ?? []).map((o) => o.value);
