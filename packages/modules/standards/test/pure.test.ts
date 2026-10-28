import { describe, expect, it } from 'vitest';
import { SHOPIFY_BUNDLE, loadShopifyVertical, parseCsv, parseUnspscRows, unspscLevel, unspscParent } from '../src';

describe('UNSPSC helpers', () => {
  it('derives level and parent from the code', () => {
    expect(['43000000', '43210000', '43211500', '43211503'].map(unspscLevel)).toEqual([1, 2, 3, 4]);
    expect(['43000000', '43210000', '43211500', '43211503'].map(unspscParent)).toEqual([null, '43000000', '43210000', '43211500']);
  });

  it('reads quoted CSV, tab-separated files and one-code-per-row layouts', () => {
    expect(parseCsv('a,"b, ""c"""\r\n1,2')).toEqual([['a', 'b, "c"'], ['1', '2']]);
    expect(parseCsv('Code\tTitle\n43211503\tNotebook computers, rugged')).toEqual([['Code', 'Title'], ['43211503', 'Notebook computers, rugged']]);
    const { entries } = parseUnspscRows([
      ['Key', 'Code', 'Title'],
      [101, 43211503, 'Notebook computers'],
      [102, '43211500.0', 'Computers'],
      [103, '43211503', 'Duplicate keeps the first title'],
    ]);
    expect(entries).toEqual([
      { code: '43211500', title: 'Computers' },
      { code: '43211503', title: 'Notebook computers' },
    ]);
  });
});

describe('Shopify bundle', () => {
  it('ships every vertical with consistent ids, parents and attributes', async () => {
    expect(SHOPIFY_BUNDLE.verticals).toHaveLength(26);
    let total = 0;
    for (const v of SHOPIFY_BUNDLE.verticals) {
      const data = (await loadShopifyVertical(v.prefix))!;
      expect(data.version).toBe(SHOPIFY_BUNDLE.version);
      expect(data.categories).toHaveLength(v.categories);
      const ids = new Set(data.categories.map((c) => c[0]));
      for (const [id, parent, , handles] of data.categories) {
        expect(id.split('-')[0]).toBe(v.prefix);
        if (parent) expect(ids.has(parent)).toBe(true);
        for (const h of handles) expect(data.attributes[h]).toBeTruthy();
      }
      for (const [, [, , base]] of Object.entries(data.attributes)) if (base) expect(data.attributes[base]).toBeTruthy();
      total += v.categories;
    }
    expect(total).toBeGreaterThan(10_000);
    expect(await loadShopifyVertical('nope')).toBeNull();
  });
});
