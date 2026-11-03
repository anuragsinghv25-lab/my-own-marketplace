/**
 * India-only seller identity (decided 2026-11-03; country-neutral later).
 * GSTIN: 2-digit state code + 10-character PAN + entity number + "Z" + check character.
 */

/** GST state and union territory codes. */
export const GST_STATES: Record<string, string> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
};

/** Zones used for reseller authorisations. */
export const ZONES = ['North', 'South', 'East', 'West', 'Central', 'North-East'] as const;
export type Zone = (typeof ZONES)[number];

const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** The GSTIN check character (base-36 Luhn mod N over the first 14 characters). */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = CHARS.indexOf(first14[i]!);
    const p = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36]!;
}

export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const normalizeGstin = (s: string) => s.replace(/\s+/g, '').toUpperCase();

/** Why a GSTIN is not valid, in words, or null when it is. */
export function gstinProblem(raw: string): string | null {
  const g = normalizeGstin(raw);
  if (g.length !== 15) return 'A GSTIN has 15 characters.';
  if (!GSTIN_RE.test(g)) return 'That does not look like a GSTIN (for example 27AAPFU0939F1ZV).';
  if (!GST_STATES[g.slice(0, 2)]) return `${g.slice(0, 2)} is not a GST state code.`;
  if (gstinCheckChar(g.slice(0, 14)) !== g[14]) return 'The GSTIN check character does not match. Check for a typo.';
  return null;
}

/** The PAN inside a GSTIN. */
export const panOf = (gstin: string) => normalizeGstin(gstin).slice(2, 12);

/** PAN holder type from its fourth character. */
export const PAN_HOLDER: Record<string, string> = { P: 'Individual', C: 'Company', F: 'Firm or LLP', H: 'HUF', A: 'Association of persons', T: 'Trust', B: 'Body of individuals', L: 'Local authority', J: 'Artificial juridical person', G: 'Government' };

export const PINCODE_RE = /^[1-9][0-9]{5}$/;
/** Indian mobile or landline, stored as +91XXXXXXXXXX. */
export function normalizePhone(raw: string): string | null {
  const d = raw.replace(/[^0-9]/g, '').replace(/^(91|0)(?=[0-9]{10}$)/, '');
  return /^[6-9][0-9]{9}$/.test(d) || /^[1-5][0-9]{9}$/.test(d) ? `+91${d}` : null;
}
