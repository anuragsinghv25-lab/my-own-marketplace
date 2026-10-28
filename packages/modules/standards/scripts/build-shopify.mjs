#!/usr/bin/env node
/**
 * Builds the compact Shopify Standard Product Taxonomy bundle shipped with Orbita.
 *
 * Source: https://github.com/Shopify/product-taxonomy (MIT licence, see data/shopify/LICENSE).
 * Usage:  node scripts/build-shopify.mjs <dir containing categories.json and attributes.json> [release, e.g. 2026-10]
 * Download both files from https://raw.githubusercontent.com/Shopify/product-taxonomy/v<release>/dist/en/
 *
 * Output: data/shopify/index.json and one file per vertical (data/shopify/<prefix>.json):
 *   categories: [id, parentId | null, name, attributeHandles[]]
 *   attributes: { handle: [name, description, baseHandle | null, values[]] }
 * Extended attributes (e.g. "Lens color") point at their base attribute ("color") and share its values.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = process.argv[2];
if (!src) {
  console.error('Usage: node scripts/build-shopify.mjs <source dir>');
  process.exit(1);
}
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'shopify');
mkdirSync(out, { recursive: true });

const strip = (gid) => (gid ? gid.replace('gid://shopify/TaxonomyCategory/', '') : null);
const cats = JSON.parse(readFileSync(join(src, 'categories.json'), 'utf8'));
const attrs = JSON.parse(readFileSync(join(src, 'attributes.json'), 'utf8'));

const base = new Map();
const extendedOf = new Map();
for (const a of attrs.attributes) {
  base.set(a.handle, a);
  for (const e of a.extended_attributes ?? []) extendedOf.set(e.handle, { ...e, base: a.handle });
}
const version = process.argv[3] ?? cats.version.replace(/-unstable$/, '');
const index = { source: 'shopify', version, upstream: process.argv[3] ? `v${process.argv[3]}` : cats.version, verticals: [] };

for (const v of cats.verticals) {
  const used = new Set();
  const categories = v.categories.map((c) => {
    const handles = c.attributes.map((a) => a.handle);
    handles.forEach((h) => used.add(h));
    return [strip(c.id), strip(c.parent_id), c.name, handles];
  });
  const attributes = {};
  const put = (h) => {
    if (attributes[h]) return;
    const b = base.get(h);
    if (b) {
      attributes[h] = [b.name, b.description ?? '', null, b.values.map((x) => x.name)];
      return;
    }
    const e = extendedOf.get(h);
    if (!e) throw new Error(`Unknown attribute ${h}`);
    put(e.base);
    attributes[h] = [e.name, base.get(e.base).description ?? '', e.base, []];
  };
  [...used].sort().forEach(put);
  writeFileSync(join(out, `${v.prefix}.json`), JSON.stringify({ version, prefix: v.prefix, name: v.name, categories, attributes }));
  index.verticals.push({ prefix: v.prefix, name: v.name, categories: categories.length, attributes: Object.keys(attributes).length });
}
writeFileSync(join(out, 'index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`Shopify ${version}: ${index.verticals.length} verticals, ${index.verticals.reduce((s, x) => s + x.categories, 0)} categories`);
