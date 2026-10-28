/**
 * The Shopify Standard Product Taxonomy bundle shipped in this package (data/shopify, MIT licence).
 * One file per vertical so a load request stays small; regenerate with scripts/build-shopify.mjs.
 */
import index from '../data/shopify/index.json';

export interface ShopifyVertical {
  version: string;
  prefix: string;
  name: string;
  /** [id, parentId, name, attributeHandles] */
  categories: [string, string | null, string, string[]][];
  /** handle → [name, description, baseHandle, values] */
  attributes: Record<string, [string, string, string | null, string[]]>;
}

export const SHOPIFY_BUNDLE = index as {
  source: 'shopify';
  version: string;
  upstream: string;
  verticals: { prefix: string; name: string; categories: number; attributes: number }[];
};

const LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  ap: () => import('../data/shopify/ap.json'),
  aa: () => import('../data/shopify/aa.json'),
  ae: () => import('../data/shopify/ae.json'),
  bt: () => import('../data/shopify/bt.json'),
  bu: () => import('../data/shopify/bu.json'),
  bi: () => import('../data/shopify/bi.json'),
  co: () => import('../data/shopify/co.json'),
  el: () => import('../data/shopify/el.json'),
  fb: () => import('../data/shopify/fb.json'),
  fr: () => import('../data/shopify/fr.json'),
  gc: () => import('../data/shopify/gc.json'),
  ha: () => import('../data/shopify/ha.json'),
  hb: () => import('../data/shopify/hb.json'),
  hg: () => import('../data/shopify/hg.json'),
  lb: () => import('../data/shopify/lb.json'),
  ma: () => import('../data/shopify/ma.json'),
  me: () => import('../data/shopify/me.json'),
  os: () => import('../data/shopify/os.json'),
  pa: () => import('../data/shopify/pa.json'),
  rc: () => import('../data/shopify/rc.json'),
  se: () => import('../data/shopify/se.json'),
  so: () => import('../data/shopify/so.json'),
  sg: () => import('../data/shopify/sg.json'),
  tg: () => import('../data/shopify/tg.json'),
  na: () => import('../data/shopify/na.json'),
  vp: () => import('../data/shopify/vp.json'),
};

export async function loadShopifyVertical(prefix: string): Promise<ShopifyVertical | null> {
  const load = LOADERS[prefix];
  if (!load) return null;
  return (await load()).default as ShopifyVertical;
}
