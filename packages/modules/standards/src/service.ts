import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AppAbility } from '@orbita/authz';
import { recordAudit } from '@orbita/audit';
import {
  categoryNodes,
  referenceAttributes,
  referenceCategories,
  referenceTaxonomies,
  type Database,
  type DbOrTx,
  type StandardSource,
} from '@orbita/db';
import { badRequest, forbidden, notFound, type Actor, type RequestMeta } from '@orbita/domain';
import { SHOPIFY_BUNDLE, loadShopifyVertical } from './shopify';
import { UNSPSC_LEVEL_NAMES, isUnspscCode, unspscLevel, unspscParent } from './unspsc';

export interface Ctx {
  actor: Actor;
  ability: AppAbility;
  meta: RequestMeta;
}
export interface StandardsDeps {
  db: Database;
}

export type ReferenceSource = Exclude<StandardSource, 'custom'>;
export const REFERENCE_SOURCES: ReferenceSource[] = ['shopify', 'unspsc'];
export const SOURCE_LABELS: Record<StandardSource, string> = {
  custom: 'Custom',
  shopify: 'Shopify',
  unspsc: 'UNSPSC',
};

const canRead = (ability: AppAbility) => {
  if (!ability.can('read', 'StandardTaxonomy')) throw forbidden('You cannot browse the standard taxonomies.');
};
const canLoad = (ability: AppAbility) => {
  if (!ability.can('create', 'StandardTaxonomy')) throw forbidden('Only a platform admin can load standard taxonomies.');
};
const chunks = <T>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

// ---------------------------------------------------------------------------
// Status

export interface StandardStatus {
  source: ReferenceSource;
  label: string;
  version: string | null;
  categoryCount: number;
  attributeCount: number;
  complete: boolean;
  loadedParts: string[];
  updatedAt: Date | null;
  /** Shopify only: the release bundled with this build of Orbita */
  bundledVersion?: string;
  parts?: { prefix: string; name: string; categories: number }[];
}

export async function standardsStatus(db: DbOrTx, ability: AppAbility): Promise<StandardStatus[]> {
  canRead(ability);
  const rows = await db.select().from(referenceTaxonomies);
  return REFERENCE_SOURCES.map((source) => {
    const r = rows.find((x) => x.source === source);
    return {
      source,
      label: SOURCE_LABELS[source],
      version: r?.version ?? null,
      categoryCount: r?.categoryCount ?? 0,
      attributeCount: r?.attributeCount ?? 0,
      complete: r?.complete ?? false,
      loadedParts: r?.loadedParts ?? [],
      updatedAt: r?.updatedAt ?? null,
      ...(source === 'shopify'
        ? {
            bundledVersion: SHOPIFY_BUNDLE.version,
            parts: SHOPIFY_BUNDLE.verticals.map((v) => ({ prefix: v.prefix, name: v.name, categories: v.categories })),
          }
        : {}),
    };
  });
}

/** Starts a fresh load of a source, dropping the previous release's reference rows. Adopted categories are untouched. */
async function resetSource(tx: DbOrTx, ctx: Ctx, source: ReferenceSource, version: string) {
  await tx.delete(referenceCategories).where(eq(referenceCategories.source, source));
  await tx.delete(referenceAttributes).where(eq(referenceAttributes.source, source));
  await tx
    .insert(referenceTaxonomies)
    .values({ source, version, loadedBy: ctx.actor.id })
    .onConflictDoUpdate({
      target: referenceTaxonomies.source,
      set: { version, loadedParts: sql`'{}'::text[]`, categoryCount: 0, attributeCount: 0, complete: false, loadedBy: ctx.actor.id },
    });
}

async function refreshCounts(tx: DbOrTx, source: ReferenceSource) {
  await tx.execute(sql`
    update reference_taxonomies set
      category_count = (select count(*) from reference_categories where source = ${source}),
      attribute_count = (select count(*) from reference_attributes where source = ${source})
    where source = ${source}`);
}

// ---------------------------------------------------------------------------
// Shopify: loaded from the bundle one vertical per call (keeps each request short on serverless)

export async function loadShopifyPart(deps: StandardsDeps, ctx: Ctx, prefix: string) {
  canLoad(ctx.ability);
  const data = await loadShopifyVertical(prefix);
  if (!data) throw notFound('Shopify vertical');
  return deps.db.transaction(async (tx) => {
    const [current] = await tx.select().from(referenceTaxonomies).where(eq(referenceTaxonomies.source, 'shopify'));
    const fresh = !current || current.version !== data.version;
    if (fresh) await resetSource(tx, ctx, 'shopify', data.version);

    await tx.delete(referenceCategories).where(and(eq(referenceCategories.source, 'shopify'), sql`split_part(${referenceCategories.externalId}, '-', 1) = ${prefix}`));
    const names = new Map(data.categories.map(([id, , name]) => [id, name]));
    const parents = new Set(data.categories.map(([, p]) => p).filter(Boolean));
    const pathOf = (id: string): string => {
      const parts: string[] = [];
      for (let cur: string | null = id; cur; cur = cur.includes('-') ? cur.slice(0, cur.lastIndexOf('-')) : null) parts.unshift(names.get(cur) ?? cur);
      return parts.join(' > ');
    };
    for (const batch of chunks(data.categories, 1000))
      await tx.insert(referenceCategories).values(
        batch.map(([id, parentId, name, handles]) => ({
          source: 'shopify' as const,
          externalId: id,
          parentExternalId: parentId,
          level: id.split('-').length,
          name,
          fullPath: pathOf(id),
          attributeHandles: handles,
          isLeaf: !parents.has(id),
        })),
      );
    const attrs = Object.entries(data.attributes);
    for (const batch of chunks(attrs, 500))
      await tx
        .insert(referenceAttributes)
        .values(batch.map(([handle, [name, description, baseHandle, values]]) => ({ source: 'shopify' as const, handle, name, description, baseHandle, values })))
        .onConflictDoNothing();

    const parts = [...new Set([...(fresh ? [] : current!.loadedParts), prefix])];
    const complete = SHOPIFY_BUNDLE.verticals.every((v) => parts.includes(v.prefix));
    await tx.update(referenceTaxonomies).set({ loadedParts: parts, complete, loadedBy: ctx.actor.id }).where(eq(referenceTaxonomies.source, 'shopify'));
    await refreshCounts(tx, 'shopify');
    if (complete || fresh)
      await recordAudit(tx, ctx, {
        action: complete ? 'standards.loaded' : 'standards.load_started',
        subjectType: 'reference_taxonomy',
        subjectId: 'shopify',
        summary: complete
          ? `${ctx.actor.email} loaded the Shopify Standard Product Taxonomy ${data.version} (${SHOPIFY_BUNDLE.verticals.reduce((s, v) => s + v.categories, 0)} categories)`
          : `${ctx.actor.email} started loading the Shopify Standard Product Taxonomy ${data.version}`,
        after: { version: data.version },
      });
    return { prefix, name: data.name, categories: data.categories.length, complete, loadedParts: parts };
  });
}

// ---------------------------------------------------------------------------
// UNSPSC: rows come from a file the admin uploads (parsed in the browser), in chunks

export const unspscChunkInput = z.object({
  version: z.string().trim().min(1, 'Give the UNSPSC version, e.g. v26.0801').max(40),
  first: z.boolean(),
  last: z.boolean(),
  rows: z
    .array(z.object({ code: z.string().refine(isUnspscCode, 'Not an 8-digit UNSPSC code'), title: z.string().trim().min(1).max(300) }))
    .max(5000),
});
export type UnspscChunkInput = z.input<typeof unspscChunkInput>;

export async function importUnspscChunk(deps: StandardsDeps, ctx: Ctx, raw: UnspscChunkInput) {
  canLoad(ctx.ability);
  const v = unspscChunkInput.parse(raw);
  return deps.db.transaction(async (tx) => {
    if (v.first) await resetSource(tx, ctx, 'unspsc', v.version);
    else {
      const [current] = await tx.select().from(referenceTaxonomies).where(eq(referenceTaxonomies.source, 'unspsc'));
      if (!current || current.version !== v.version || current.complete) throw badRequest('Start the UNSPSC import again from the first chunk.');
    }
    if (v.rows.length) {
      await tx
        .insert(referenceCategories)
        .values(
          v.rows.map((r) => ({
            source: 'unspsc' as const,
            externalId: r.code,
            parentExternalId: unspscParent(r.code),
            level: unspscLevel(r.code),
            name: r.title,
            fullPath: r.title,
            isLeaf: unspscLevel(r.code) === 4,
          })),
        )
        .onConflictDoUpdate({ target: [referenceCategories.source, referenceCategories.externalId], set: { name: sql`excluded.name`, fullPath: sql`excluded.full_path` } });
      // parents arrive first (rows are sorted by code), so paths resolve level by level
      const codes = v.rows.map((r) => r.code);
      for (const level of [2, 3, 4])
        await tx.execute(sql`
          update reference_categories c set full_path = p.full_path || ' > ' || c.name
          from reference_categories p
          where c.source = 'unspsc' and p.source = 'unspsc' and p.external_id = c.parent_external_id
            and c.level = ${level} and c.external_id in ${codes}`);
    }
    if (v.last) {
      await tx.execute(sql`
        update reference_categories c set is_leaf = not exists (
          select 1 from reference_categories k where k.source = 'unspsc' and k.parent_external_id = c.external_id)
        where c.source = 'unspsc'`);
      await tx.update(referenceTaxonomies).set({ complete: true, loadedBy: ctx.actor.id }).where(eq(referenceTaxonomies.source, 'unspsc'));
    }
    await refreshCounts(tx, 'unspsc');
    if (v.last) {
      const [r] = await tx.select().from(referenceTaxonomies).where(eq(referenceTaxonomies.source, 'unspsc'));
      await recordAudit(tx, ctx, {
        action: 'standards.loaded',
        subjectType: 'reference_taxonomy',
        subjectId: 'unspsc',
        summary: `${ctx.actor.email} loaded UNSPSC ${v.version} (${r!.categoryCount} codes)`,
        after: { version: v.version, codes: r!.categoryCount },
      });
    }
    return { stored: v.rows.length };
  });
}

// ---------------------------------------------------------------------------
// Browsing and search (used by "Add from standard")

export interface ReferenceRow {
  source: ReferenceSource;
  externalId: string;
  parentExternalId: string | null;
  level: number;
  name: string;
  fullPath: string;
  isLeaf: boolean;
  attributeCount: number;
  childCount: number;
  /** the live category adopted from this one, if any */
  adoptedNodeId: string | null;
}

const rowSelect = {
  source: referenceCategories.source,
  externalId: referenceCategories.externalId,
  parentExternalId: referenceCategories.parentExternalId,
  level: referenceCategories.level,
  name: referenceCategories.name,
  fullPath: referenceCategories.fullPath,
  isLeaf: referenceCategories.isLeaf,
  attributeCount: sql<number>`cardinality(${referenceCategories.attributeHandles})`,
  childCount: sql<number>`(select count(*)::int from reference_categories k where k.source = ${referenceCategories.source} and k.parent_external_id = ${referenceCategories.externalId})`,
  adoptedNodeId: categoryNodes.id,
};

const adoptedJoin = and(eq(categoryNodes.source, referenceCategories.source), eq(categoryNodes.externalId, referenceCategories.externalId));

export async function browseStandard(db: DbOrTx, ability: AppAbility, source: ReferenceSource, parentExternalId: string | null): Promise<ReferenceRow[]> {
  canRead(ability);
  const rows = await db
    .select(rowSelect)
    .from(referenceCategories)
    .leftJoin(categoryNodes, adoptedJoin)
    .where(
      and(
        eq(referenceCategories.source, source),
        parentExternalId ? eq(referenceCategories.parentExternalId, parentExternalId) : isNull(referenceCategories.parentExternalId),
      ),
    )
    .orderBy(asc(referenceCategories.name))
    .limit(2000);
  return rows as ReferenceRow[];
}

export async function searchStandard(db: DbOrTx, ability: AppAbility, source: ReferenceSource, text: string, limit = 40): Promise<ReferenceRow[]> {
  canRead(ability);
  const q = text.trim().toLowerCase();
  if (q.length < 2) return [];
  if (source === 'unspsc' && /^\d{2,8}$/.test(q)) {
    const rows = await db
      .select(rowSelect)
      .from(referenceCategories)
      .leftJoin(categoryNodes, adoptedJoin)
      .where(and(eq(referenceCategories.source, source), sql`${referenceCategories.externalId} like ${q + '%'}`))
      .orderBy(asc(referenceCategories.externalId))
      .limit(limit);
    return rows as ReferenceRow[];
  }
  const like = '%' + q.replace(/[\\%_]/g, (m) => '\\' + m) + '%';
  const rows = await db
    .select(rowSelect)
    .from(referenceCategories)
    .leftJoin(categoryNodes, adoptedJoin)
    .where(
      and(
        eq(referenceCategories.source, source),
        sql`(lower(${referenceCategories.name}) like ${like} or extensions.similarity(lower(${referenceCategories.name}), ${q}) > 0.4)`,
      ),
    )
    .orderBy(
      sql`lower(${referenceCategories.name}) = ${q} desc`,
      sql`extensions.similarity(lower(${referenceCategories.name}), ${q}) desc`,
      asc(referenceCategories.level),
    )
    .limit(limit);
  return rows as ReferenceRow[];
}

export interface ReferenceAttributeView {
  handle: string;
  name: string;
  description: string;
  baseHandle: string | null;
  /** for extended attributes these are the base attribute's values */
  values: string[];
}

export interface ReferenceDetail extends ReferenceRow {
  ancestors: { externalId: string; name: string; level: number; adoptedNodeId: string | null }[];
  attributes: ReferenceAttributeView[];
  levelName: string;
}

export async function referenceAttributesFor(db: DbOrTx, source: ReferenceSource, handles: string[]): Promise<ReferenceAttributeView[]> {
  if (!handles.length) return [];
  const own = await db
    .select()
    .from(referenceAttributes)
    .where(and(eq(referenceAttributes.source, source), inArray(referenceAttributes.handle, handles)));
  const bases = [...new Set(own.map((a) => a.baseHandle).filter((h): h is string => !!h))];
  const baseRows = bases.length
    ? await db.select().from(referenceAttributes).where(and(eq(referenceAttributes.source, source), inArray(referenceAttributes.handle, bases)))
    : [];
  const byHandle = new Map(own.map((a) => [a.handle, a]));
  return handles
    .map((h) => byHandle.get(h))
    .filter((a): a is NonNullable<typeof a> => !!a)
    .map((a) => ({
      handle: a.handle,
      name: a.name,
      description: a.description,
      baseHandle: a.baseHandle,
      values: a.baseHandle ? (baseRows.find((b) => b.handle === a.baseHandle)?.values ?? []) : a.values,
    }));
}

export async function getStandardCategory(db: DbOrTx, ability: AppAbility, source: ReferenceSource, externalId: string): Promise<ReferenceDetail> {
  canRead(ability);
  const [row] = await db
    .select({ ...rowSelect, handles: referenceCategories.attributeHandles })
    .from(referenceCategories)
    .leftJoin(categoryNodes, adoptedJoin)
    .where(and(eq(referenceCategories.source, source), eq(referenceCategories.externalId, externalId)));
  if (!row) throw notFound('Standard category');
  const chain = await db.execute<{ external_id: string; name: string; level: number; adopted: string | null }>(sql`
    with recursive up as (
      select external_id, parent_external_id, name, level from reference_categories where source = ${source} and external_id = ${row.parentExternalId}
      union all
      select r.external_id, r.parent_external_id, r.name, r.level from reference_categories r join up on r.external_id = up.parent_external_id and r.source = ${source}
    )
    select up.external_id, up.name, up.level, n.id as adopted from up
    left join category_nodes n on n.source = ${source} and n.external_id = up.external_id
    order by up.level`);
  const { handles, ...rest } = row;
  return {
    ...(rest as ReferenceRow),
    ancestors: chain.map((c) => ({ externalId: c.external_id, name: c.name, level: c.level, adoptedNodeId: c.adopted })),
    attributes: await referenceAttributesFor(db, source, handles),
    levelName: source === 'unspsc' ? UNSPSC_LEVEL_NAMES[unspscLevel(externalId)] : `Level ${row.level}`,
  };
}

/** The reference subtree under (and including) a category, top-down; used to adopt a whole branch. */
export async function referenceBranch(db: DbOrTx, source: ReferenceSource, externalId: string, limit: number) {
  return db.execute<{ external_id: string; parent_external_id: string | null; name: string; level: number; is_leaf: boolean; attribute_handles: string[] }>(sql`
    with recursive down as (
      select external_id, parent_external_id, name, level, is_leaf, attribute_handles from reference_categories where source = ${source} and external_id = ${externalId}
      union all
      select r.external_id, r.parent_external_id, r.name, r.level, r.is_leaf, r.attribute_handles
      from reference_categories r join down on r.parent_external_id = down.external_id and r.source = ${source}
    )
    select * from down order by level, name limit ${limit + 1}`);
}
