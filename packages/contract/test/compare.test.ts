import { describe, expect, it } from 'vitest';
import { compareContracts, compile, type CompileInput } from '../src';
import { input, rules, specs } from './fixture';

const contract = (over: Partial<CompileInput> = {}) => {
  const r = compile(input(over));
  if (!r.contract) throw new Error(JSON.stringify(r.issues));
  return r.contract;
};

describe('compareContracts', () => {
  it('finds nothing between identical contracts', () => {
    expect(compareContracts(contract(), contract())).toEqual([]);
  });

  it('treats everything as added when there is no earlier version', () => {
    const changes = compareContracts(null, contract());
    expect(changes.filter((c) => c.area === 'spec').every((c) => c.kind === 'added')).toBe(true);
    expect(changes.filter((c) => c.area === 'spec')).toHaveLength(specs.length);
    expect(changes.some((c) => c.area === 'title' && c.kind === 'added')).toBe(true);
    expect(changes.some((c) => c.area === 'flag')).toBe(false);
  });

  it('colours each kind of change', () => {
    const after = contract({
      specs: [
        ...specs
          .filter((s) => s.key !== 'dgpu_mux')
          .map((s) => (s.key === 'ram_gb' ? { ...s, max: 64 } : s.key === 'refresh_rate' ? { ...s, importance: 'required' as const } : s)),
        { key: 'weight_kg', label: 'Weight', attributeType: 'numeric', group: 'Design', importance: 'optional', filterable: false, comparable: true, variantOption: false, preference: 'lower' },
      ],
      rules: rules.filter((r) => r.id !== 'r-mux').map((r) => (r.id === 'r-ram-min' ? { ...r, min: 16 } : r)),
      titleTemplate: '{brand} {model} {ram_gb}',
    });
    const changes = compareContracts(contract(), after);
    const find = (area: string, key: string, kind: string) => changes.find((c) => c.area === area && c.key === key && c.kind === kind);
    expect(find('spec', 'weight_kg', 'added')).toBeTruthy();
    expect(find('spec', 'dgpu_mux', 'removed')).toBeTruthy();
    expect(find('spec', 'ram_gb', 'modified')!.details).toContain('Maximum: 128 → 64');
    expect(find('spec', 'refresh_rate', 'state')!.details).toEqual(['Importance: Recommended → Required']);
    expect(changes.find((c) => c.area === 'rule' && c.kind === 'modified')!.details[1]).toBe('Now: RAM must be at least 16 GB.');
    // the MUX rule went with its spec
    expect(changes.some((c) => c.area === 'rule' && c.kind === 'removed')).toBe(true);
    expect(changes.find((c) => c.area === 'title')!.kind).toBe('modified');
  });

  it('reports offer term and flag changes', () => {
    const before = contract();
    const after = contract({ flags: input().flags.map((f) => (f.key === 'discount_band' ? { ...f, value: { min: 5, max: 30 } } : f)) });
    const changes = compareContracts(before, after);
    expect(changes.find((c) => c.area === 'offer' && c.key === 'discountBand')!.details).toEqual(['5% to 40% → 5% to 30%']);
    expect(changes.find((c) => c.area === 'flag' && c.key === 'discount_band')).toMatchObject({ kind: 'modified', label: 'Discount band', details: ['5 to 40 → 5 to 30'] });
  });
});
