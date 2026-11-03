import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { recordAudit } from '@orbita/audit';
import { subject } from '@orbita/authz';
import { brandAuthorisations, brandBlocks, brandCategoryApprovals, brands, categoryNodes, organisations, type Database, type DbOrTx } from '@orbita/db';
import { badRequest, conflict, forbidden, notFound, preconditionFailed } from '@orbita/domain';
import { notify } from '@orbita/notifications';
import { assertVerified, loadOrg, orgPeople, orgSubject, ZONES, type Ctx } from '@orbita/sellers';
import { activeBlocks } from './names';

/**
 * Brand owners on Orbita decide who resells their brands (the authorisation handshake), and see it all
 * on the OEM dashboard. Approvers revive brands that were blocked in a category.
 */
const brandSubject = (brandId: string) => subject('Brand', { brandId });

export const authorisationRequest = z.object({
  brandId: z.uuid(),
  categoryIds: z.array(z.uuid()).min(1, 'Pick at least one category.').max(50),
  message: z.string().trim().max(1000).default(''),
});

/** A reseller asks the brand's owner for permission to sell it in some categories. */
export async function requestAuthorisation(deps: { db: Database }, ctx: Ctx, orgId: string, raw: z.input<typeof authorisationRequest>) {
  if (!ctx.ability.can('create', subject('BrandRequest', { orgId }))) throw forbidden();
  const a = authorisationRequest.parse(raw);
  return deps.db.transaction(async (tx) => {
    const org = await assertVerified(tx, orgId);
    const [b] = await tx.select().from(brands).where(eq(brands.id, a.brandId));
    if (!b) throw notFound('Brand');
    if (!b.ownerOrgId) throw preconditionFailed(`${b.name}’s owner is not on Orbita: send a brand request with their authorisation letter instead.`);
    if (b.ownerOrgId === orgId) throw conflict('You own this brand.');
    const [pending] = await tx.select({ id: brandAuthorisations.id }).from(brandAuthorisations).where(and(eq(brandAuthorisations.brandId, b.id), eq(brandAuthorisations.resellerOrgId, orgId), eq(brandAuthorisations.status, 'requested')));
    if (pending) throw conflict(`You already asked the owner of ${b.name}; wait for their answer.`);
    const blocked = await tx.select({ c: brandBlocks.categoryNodeId }).from(brandBlocks).where(and(eq(brandBlocks.brandId, b.id), inArray(brandBlocks.categoryNodeId, a.categoryIds), isNull(brandBlocks.revivedAt)));
    if (blocked.length) throw preconditionFailed(`${b.name} is blocked in some of these categories.`);
    const [row] = await tx.insert(brandAuthorisations).values({ brandId: b.id, ownerOrgId: b.ownerOrgId, resellerOrgId: orgId, requestedCategoryIds: [...new Set(a.categoryIds)], message: a.message, requestedBy: ctx.actor.id }).returning();
    await recordAudit(tx, ctx, { action: 'brand.authorisation.requested', subjectType: 'brand', subjectId: b.id, summary: `${org.legalName} asked to resell ${b.name} in ${a.categoryIds.length} categor${a.categoryIds.length === 1 ? 'y' : 'ies'}`, after: { authorisationId: row!.id } });
    await notify(tx, await orgPeople(tx, b.ownerOrgId, ['seller_admin']), { kind: 'brand.authorisation.requested', title: `${org.legalName} wants to resell ${b.name}`, body: a.message, link: '/seller/oem' });
    return row!;
  });
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2027-03-31.');
export const authorisationDecision = z.discriminatedUnion('grant', [
  z.object({
    grant: z.literal(true),
    categoryIds: z.array(z.uuid()).min(1, 'Grant at least one category, or decline.'),
    regions: z.array(z.enum(ZONES)).default([]),
    validUntil: isoDate.nullable().optional(),
    note: z.string().trim().max(1000).default(''),
  }),
  z.object({ grant: z.literal(false), note: z.string().trim().min(5, 'Say why you decline.').max(1000) }),
]);

/** The brand owner grants scope (categories, zones, validity) or declines. Granting creates the approvals. */
export async function decideAuthorisation(deps: { db: Database }, ctx: Ctx, id: string, raw: z.input<typeof authorisationDecision>, today = new Date().toISOString().slice(0, 10)) {
  const d = authorisationDecision.parse(raw);
  return deps.db.transaction(async (tx) => {
    const [a] = await tx.select().from(brandAuthorisations).where(eq(brandAuthorisations.id, id)).for('update');
    if (!a) throw notFound('Authorisation request');
    if (!ctx.ability.can('approve', brandSubject(a.brandId))) throw forbidden('Only the brand owner decides this.');
    if (a.status !== 'requested') throw conflict('This request has already been answered.');
    const [b] = await tx.select().from(brands).where(eq(brands.id, a.brandId));
    const reseller = await loadOrg(tx, a.resellerOrgId);
    if (d.grant) {
      if (d.categoryIds.some((c) => !a.requestedCategoryIds.includes(c))) throw badRequest('Grant only categories the reseller asked for.');
      if (d.validUntil && d.validUntil <= today) throw badRequest('“Valid until” must be in the future.');
      await tx.update(brandAuthorisations).set({ status: 'granted', grantedCategoryIds: d.categoryIds, regions: d.regions, validUntil: d.validUntil ?? null, decisionNote: d.note || null, decidedBy: ctx.actor.id, decidedAt: new Date() }).where(eq(brandAuthorisations.id, id));
      for (const categoryNodeId of d.categoryIds)
        await tx
          .insert(brandCategoryApprovals)
          .values({ orgId: a.resellerOrgId, brandId: a.brandId, categoryNodeId, relation: 'authorised_reseller', source: 'owner_authorisation', authorisationId: id, regions: d.regions, validUntil: d.validUntil ?? null, approvedBy: ctx.actor.id })
          .onConflictDoNothing();
    } else {
      await tx.update(brandAuthorisations).set({ status: 'declined', decisionNote: d.note, decidedBy: ctx.actor.id, decidedAt: new Date() }).where(eq(brandAuthorisations.id, id));
    }
    const what = d.grant ? `granted ${d.categoryIds.length} categor${d.categoryIds.length === 1 ? 'y' : 'ies'}${d.regions.length ? ` in ${d.regions.join(', ')}` : ' everywhere'}${d.validUntil ? ` until ${d.validUntil}` : ''}` : 'declined';
    await recordAudit(tx, ctx, { action: d.grant ? 'brand.authorisation.granted' : 'brand.authorisation.declined', subjectType: 'brand', subjectId: a.brandId, summary: `${ctx.actor.email} ${what} to ${reseller.legalName} for ${b!.name}`, after: d });
    await notify(tx, await orgPeople(tx, a.resellerOrgId), { kind: d.grant ? 'brand.authorisation.granted' : 'brand.authorisation.declined', title: `${b!.name}: ${d.grant ? 'you are authorised' : 'authorisation declined'}`, body: d.grant ? `The owner ${what}.` : d.note, link: '/seller/brands' });
  });
}

/** The owner withdraws a reseller's permission; their approvals end now. */
export async function revokeAuthorisation(deps: { db: Database }, ctx: Ctx, id: string, note: string) {
  if (note.trim().length < 5) throw badRequest('Say why you revoke it.');
  return deps.db.transaction(async (tx) => {
    const [a] = await tx.select().from(brandAuthorisations).where(eq(brandAuthorisations.id, id)).for('update');
    if (!a) throw notFound('Authorisation');
    if (!ctx.ability.can('approve', brandSubject(a.brandId))) throw forbidden('Only the brand owner revokes this.');
    if (a.status !== 'granted') throw conflict('Only a granted authorisation can be revoked.');
    await tx.update(brandAuthorisations).set({ status: 'revoked', decisionNote: note.trim(), decidedBy: ctx.actor.id, decidedAt: new Date() }).where(eq(brandAuthorisations.id, id));
    await tx.update(brandCategoryApprovals).set({ revokedAt: new Date(), revokedBy: ctx.actor.id }).where(and(eq(brandCategoryApprovals.authorisationId, id), isNull(brandCategoryApprovals.revokedAt)));
    const [b] = await tx.select().from(brands).where(eq(brands.id, a.brandId));
    await recordAudit(tx, ctx, { action: 'brand.authorisation.revoked', subjectType: 'brand', subjectId: a.brandId, summary: `${ctx.actor.email} revoked the authorisation to resell ${b!.name}: ${note.trim()}` });
    await notify(tx, await orgPeople(tx, a.resellerOrgId), { kind: 'brand.authorisation.revoked', title: `${b!.name}: authorisation revoked`, body: note.trim(), link: '/seller/brands' });
  });
}

// ---------------------------------------------------------------------------
// What a seller may sell, and the OEM dashboard

async function categoryNames(db: DbOrTx, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const rows = await db.select({ id: categoryNodes.id, name: categoryNodes.name }).from(categoryNodes).where(inArray(categoryNodes.id, ids));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** The seller's approved brand-category relations (what R5 lets them list). */
export async function orgApprovals(db: DbOrTx, ctx: Pick<Ctx, 'ability'>, orgId: string) {
  if (!ctx.ability.can('read', orgSubject(orgId))) throw forbidden();
  return db
    .select({ id: brandCategoryApprovals.id, brandId: brands.id, brandName: brands.name, categoryId: categoryNodes.id, categoryName: categoryNodes.name, relation: brandCategoryApprovals.relation, source: brandCategoryApprovals.source, regions: brandCategoryApprovals.regions, validUntil: brandCategoryApprovals.validUntil, approvedAt: brandCategoryApprovals.approvedAt })
    .from(brandCategoryApprovals)
    .innerJoin(brands, eq(brands.id, brandCategoryApprovals.brandId))
    .innerJoin(categoryNodes, eq(categoryNodes.id, brandCategoryApprovals.categoryNodeId))
    .where(and(eq(brandCategoryApprovals.orgId, orgId), isNull(brandCategoryApprovals.revokedAt)))
    .orderBy(asc(brands.name), asc(categoryNodes.name));
}

/** Authorisation requests a seller sent (as a reseller). */
export async function sentAuthorisations(db: DbOrTx, ctx: Pick<Ctx, 'ability'>, orgId: string) {
  if (!ctx.ability.can('read', orgSubject(orgId))) throw forbidden();
  return db
    .select({ a: brandAuthorisations, brandName: brands.name, ownerName: organisations.legalName })
    .from(brandAuthorisations)
    .innerJoin(brands, eq(brands.id, brandAuthorisations.brandId))
    .innerJoin(organisations, eq(organisations.id, brandAuthorisations.ownerOrgId))
    .where(eq(brandAuthorisations.resellerOrgId, orgId))
    .orderBy(desc(brandAuthorisations.createdAt));
}

/** The OEM dashboard: brands the organisation owns, who resells them, and pending requests. */
export async function oemDashboard(db: DbOrTx, ctx: Pick<Ctx, 'ability'>, orgId: string) {
  if (!ctx.ability.can('read', orgSubject(orgId))) throw forbidden();
  const owned = await db.select().from(brands).where(eq(brands.ownerOrgId, orgId)).orderBy(asc(brands.name));
  const ids = owned.map((b) => b.id);
  const auths = ids.length
    ? await db
        .select({ a: brandAuthorisations, resellerName: organisations.legalName, brandName: brands.name })
        .from(brandAuthorisations)
        .innerJoin(organisations, eq(organisations.id, brandAuthorisations.resellerOrgId))
        .innerJoin(brands, eq(brands.id, brandAuthorisations.brandId))
        .where(inArray(brandAuthorisations.brandId, ids))
        .orderBy(desc(brandAuthorisations.createdAt))
    : [];
  const names = await categoryNames(db, [...new Set(auths.flatMap((x) => [...x.a.requestedCategoryIds, ...x.a.grantedCategoryIds]))]);
  const blocks = ids.length ? (await activeBlocks(db)).filter((b) => ids.includes(b.b.brandId)) : [];
  return {
    brands: owned.map((b) => ({ ...b, canDecide: ctx.ability.can('approve', brandSubject(b.id)), resellers: auths.filter((x) => x.a.brandId === b.id && x.a.status === 'granted').length })),
    pending: auths.filter((x) => x.a.status === 'requested').map((x) => ({ ...x.a, resellerName: x.resellerName, brandName: x.brandName, categories: x.a.requestedCategoryIds.map((c) => ({ id: c, name: names.get(c) ?? c })), canDecide: ctx.ability.can('approve', brandSubject(x.a.brandId)) })),
    resellers: auths.filter((x) => x.a.status === 'granted').map((x) => ({ ...x.a, resellerName: x.resellerName, brandName: x.brandName, categories: x.a.grantedCategoryIds.map((c) => ({ id: c, name: names.get(c) ?? c })), canDecide: ctx.ability.can('approve', brandSubject(x.a.brandId)) })),
    history: auths.filter((x) => x.a.status === 'declined' || x.a.status === 'revoked').map((x) => ({ ...x.a, resellerName: x.resellerName, brandName: x.brandName })),
    blocks: blocks.map((b) => ({ brandName: b.brandName, categoryName: b.categoryName, reason: b.b.reason })),
  };
}

// ---------------------------------------------------------------------------
// Blocks and revival (approver)

export async function listBlocks(db: DbOrTx, ctx: Pick<Ctx, 'ability'>) {
  if (!ctx.ability.can('read', 'BrandBlock')) throw forbidden();
  return activeBlocks(db);
}

export async function reviveBlock(deps: { db: Database }, ctx: Ctx, blockId: string, note: string) {
  if (!ctx.ability.can('approve', 'BrandBlock')) throw forbidden('Only an approver revives a blocked brand.');
  if (note.trim().length < 5) throw badRequest('Say why the brand may be sold again.');
  return deps.db.transaction(async (tx) => {
    const [b] = await tx.select().from(brandBlocks).where(and(eq(brandBlocks.id, blockId), isNull(brandBlocks.revivedAt))).for('update');
    if (!b) throw notFound('Block');
    await tx.update(brandBlocks).set({ revivedAt: new Date(), revivedBy: ctx.actor.id, reviveNote: note.trim() }).where(eq(brandBlocks.id, blockId));
    const [brand] = await tx.select({ name: brands.name }).from(brands).where(eq(brands.id, b.brandId));
    const [cat] = await tx.select({ name: categoryNodes.name }).from(categoryNodes).where(eq(categoryNodes.id, b.categoryNodeId));
    await recordAudit(tx, ctx, { action: 'brand.revived', subjectType: 'brand', subjectId: b.brandId, summary: `${ctx.actor.email} revived ${brand!.name} in ${cat!.name}: ${note.trim()}` });
  });
}
