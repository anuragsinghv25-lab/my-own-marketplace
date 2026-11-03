import { and, asc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { recordAudit } from '@orbita/audit';
import { subject } from '@orbita/authz';
import { brandBlocks, brands, categoryNodes, organisations, prohibitedNames, type Database, type DbOrTx } from '@orbita/db';
import { badRequest, conflict, forbidden, notFound } from '@orbita/domain';
import type { Ctx } from '@orbita/sellers';

/** "Nova-Ra™ " → "NOVARA": what duplicate and prohibited checks compare. */
export const normalizeBrand = (s: string) => s.normalize('NFKD').toUpperCase().replace(/[^A-Z0-9]/g, '');

export const brandName = z
  .string()
  .trim()
  .min(2, 'A brand name has at least 2 characters.')
  .max(60, 'Keep the brand name under 60 characters.')
  .refine((s) => normalizeBrand(s).length >= 2, 'Use letters or digits in the brand name.');

export interface NameCheck {
  ok: boolean;
  /** why it cannot be used, when it cannot */
  problem: string | null;
  /** an existing brand with this name, if any */
  existing: { id: string; name: string; ownerOrgId: string | null; ownerName: string | null; status: string } | null;
  /** similar brands, to catch near-duplicates ("Novara" vs "Nova Ra") */
  similar: { id: string; name: string }[];
}

/** The live check the Brand Center runs as the seller types. */
export async function checkBrandName(db: DbOrTx, raw: string): Promise<NameCheck> {
  const parsed = brandName.safeParse(raw);
  if (!parsed.success) return { ok: false, problem: parsed.error.issues[0]!.message, existing: null, similar: [] };
  const n = normalizeBrand(parsed.data);
  const [banned] = await db.select().from(prohibitedNames).where(eq(prohibitedNames.normalizedName, n));
  if (banned) {
    const why = { prohibited: 'is a protected name and cannot be used as a brand', negative: 'is not a brand', legally_rejected: 'was rejected as a brand by a court or the registry' }[banned.list];
    return { ok: false, problem: `“${parsed.data}” ${why}${banned.reason ? ` (${banned.reason})` : ''}.`, existing: null, similar: [] };
  }
  const [hit] = await db
    .select({ id: brands.id, name: brands.name, ownerOrgId: brands.ownerOrgId, ownerName: organisations.legalName, status: brands.status })
    .from(brands)
    .leftJoin(organisations, eq(organisations.id, brands.ownerOrgId))
    .where(eq(brands.normalizedName, n));
  const similar = n.length >= 3
    ? await db
        .select({ id: brands.id, name: brands.name })
        .from(brands)
        .where(and(sql`${brands.normalizedName} <> ${n}`, or(ilike(brands.normalizedName, `${n.slice(0, Math.max(3, n.length - 2))}%`), sql`${n} like ${brands.normalizedName} || '%'`)))
        .orderBy(asc(brands.name))
        .limit(5)
    : [];
  return { ok: true, problem: null, existing: hit ?? null, similar };
}

/** Finds the brand by name or creates it as "proposed" (it becomes active when a request or assessment is approved). */
export async function brandForName(tx: DbOrTx, name: string, by: string) {
  const check = await checkBrandName(tx, name);
  if (!check.ok) throw badRequest(check.problem!);
  if (check.existing) return check.existing;
  const [row] = await tx.insert(brands).values({ name: name.trim(), normalizedName: normalizeBrand(name), createdBy: by }).returning();
  return { id: row!.id, name: row!.name, ownerOrgId: null, ownerName: null, status: row!.status };
}

export async function searchBrands(db: DbOrTx, q: string) {
  const n = normalizeBrand(q);
  if (n.length < 2) return [];
  return db
    .select({ id: brands.id, name: brands.name, status: brands.status, ownerName: organisations.legalName })
    .from(brands)
    .leftJoin(organisations, eq(organisations.id, brands.ownerOrgId))
    .where(ilike(brands.normalizedName, `%${n}%`))
    .orderBy(asc(brands.name))
    .limit(20);
}

// ---------------------------------------------------------------------------
// Prohibited, negative and legally rejected names (platform admin)

export const prohibitedInput = z.object({
  name: brandName,
  list: z.enum(['prohibited', 'negative', 'legally_rejected']),
  reason: z.string().trim().max(200).default(''),
});

export async function listProhibited(db: DbOrTx, ctx: Pick<Ctx, 'ability'>) {
  if (!ctx.ability.can('read', 'ProhibitedName')) throw forbidden();
  return db.select().from(prohibitedNames).orderBy(asc(prohibitedNames.list), asc(prohibitedNames.name));
}

export async function addProhibited(deps: { db: Database }, ctx: Ctx, raw: z.input<typeof prohibitedInput>) {
  if (!ctx.ability.can('create', 'ProhibitedName')) throw forbidden();
  const p = prohibitedInput.parse(raw);
  return deps.db.transaction(async (tx) => {
    const [row] = await tx.insert(prohibitedNames).values({ ...p, normalizedName: normalizeBrand(p.name), createdBy: ctx.actor.id }).onConflictDoNothing().returning();
    if (!row) throw conflict('That name is already on a list.');
    const [inUse] = await tx.select({ name: brands.name }).from(brands).where(eq(brands.normalizedName, row.normalizedName));
    await recordAudit(tx, ctx, { action: 'brand.name_listed', subjectType: 'prohibited_name', subjectId: row.id, summary: `${ctx.actor.email} added “${p.name}” to the ${p.list.replace('_', ' ')} list${inUse ? ' (an existing brand has this name; it is not changed)' : ''}`, after: p });
    return row;
  });
}

export async function removeProhibited(deps: { db: Database }, ctx: Ctx, id: string) {
  if (!ctx.ability.can('update', 'ProhibitedName')) throw forbidden();
  return deps.db.transaction(async (tx) => {
    const [row] = await tx.delete(prohibitedNames).where(eq(prohibitedNames.id, id)).returning();
    if (!row) throw notFound('Name');
    await recordAudit(tx, ctx, { action: 'brand.name_unlisted', subjectType: 'prohibited_name', subjectId: id, summary: `${ctx.actor.email} removed “${row.name}” from the ${row.list.replace('_', ' ')} list` });
  });
}

// ---------------------------------------------------------------------------
// Trademark classes on categories (set by category managers; inherited down the tree)

/** For each listing category: its trademark classes, from itself or the nearest ancestor that has some. */
export async function effectiveClasses(db: DbOrTx, nodeIds?: string[]) {
  const rows = await db.execute<{ leaf: string; classes: number[] }>(sql`
    with recursive up as (
      select n.id as leaf, n.id, n.parent_id, n.trademark_classes, 0 as depth
      from category_nodes n
      where n.kind = 'listing' and n.status = 'active' ${nodeIds?.length ? sql`and n.id in (${sql.join(nodeIds.map((i) => sql`${i}::uuid`), sql`, `)})` : sql``}
      union all
      select up.leaf, p.id, p.parent_id, p.trademark_classes, up.depth + 1
      from category_nodes p join up on p.id = up.parent_id
      where cardinality(up.trademark_classes) = 0
    )
    select leaf, trademark_classes as classes from up where cardinality(trademark_classes) > 0`);
  return new Map(rows.map((r) => [r.leaf, r.classes.map(Number)]));
}

/** Listing categories that fit a trademark class (the Brand Center's suggestions). */
export async function categoriesForClass(db: DbOrTx, niceClass: number) {
  const map = await effectiveClasses(db);
  const ids = [...map].filter(([, cls]) => cls.includes(niceClass)).map(([id]) => id);
  if (!ids.length) return [];
  return db.select({ id: categoryNodes.id, name: categoryNodes.name, code: categoryNodes.code }).from(categoryNodes).where(inArray(categoryNodes.id, ids)).orderBy(asc(categoryNodes.name));
}

/** Listing categories a seller can pick, with a path for display. */
export async function listingCategories(db: DbOrTx) {
  const rows = await db.execute<{ id: string; name: string; code: string; path: string }>(sql`
    with recursive up as (
      select n.id as leaf, n.id, n.parent_id, n.name, 0 as depth from category_nodes n where n.kind = 'listing' and n.status = 'active'
      union all
      select up.leaf, p.id, p.parent_id, p.name, up.depth + 1 from category_nodes p join up on p.id = up.parent_id
    )
    select l.id, l.name, l.code, string_agg(up.name, ' › ' order by up.depth desc) as path
    from category_nodes l join up on up.leaf = l.id
    group by l.id, l.name, l.code
    order by path`);
  return rows.map((r) => ({ id: r.id, name: r.name, code: r.code, path: r.path }));
}

const classesInput = z.array(z.number().int().min(1).max(45)).max(10);

export async function setTrademarkClasses(deps: { db: Database }, ctx: Ctx, nodeId: string, raw: number[]) {
  const classes = [...new Set(classesInput.parse(raw))].sort((a, b) => a - b);
  return deps.db.transaction(async (tx) => {
    const [n] = await tx.select().from(categoryNodes).where(eq(categoryNodes.id, nodeId));
    if (!n) throw notFound('Category');
    if (!ctx.ability.can('update', subject('CategoryNode', { workgroupId: n.workgroupId }))) throw forbidden('You cannot change this category.');
    await tx.update(categoryNodes).set({ trademarkClasses: classes }).where(eq(categoryNodes.id, nodeId));
    await recordAudit(tx, ctx, { action: 'taxonomy.node.trademark_classes', subjectType: 'category_node', subjectId: nodeId, summary: `${ctx.actor.email} set trademark classes of ${n.name} to ${classes.join(', ') || 'none (inherit)'}`, before: { classes: n.trademarkClasses }, after: { classes } });
  });
}

/** Active blocks (brand + category rejected for everyone). */
export async function activeBlocks(db: DbOrTx, brandId?: string) {
  return db
    .select({ b: brandBlocks, brandName: brands.name, categoryName: categoryNodes.name })
    .from(brandBlocks)
    .innerJoin(brands, eq(brands.id, brandBlocks.brandId))
    .innerJoin(categoryNodes, eq(categoryNodes.id, brandBlocks.categoryNodeId))
    .where(and(isNull(brandBlocks.revivedAt), brandId ? eq(brandBlocks.brandId, brandId) : undefined))
    .orderBy(asc(brands.name));
}
