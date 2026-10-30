import { describe, expect, it } from 'vitest';
import Ajv from 'ajv';
import { canonicalJson, compile, describeRule, evaluate, sanitize, type Contract, type RuleInput } from '../src';
import { input, rules, specs } from './fixture';

const ok = () => {
  const r = compile(input());
  if (!r.contract) throw new Error(JSON.stringify(r.issues));
  return r.contract;
};
const errorsOf = (over: Parameters<typeof input>[0]) => compile(input(over)).issues.filter((i) => i.severity === 'error').map((i) => i.message);

describe('compile', () => {
  it('compiles the gaming laptops version into a contract', () => {
    const r = compile(input());
    expect(r.issues.filter((i) => i.severity === 'error')).toEqual([]);
    const c = r.contract!;
    expect(c.groups).toEqual(['Performance', 'Display', 'Design']);
    // grouped, then by importance: key specs lead
    expect(c.fields.slice(0, 4).map((f) => f.key)).toEqual(['processor', 'ram_gb', 'gpu', 'dgpu_mux']);
    expect(c.fields.find((f) => f.key === 'color')!.options!.map((o) => o.value)).toEqual(['Black', 'Grey', 'White']);
    expect(c.fields.find((f) => f.key === 'ram_gb')).toMatchObject({ kind: 'number', min: 4, max: 128, step: 4, required: true });
    expect(c.variantOptions).toEqual(['ram_gb']);
    expect(c.filters.map((f) => f.key)).toEqual(['processor', 'gpu', 'ram_gb', 'refresh_rate', 'color']);
    expect(c.filters.find((f) => f.key === 'ram_gb')!.buckets!.length).toBeGreaterThanOrEqual(3);
    expect(c.offer).toMatchObject({ discountBand: { min: 5, max: 40 }, priceLabel: 'offer_price_with_mrp', sellingUnits: ['piece'] });
    expect(c.rules.find((x) => x.id === 'r-amd-gpu')!.text).toBe(
      'When Processor is AMD Ryzen 7 or AMD Ryzen 9, Graphics card can only be NVIDIA RTX 4060, NVIDIA RTX 4070 or AMD Radeon RX 7600M.',
    );
    expect(c.rules.find((x) => x.id === 'r-ram-min')!.text).toBe('RAM must be at least 8 GB.');
    expect(c.rules.find((x) => x.id === 'r-price-r9')!.text).toBe('When Processor is AMD Ryzen 9, the offer price must be between ₹80,000 and ₹4,00,000 per unit.');
  });

  it('is deterministic, so the hash input is stable', () => {
    expect(canonicalJson(ok())).toBe(canonicalJson(ok()));
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
  });

  it('reports configuration mistakes with their place', () => {
    expect(compile(input({ specs: [] })).issues[0]).toMatchObject({ severity: 'error', section: 'specs' });
    expect(errorsOf({ specs: [...specs, specs[0]!] })).toContain('Processor is added twice.');
    expect(errorsOf({ specs: specs.map((s) => (s.key === 'color' ? { ...s, allowedValues: ['Purple'] } : s)) })[0]).toMatch(/Purple is not in the value list/);
    expect(errorsOf({ specs: specs.map((s) => (s.key === 'ram_gb' ? { ...s, min: 0 } : s)) })[0]).toMatch(/below the library's 1/);
    expect(errorsOf({ titleTemplate: '{brand} {weight}' })[0]).toMatch(/\{weight\}/);
    expect(errorsOf({ flags: [{ key: 'buying_modes', label: 'Buying modes', valueType: 'multi_select', value: null, source: 'none' }] })[0]).toMatch(/Decide "Buying modes"/);
    expect(errorsOf({ specs: specs.map((s) => ({ ...s, variantOption: ['processor', 'gpu', 'ram_gb', 'battery_hours'].includes(s.key) })) })).toContain('At most 3 variant options (now 4).');
  });

  it('checks every rule against the specs it names', () => {
    const bad = (r: Partial<RuleInput>) => errorsOf({ rules: [{ id: 'x', kind: 'restrict', enabled: true, when: [], ...r } as RuleInput] });
    expect(bad({ target: 'weight', values: ['a'] })[0]).toMatch(/not a specification/);
    expect(bad({ target: 'gpu', values: ['Voodoo 2'] })[0]).toMatch(/Voodoo 2 is not an allowed value/);
    expect(bad({ when: [{ key: 'gpu', op: 'gte', value: 3 }], target: 'ram_gb', min: 8 })[0]).toMatch(/"gte" cannot be used on Graphics card/);
    expect(bad({ when: [{ key: 'ram_gb', op: 'gte', value: 16 }], target: 'ram_gb', min: 16 })[0]).toMatch(/cannot depend on RAM/);
    expect(bad({ kind: 'hide', target: 'processor' })[0]).toMatch(/key spec and can never be hidden/);
    expect(bad({ target: 'rgb_keyboard' })[0]).toMatch(/cannot be restricted/);
    expect(bad({ when: [{ key: 'ram_gb', op: 'between', value: 32, value2: 16 }], target: 'gpu', values: ['NVIDIA RTX 4060'] })[0]).toMatch(/range for RAM is empty/);
    expect(bad({ when: [{ key: 'ram_gb', op: 'gte', value: 200 }], target: 'gpu', values: ['NVIDIA RTX 4060'] })[0]).toMatch(/can never all be true/);
    expect(bad({ kind: 'price', priceMin: 10, priceMax: 5 })[0]).toMatch(/minimum price is above the maximum/);
  });

  it('finds rules that contradict each other only when they can apply together', () => {
    const r = (id: string, over: Partial<RuleInput>): RuleInput => ({ id, kind: 'restrict', enabled: true, when: [], target: 'gpu', ...over });
    // same processor, disjoint graphics lists → conflict
    expect(
      errorsOf({
        rules: [
          r('a', { when: [{ key: 'processor', op: 'in', values: ['Intel Core i7'] }], values: ['NVIDIA RTX 4060'] }),
          r('b', { when: [{ key: 'processor', op: 'in', values: ['Intel Core i7', 'AMD Ryzen 7'] }], values: ['Intel Arc A370M'] }),
        ],
      })[0],
    ).toMatch(/leave no allowed value/);
    // different processors can never be chosen together → no conflict
    expect(
      errorsOf({
        rules: [
          r('a', { when: [{ key: 'processor', op: 'in', values: ['Intel Core i5'] }], values: ['NVIDIA RTX 4060'] }),
          r('b', { when: [{ key: 'processor', op: 'in', values: ['Intel Core i7'] }], values: ['Intel Arc A370M'] }),
        ],
      }),
    ).toEqual([]);
    expect(
      errorsOf({
        rules: [
          r('a', { kind: 'require', target: 'battery_hours', when: [{ key: 'gpu', op: 'in', values: ['NVIDIA RTX 4060'] }] }),
          r('b', { kind: 'hide', target: 'battery_hours', when: [{ key: 'rgb_keyboard', op: 'is_true' }] }),
        ],
      })[0],
    ).toMatch(/one requires what the other hides/);
    expect(
      errorsOf({
        rules: [
          r('a', { target: 'ram_gb', min: 64, when: [{ key: 'processor', op: 'in', values: ['AMD Ryzen 9'] }] }),
          r('b', { target: 'ram_gb', max: 32, when: [{ key: 'gpu', op: 'in', values: ['NVIDIA RTX 4070'] }] }),
        ],
      })[0],
    ).toMatch(/no allowed number/);
    expect(
      errorsOf({
        rules: [
          r('a', { kind: 'price', priceMin: 90000, when: [] }),
          r('b', { kind: 'price', priceMax: 50000, when: [{ key: 'processor', op: 'in', values: ['Intel Core i5'] }] }),
        ],
      })[0],
    ).toMatch(/no valid price/);
  });

  it('a switched-off rule only warns and is left out of the contract', () => {
    const res = compile(input({ rules: [...rules, { id: 'off', kind: 'restrict', enabled: false, when: [], target: 'weight', values: ['x'] }] }));
    expect(res.ok).toBe(true);
    expect(res.issues.filter((i) => i.ref === 'off').every((i) => i.severity === 'warning')).toBe(true);
    expect(res.contract!.rules.some((x) => x.id === 'off')).toBe(false);
  });
});

describe('evaluate', () => {
  const c = ok();
  const good = { processor: 'AMD Ryzen 7', gpu: 'NVIDIA RTX 4060', ram_gb: 16, battery_hours: 6, dgpu_mux: true };

  it('accepts a complete product and renders its title', () => {
    const e = evaluate(c, { values: good, brand: 'Orbis', model: 'G15', price: 74990, mrp: 89990 });
    expect(e.errors).toEqual([]);
    expect(e.title).toBe('Orbis G15 AMD Ryzen 7 16 GB (NVIDIA RTX 4060)');
    expect(e.priceBand).toMatchObject({ min: 53994, max: 85490.5 });
    expect(e.quality).toBeGreaterThan(70);
  });

  it('applies restrictions, requirements and hiding from the values chosen', () => {
    const e = evaluate(c, { values: { ...good, gpu: 'Intel Arc A370M' } });
    expect(e.fields.gpu!.options!.map((o) => o.value)).not.toContain('Intel Arc A370M');
    expect(e.errors[0]).toMatchObject({ key: 'gpu', ruleId: 'r-amd-gpu' });

    const small = evaluate(c, { values: { ...good, ram_gb: 4 } });
    expect(small.errors.map((x) => x.message)).toContain('RAM: must be at least 8 GB. Gaming laptops need at least 8 GB.');

    const need = evaluate(c, { values: { ...good, gpu: 'NVIDIA RTX 4070' } });
    expect(need.fields.refresh_rate!.required).toBe(true);
    expect(need.errors.map((x) => x.message)).toContain('Refresh rate is required (When Graphics card is NVIDIA RTX 4070, Refresh rate is required).');

    const rgb = evaluate(c, { values: { ...good, rgb_keyboard: true, battery_hours: undefined } });
    expect(rgb.fields.battery_hours).toMatchObject({ visible: false, required: false });
    expect(rgb.errors).toEqual([]);
    expect(evaluate(c, { values: { ...good, rgb_keyboard: true } }).errors[0]!.message).toMatch(/does not apply here/);
  });

  it('checks steps, unknown fields and the price band', () => {
    expect(evaluate(c, { values: { ...good, ram_gb: 18 } }).errors[0]!.message).toBe('RAM: must be in steps of 4.');
    expect(evaluate(c, { values: { ...good, weight: 2 } }).errors[0]!.message).toMatch(/not a specification/);
    const r9 = { ...good, processor: 'AMD Ryzen 9' };
    expect(evaluate(c, { values: r9, price: 60000, mrp: 100000 }).errors[0]!.message).toBe('The price must be between ₹80,000 and ₹95,000.');
    expect(evaluate(c, { values: good, price: 1000 }).errors[0]!.message).toMatch(/Give the MRP/);
    expect(evaluate(c, { values: good, price: 120, mrp: 100 }).errors.map((x) => x.message)).toContain('The price cannot be above the MRP.');
  });

  it('describes rules in plain language', () => {
    const byKey = new Map(c.fields.map((f) => [f.key, f]));
    expect(describeRule(rules.find((r) => r.id === 'r-mux')!, byKey)).toBe(
      'When Graphics card is NVIDIA RTX 4060 or NVIDIA RTX 4070 and RAM is at least 16 GB, MUX switch is required.',
    );
    expect(describeRule(rules.find((r) => r.id === 'r-rgb-hides-battery')!, byKey)).toBe('When RGB keyboard is Yes, Battery life does not apply and is hidden.');
  });
});

describe('the JSON Schema says the same as evaluate', () => {
  // deterministic pseudo-random products
  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const pick = <T>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const maybe = <T>(v: T) => (rnd() < 0.8 ? v : undefined);

  function randomProduct(c: Contract) {
    const values: Record<string, unknown> = {};
    for (const f of c.fields) {
      let v: unknown;
      if (f.kind === 'select') v = pick([...f.options!.map((o) => o.value), 'Unknown']);
      else if (f.kind === 'multiselect') v = [pick(f.options!.map((o) => o.value)), ...(rnd() < 0.3 ? ['Red'] : [])];
      else if (f.kind === 'number') v = pick([0, 4, 8, 12, 16, 18, 32, 64, 144, 165, 256]);
      else if (f.kind === 'boolean') v = rnd() < 0.5;
      values[f.key] = maybe(v);
    }
    return sanitize(values);
  }

  it('agrees on 2,000 random products', () => {
    const c = ok();
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(c.productSchema);
    let valid = 0;
    for (let i = 0; i < 2000; i++) {
      const values = randomProduct(c);
      const fromEval = evaluate(c, { values }).errors.length === 0;
      const fromSchema = validate(values) as boolean;
      if (fromEval !== fromSchema) throw new Error(`disagree on ${JSON.stringify(values)}: evaluate=${fromEval} schema=${fromSchema} ${JSON.stringify(validate.errors)} ${JSON.stringify(evaluate(c, { values }).errors)}`);
      if (fromEval) valid++;
    }
    // the generator must exercise both outcomes
    expect(valid).toBeGreaterThan(20);
    expect(valid).toBeLessThan(1980);
  });
});
