import type { Condition, Contract, FieldDef } from './types';
import { optionValues } from './logic';

type Schema = Record<string, unknown>;

function fieldSchema(f: FieldDef): Schema {
  const s: Schema = { title: f.label };
  if (f.sellerHint) s.description = f.sellerHint;
  switch (f.kind) {
    case 'boolean':
      return { ...s, type: 'boolean' };
    case 'select':
      return { ...s, type: 'string', enum: optionValues(f.options) };
    case 'multiselect':
      return { ...s, type: 'array', items: { type: 'string', enum: optionValues(f.options) }, minItems: 1, uniqueItems: true };
    case 'number': {
      const n: Schema = { ...s, type: 'number' };
      if (f.min != null) n.minimum = f.min;
      if (f.max != null) n.maximum = f.max;
      if (f.step != null) n.multipleOf = f.step;
      if (f.decimals != null) n['x-decimals'] = f.decimals;
      if (f.unit) n['x-unit'] = f.unit.code;
      return n;
    }
    case 'range': {
      const bound: Schema = { type: 'number' };
      if (f.min != null) bound.minimum = f.min;
      if (f.max != null) bound.maximum = f.max;
      const r: Schema = { ...s, type: 'object', properties: { min: bound, max: bound }, required: ['min', 'max'], additionalProperties: false };
      if (f.unit) r['x-unit'] = f.unit.code;
      return r;
    }
    case 'text': {
      const t: Schema = { ...s, type: 'string', minLength: 1 };
      if (f.maxLength != null) t.maxLength = f.maxLength;
      if (f.pattern) t.pattern = f.pattern;
      return t;
    }
    case 'keyvalue':
      return {
        ...s,
        type: 'array',
        items: { type: 'object', properties: { key: { type: 'string', minLength: 1 }, value: { type: 'string', minLength: 1 } }, required: ['key', 'value'] },
        minItems: 1,
      };
  }
}

/** A condition as JSON Schema, or null when it cannot be expressed exactly. */
function conditionSchema(c: Condition, f: FieldDef): Schema | null {
  switch (c.op) {
    case 'in':
      return f.kind === 'multiselect' ? { contains: { enum: c.values } } : { enum: c.values };
    case 'not_in':
      return f.kind === 'multiselect' ? { not: { contains: { enum: c.values } } } : { not: { enum: c.values } };
    case 'gte':
      return { type: 'number', minimum: c.value };
    case 'lte':
      return { type: 'number', maximum: c.value };
    case 'between':
      return { type: 'number', minimum: c.value, maximum: c.value2 };
    case 'is_true':
      return { const: true };
    case 'is_false':
      return { const: false };
    case 'filled':
      return {};
  }
}

/**
 * Product facts as JSON Schema (draft-07). Rules become if/then clauses, so a consumer in any
 * language gets the same answer as `evaluate` for the rules JSON Schema can express. Hide rules
 * become "must not be present". The `x-orbita-rules` extension carries every rule as data.
 */
export function buildProductSchema(c: Contract): Schema {
  const byKey = new Map(c.fields.map((f) => [f.key, f]));
  const properties: Schema = {};
  for (const f of c.fields) properties[f.key] = fieldSchema(f);
  const allOf: Schema[] = [];
  const hideIfs = new Map<string, Schema[]>();
  for (const r of c.rules) {
    if (r.kind === 'price' || !r.target) continue;
    const t = byKey.get(r.target)!;
    const ifProps: Schema = {};
    const ifReq: string[] = [];
    let exact = true;
    for (const cond of r.when) {
      const s = conditionSchema(cond, byKey.get(cond.key)!);
      if (!s) exact = false;
      else {
        ifProps[cond.key] = s;
        ifReq.push(cond.key);
      }
    }
    if (!exact) continue;
    const ifClause: Schema = r.when.length ? { properties: ifProps, required: ifReq } : {};
    if (r.kind === 'hide') hideIfs.set(r.target, [...(hideIfs.get(r.target) ?? []), ifClause]);
    let then: Schema;
    if (r.kind === 'require') then = { required: [r.target] };
    else if (r.kind === 'hide') then = { not: { required: [r.target] } };
    else if (t.kind === 'select') then = { properties: { [r.target]: { enum: r.values } } };
    else if (t.kind === 'multiselect') then = { properties: { [r.target]: { items: { enum: r.values } } } };
    else {
      const b: Schema = {};
      if (r.min != null) b.minimum = r.min;
      if (r.max != null) b.maximum = r.max;
      then = t.kind === 'range' ? { properties: { [r.target]: { properties: { min: b, max: b } } } } : { properties: { [r.target]: b } };
    }
    allOf.push(r.when.length ? { if: ifClause, then } : then);
  }
  // a required field that a rule can hide is required only when no hide rule applies
  const hidable = new Set(hideIfs.keys());
  for (const [key, ifs] of hideIfs) if (byKey.get(key)!.required) allOf.push({ if: { anyOf: ifs }, then: {}, else: { required: [key] } });
  const schema: Schema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: `orbita:contract:${c.category.code}:v${c.version.number}:product`,
    title: `${c.category.name} (v${c.version.number})`,
    type: 'object',
    properties,
    required: c.fields.filter((f) => f.required && !hidable.has(f.key)).map((f) => f.key),
    additionalProperties: false,
    'x-orbita-rules': c.rules,
  };
  if (allOf.length) schema.allOf = allOf;
  return schema;
}

/** Offer price as JSON Schema; band from price rules is conditional on product facts, so it is carried as data. */
export function buildOfferSchema(c: Contract): Schema {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: `orbita:contract:${c.category.code}:v${c.version.number}:offer`,
    type: 'object',
    properties: {
      sellingUnit: { type: 'string', enum: c.offer.sellingUnits },
      price: { type: 'number', exclusiveMinimum: 0 },
      mrp: { type: 'number', exclusiveMinimum: 0 },
    },
    required: c.offer.priceLabel === 'offer_price_with_mrp' ? ['sellingUnit', 'price', 'mrp'] : ['sellingUnit', 'price'],
    additionalProperties: false,
    'x-orbita-discount-band': c.offer.discountBand,
    'x-orbita-price-rules': c.rules.filter((r) => r.kind === 'price'),
  };
}
