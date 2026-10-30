import { describeRule, opsFor, optionValues, satisfiable } from './logic';
import { buildOfferSchema, buildProductSchema } from './schema';
import type {
  CompileInput,
  CompileResult,
  Contract,
  ContractRule,
  FieldDef,
  FieldKind,
  FilterDef,
  Issue,
  OfferTerms,
  RuleInput,
  SpecInput,
} from './types';
import { IMPORTANCE_ORDER } from './types';

export const MAX_KEY_SPECS = 5;
export const MAX_VARIANT_OPTIONS = 3;
export const TITLE_TOKENS = ['brand', 'model', 'key_specs'] as const;

function kindOf(s: SpecInput): FieldKind {
  switch (s.attributeType) {
    case 'boolean':
      return 'boolean';
    case 'enumerable':
      return s.multiple === true ? 'multiselect' : 'select';
    case 'multi_enumerable':
      return s.multiple === false ? 'select' : 'multiselect';
    case 'ordinal':
    case 'group_ordinal':
      return 'select';
    case 'numeric':
    case 'measurable':
      return 'number';
    case 'numeric_range':
    case 'measurable_range':
      return 'range';
    case 'text':
      return 'text';
    case 'key_value':
      return 'keyvalue';
  }
}

const defined = <T>(v: T | null | undefined): v is T => v !== null && v !== undefined;

/** Turns one spec into a field, narrowing the library's bounds; reports what cannot be narrowed. */
function toField(s: SpecInput, order: number, issues: Issue[]): FieldDef {
  const err = (message: string) => issues.push({ severity: 'error', section: 'specs', ref: s.key, message: `${s.label}: ${message}` });
  const warn = (message: string) => issues.push({ severity: 'warning', section: 'specs', ref: s.key, message: `${s.label}: ${message}` });
  const kind = kindOf(s);
  const f: FieldDef = {
    key: s.key,
    label: s.label,
    kind,
    attributeType: s.attributeType,
    group: s.group.trim() || 'General',
    order,
    required: s.importance === 'key' || s.importance === 'required',
    importance: s.importance,
    filterable: s.filterable,
    comparable: s.comparable,
    variantOption: s.variantOption,
    preference: s.preference,
  };
  if (s.sellerHint) f.sellerHint = s.sellerHint;
  if (s.buyerHint) f.buyerHint = s.buyerHint;

  if (kind === 'select' || kind === 'multiselect') {
    const all = s.options ?? [];
    if (!all.length) err('its value list has no active values.');
    if (s.allowedValues) {
      const unknown = s.allowedValues.filter((v) => !all.some((o) => o.value === v));
      if (unknown.length) err(`${unknown.join(', ')} ${unknown.length === 1 ? 'is' : 'are'} not in the value list.`);
      if (!s.allowedValues.length) err('no values are allowed. Allow at least one.');
      f.options = all.filter((o) => s.allowedValues!.includes(o.value));
    } else f.options = all;
    if ((s.attributeType === 'ordinal' || s.attributeType === 'group_ordinal') && s.multiple) warn('a ranked attribute takes one value; "several values" is ignored.');
  }
  if (kind === 'boolean') f.booleanLabels = s.booleanLabels ?? { true: 'Yes', false: 'No' };
  if (kind === 'number' || kind === 'range') {
    const a = s.attributeValidation ?? {};
    if (s.unit) f.unit = s.unit;
    const min = defined(s.min) ? s.min : a.min;
    const max = defined(s.max) ? s.max : a.max;
    if (defined(s.min) && defined(a.min) && s.min < a.min) err(`minimum ${s.min} is below the library's ${a.min}.`);
    if (defined(s.max) && defined(a.max) && s.max > a.max) err(`maximum ${s.max} is above the library's ${a.max}.`);
    if (defined(min) && defined(max) && min > max) err('minimum is larger than maximum.');
    if (defined(min)) f.min = min;
    if (defined(max)) f.max = max;
    const step = defined(s.step) ? s.step : a.step;
    if (defined(step)) {
      if (step <= 0) err('step must be positive.');
      f.step = step;
    }
    const decimals = defined(s.decimals) ? s.decimals : a.decimals;
    if (defined(decimals)) f.decimals = decimals;
  }
  if (kind === 'text') {
    const a = s.attributeValidation ?? {};
    if (defined(a.maxLength)) f.maxLength = a.maxLength;
    if (a.regex) f.pattern = a.regex;
    if (s.filterable) warn('free text makes a poor filter; consider a value list.');
  }
  if (s.variantOption && !(kind === 'select' || kind === 'number' || kind === 'boolean'))
    err('only list, number or yes/no specs can be variant options.');
  if (s.preference !== 'none' && !(kind === 'number' || kind === 'range' || s.attributeType === 'ordinal' || s.attributeType === 'group_ordinal'))
    warn('"higher/lower is better" only applies to numbers and ranked lists; it is ignored here.');
  return f;
}

function checkRule(r: RuleInput, fields: Map<string, FieldDef>, issues: Issue[]) {
  const label = r.name?.trim() || `${r.kind} rule`;
  const err = (message: string) => issues.push({ severity: 'error', section: 'rules', ref: r.id, message: `${label}: ${message}` });
  for (const c of r.when) {
    const f = fields.get(c.key);
    if (!f) {
      err(`it depends on "${c.key}", which is not a specification of this category.`);
      continue;
    }
    if (!opsFor(f.kind).includes(c.op)) err(`"${c.op}" cannot be used on ${f.label}.`);
    if ((c.op === 'in' || c.op === 'not_in') && !(c.values ?? []).length) err(`pick at least one value of ${f.label}.`);
    const unknown = (c.values ?? []).filter((v) => !optionValues(f.options).includes(v));
    if (unknown.length) err(`${unknown.join(', ')} ${unknown.length === 1 ? 'is not an allowed value' : 'are not allowed values'} of ${f.label}.`);
    if ((c.op === 'gte' || c.op === 'lte' || c.op === 'between') && typeof c.value !== 'number') err(`give a number for ${f.label}.`);
    if (c.op === 'between' && (typeof c.value2 !== 'number' || c.value2 < (c.value ?? 0))) err(`the range for ${f.label} is empty.`);
    if (c.key === r.target) err(`it cannot depend on ${f.label}, the specification it changes.`);
  }
  if (r.when.length && !satisfiable(r.when, fields)) err('its conditions can never all be true.');
  if (r.kind === 'price') {
    if (r.priceMin == null && r.priceMax == null) err('give a minimum or a maximum price.');
    if ((r.priceMin ?? 0) < 0 || (r.priceMax ?? 0) < 0) err('prices cannot be negative.');
    if (r.priceMin != null && r.priceMax != null && r.priceMin > r.priceMax) err('the minimum price is above the maximum.');
    return;
  }
  const t = r.target ? fields.get(r.target) : undefined;
  if (!t) {
    err(r.target ? `it changes "${r.target}", which is not a specification of this category.` : 'pick the specification it changes.');
    return;
  }
  if (r.kind === 'hide' && t.importance === 'key') err(`${t.label} is a key spec and can never be hidden.`);
  if (r.kind === 'restrict') {
    if (t.kind === 'select' || t.kind === 'multiselect') {
      if (!(r.values ?? []).length) err(`pick the values of ${t.label} that remain allowed.`);
      const unknown = (r.values ?? []).filter((v) => !optionValues(t.options).includes(v));
      if (unknown.length) err(`${unknown.join(', ')} ${unknown.length === 1 ? 'is not an allowed value' : 'are not allowed values'} of ${t.label}.`);
    } else if (t.kind === 'number' || t.kind === 'range') {
      if (r.min == null && r.max == null) err(`give a minimum or maximum for ${t.label}.`);
      if (r.min != null && r.max != null && r.min > r.max) err('the minimum is above the maximum.');
      if ((r.min != null && t.max != null && r.min > t.max) || (r.max != null && t.min != null && r.max < t.min))
        err(`the bounds fall outside what ${t.label} allows.`);
    } else err(`${t.label} cannot be restricted; only lists and numbers can.`);
  }
}

/** Pairs of rules that can apply together but contradict each other. */
function checkConflicts(rules: RuleInput[], fields: Map<string, FieldDef>, issues: Issue[]) {
  const name = (r: RuleInput) => `"${r.name?.trim() || describeRule(r, fields)}"`;
  for (let i = 0; i < rules.length; i++)
    for (let j = i + 1; j < rules.length; j++) {
      const a = rules[i]!;
      const b = rules[j]!;
      const sameTarget = a.target && a.target === b.target;
      if (!sameTarget && !(a.kind === 'price' && b.kind === 'price')) continue;
      if (!satisfiable([...a.when, ...b.when], fields)) continue;
      const conflict = (message: string) => issues.push({ severity: 'error', section: 'rules', ref: b.id, message });
      const kinds = new Set([a.kind, b.kind]);
      if (kinds.has('require') && kinds.has('hide')) conflict(`${name(a)} and ${name(b)} can apply together: one requires what the other hides.`);
      if (a.kind === 'restrict' && b.kind === 'restrict') {
        if (a.values?.length && b.values?.length && !a.values.some((v) => b.values!.includes(v)))
          conflict(`${name(a)} and ${name(b)} can apply together and leave no allowed value.`);
        const lo = Math.max(a.min ?? -Infinity, b.min ?? -Infinity);
        const hi = Math.min(a.max ?? Infinity, b.max ?? Infinity);
        if (lo > hi) conflict(`${name(a)} and ${name(b)} can apply together and leave no allowed number.`);
      }
      if (a.kind === 'price' && b.kind === 'price') {
        const lo = Math.max(a.priceMin ?? -Infinity, b.priceMin ?? -Infinity);
        const hi = Math.min(a.priceMax ?? Infinity, b.priceMax ?? Infinity);
        if (lo > hi) conflict(`${name(a)} and ${name(b)} can apply together and leave no valid price.`);
      }
    }
  // hide loops: A hidden because of B while B is hidden because of A
  const hides = rules.filter((r) => r.kind === 'hide' && r.target);
  for (const a of hides)
    for (const b of hides)
      if (a !== b && a.when.some((c) => c.key === b.target) && b.when.some((c) => c.key === a.target))
        if (a.id < b.id)
          issues.push({ severity: 'warning', section: 'rules', ref: a.id, message: `${name(a)} and ${name(b)} hide each other's inputs; sellers may never see one of them.` });
}

function checkTitle(template: string, fields: Map<string, FieldDef>, issues: Issue[]) {
  if (!template.trim()) {
    issues.push({ severity: 'warning', section: 'title', message: 'No title template: titles will be "brand model key specs".' });
    return;
  }
  for (const m of template.matchAll(/\{([^}]*)\}/g)) {
    const token = m[1]!.trim();
    if ((TITLE_TOKENS as readonly string[]).includes(token)) continue;
    const f = fields.get(token);
    if (!f) issues.push({ severity: 'error', section: 'title', message: `The title uses {${token}}, which is not a specification of this category.` });
    else if (!f.required) issues.push({ severity: 'warning', section: 'title', message: `The title uses ${f.label}, which sellers may leave empty.` });
  }
  if ((template.match(/\{/g) ?? []).length !== (template.match(/\}/g) ?? []).length)
    issues.push({ severity: 'error', section: 'title', message: 'The title template has an unclosed { }.' });
}

function bucketsFor(f: FieldDef): FilterDef['buckets'] {
  if (f.min == null || f.max == null || f.max <= f.min) return undefined;
  const span = f.max - f.min;
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: NonNullable<FilterDef['buckets']> = [];
  for (let lo = Math.floor(f.min / step) * step; lo < f.max; lo += step) {
    const hi = lo + step;
    const u = f.unit ? ` ${f.unit.symbol}` : '';
    out.push({ min: lo, max: hi, label: `${Number(lo.toFixed(4))}–${Number(hi.toFixed(4))}${u}` });
  }
  return out;
}

function offerTerms(flags: Record<string, unknown>): OfferTerms {
  const band = flags.discount_band as { min?: number; max?: number } | undefined;
  return {
    sellingUnits: Array.isArray(flags.selling_units) ? (flags.selling_units as string[]) : ['piece'],
    priceLabel: typeof flags.price_label === 'string' ? flags.price_label : null,
    discountBand: band && typeof band.min === 'number' && typeof band.max === 'number' ? { min: band.min, max: band.max } : null,
    maxImages: typeof flags.max_images === 'number' ? flags.max_images : null,
    videoAllowed: flags.video_allowed === true,
    countryOfOriginRequired: flags.country_of_origin_required !== false,
    certificatesRequired: flags.certificates_required === true,
    allowedSellers: typeof flags.allowed_sellers === 'string' ? flags.allowed_sellers : null,
  };
}

/**
 * Compiles a category version into its contract. Pure and deterministic: the same input
 * always gives the same contract, so its hash identifies the rules a product was checked against.
 */
export function compile(input: CompileInput): CompileResult {
  const issues: Issue[] = [];
  if (!input.specs.length) issues.push({ severity: 'error', section: 'specs', message: 'Add at least one specification.' });

  // fields, in the order the specs were arranged
  const seen = new Set<string>();
  const fields: FieldDef[] = [];
  input.specs.forEach((s, i) => {
    if (seen.has(s.key)) {
      issues.push({ severity: 'error', section: 'specs', ref: s.key, message: `${s.label} is added twice.` });
      return;
    }
    seen.add(s.key);
    fields.push(toField(s, i, issues));
  });
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const keySpecs = fields.filter((f) => f.importance === 'key');
  if (fields.length && !keySpecs.length)
    issues.push({ severity: 'warning', section: 'specs', message: 'No key spec: mark the 1–5 specs that identify a product (used in titles and duplicate checks).' });
  if (keySpecs.length > MAX_KEY_SPECS)
    issues.push({ severity: 'warning', section: 'specs', message: `${keySpecs.length} key specs; at most ${MAX_KEY_SPECS} keeps product cards readable.` });
  const variants = fields.filter((f) => f.variantOption);
  if (variants.length > MAX_VARIANT_OPTIONS)
    issues.push({ severity: 'error', section: 'specs', message: `At most ${MAX_VARIANT_OPTIONS} variant options (now ${variants.length}).` });

  // flags that still need a decision
  for (const fl of input.flags)
    if (fl.value === null || fl.value === undefined)
      issues.push({ severity: 'error', section: 'flags', ref: fl.key, message: `Decide "${fl.label}": it has no default and no value here.` });

  const active = input.rules.filter((r) => r.enabled);
  for (const r of input.rules) {
    const own: Issue[] = [];
    checkRule(r, byKey, own);
    // a switched-off rule is not compiled, so its problems only warn
    issues.push(...(r.enabled ? own : own.map((i) => ({ ...i, severity: 'warning' as const }))));
  }
  checkConflicts(active, byKey, issues);
  for (const r of input.rules)
    if (!r.enabled) issues.push({ severity: 'warning', section: 'rules', ref: r.id, message: `"${r.name?.trim() || describeRule(r, byKey)}" is switched off and will not be in the contract.` });

  checkTitle(input.titleTemplate, byKey, issues);

  const ok = !issues.some((i) => i.severity === 'error');
  if (!ok) return { ok, contract: null, issues };

  const flags = Object.fromEntries(input.flags.map((f) => [f.key, f.value]));
  const groups = [...new Set(fields.map((f) => f.group))];
  const rules: ContractRule[] = active.map((r) => {
    const out: ContractRule = { id: r.id, kind: r.kind, when: r.when, text: describeRule(r, byKey) };
    if (r.name?.trim()) out.name = r.name.trim();
    if (r.target) out.target = r.target;
    if (r.values?.length) out.values = r.values;
    if (r.min != null) out.min = r.min;
    if (r.max != null) out.max = r.max;
    if (r.priceMin != null) out.priceMin = r.priceMin;
    if (r.priceMax != null) out.priceMax = r.priceMax;
    if (r.message?.trim()) out.message = r.message.trim();
    return out;
  });
  const filters: FilterDef[] = fields
    .filter((f) => f.filterable)
    .map((f) => {
      if (f.kind === 'boolean') return { key: f.key, label: f.label, kind: 'boolean' as const };
      if (f.kind === 'number' || f.kind === 'range') {
        const fd: FilterDef = { key: f.key, label: f.label, kind: 'range' };
        if (f.unit) fd.unit = f.unit.symbol;
        const b = bucketsFor(f);
        if (b) fd.buckets = b;
        return fd;
      }
      return { key: f.key, label: f.label, kind: 'options' as const, options: optionValues(f.options) };
    });
  // fields sorted by group (first appearance) then importance, so the form leads with what matters
  fields.sort((a, b) => groups.indexOf(a.group) - groups.indexOf(b.group) || IMPORTANCE_ORDER.indexOf(a.importance) - IMPORTANCE_ORDER.indexOf(b.importance) || a.order - b.order);
  fields.forEach((f, i) => (f.order = i));

  const contract: Contract = {
    schemaVersion: 1,
    category: input.category,
    version: input.version,
    fields,
    groups,
    rules,
    titleTemplate: input.titleTemplate.trim() || '{brand} {model} {key_specs}',
    titleMaxLength: input.titleMaxLength ?? 120,
    filters,
    variantOptions: variants.map((f) => f.key),
    offer: offerTerms(flags),
    flags,
    productSchema: {},
    offerSchema: {},
  };
  contract.productSchema = buildProductSchema(contract);
  contract.offerSchema = buildOfferSchema(contract);
  return { ok, contract, issues };
}

/** Fields for a set of specs even when the version does not compile yet (rule sentences, editors). */
export function fieldsFor(specs: SpecInput[]): Map<string, FieldDef> {
  const scratch: Issue[] = [];
  return new Map(specs.map((s, i) => [s.key, toField(s, i, scratch)]));
}

/** Stable JSON (sorted keys), the input to the contract hash. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value as object)
      .sort()
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
