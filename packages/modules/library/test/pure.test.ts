import { describe, expect, it } from 'vitest';
import { flagValueProblem, slugify } from '../src';

describe('slugify', () => {
  it('makes stable codes from names', () => {
    expect(slugify('Display size (inch)')).toBe('display_size_inch');
    expect(slugify('  RAM (GB) ')).toBe('ram_gb');
    expect(slugify('4G support')).toBe('n_4g_support');
  });
});

describe('flagValueProblem', () => {
  const def = (valueType: never, schema = {}) => ({ valueType, schema, label: 'Flag' });
  it('checks each value type', () => {
    expect(flagValueProblem(def('boolean' as never), true)).toBeNull();
    expect(flagValueProblem(def('boolean' as never), 'yes')).toMatch(/yes or no/);
    expect(flagValueProblem(def('number' as never, { min: 1, max: 5 }), 3)).toBeNull();
    expect(flagValueProblem(def('number' as never, { min: 1, max: 5 }), 9)).toMatch(/from 1 to 5/);
    expect(flagValueProblem(def('single_select' as never, { options: ['a', 'b'] }), 'b')).toBeNull();
    expect(flagValueProblem(def('multi_select' as never, { options: ['a', 'b'] }), ['a', 'c'])).toMatch(/one or more/);
    expect(flagValueProblem(def('multi_select' as never, { options: ['a'] }), [])).toMatch(/one or more/);
    expect(flagValueProblem(def('range' as never, { min: 0, max: 100 }), { min: 5, max: 40 })).toBeNull();
    expect(flagValueProblem(def('range' as never, { min: 0, max: 100 }), { min: 50, max: 40 })).toMatch(/range/);
    expect(flagValueProblem(def('text' as never), ' ')).toMatch(/needs text/);
  });
});
