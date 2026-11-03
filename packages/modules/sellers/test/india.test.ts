import { describe, expect, it } from 'vitest';
import { GST_STATES, gstinCheckChar, gstinProblem, normalizePhone, panOf, PAN_RE } from '../src/india';

describe('India seller identity', () => {
  it('validates GSTINs, including the check character and state code', () => {
    expect(gstinProblem(' 27aapfu0939f1zv ')).toBeNull();
    expect(gstinProblem('27AAPFU0939F1ZW')).toMatch(/check character/);
    expect(gstinProblem('28AAPFU0939F1ZV')).toMatch(/not a GST state code/);
    expect(gstinProblem('27AAPFU0939F0ZV')).toMatch(/does not look like a GSTIN/);
    const base = '29AABCN5678F1Z';
    expect(gstinProblem(base + gstinCheckChar(base))).toBeNull();
  });

  it('takes the PAN from the GSTIN', () => {
    expect(panOf('27AAPFU0939F1ZV')).toBe('AAPFU0939F');
    expect(PAN_RE.test('AAPFU0939F')).toBe(true);
    expect(GST_STATES['07']).toBe('Delhi');
  });

  it('normalises Indian phone numbers', () => {
    expect(normalizePhone('98450 12345')).toBe('+919845012345');
    expect(normalizePhone('+91-98450-12345')).toBe('+919845012345');
    expect(normalizePhone('09845012345')).toBe('+919845012345');
    expect(normalizePhone('12345')).toBeNull();
  });
});
