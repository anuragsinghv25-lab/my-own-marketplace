import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { recordAudit } from '@orbita/audit';
import { subject } from '@orbita/authz';
import {
  brandBlocks,
  brandCategoryApprovals,
  brandRequests,
  brands,
  categoryNodes,
  platformSettings,
  trademarks,
  vendorAssessments,
  type BrandRequest,
  type Database,
  type DbOrTx,
} from '@orbita/db';
import { badRequest, conflict, forbidden, notFound, preconditionFailed } from '@orbita/domain';
import { notify } from '@orbita/notifications';
import { assertOwnFiles, assertVerified, CASE_SPECS, decideCase, loadOrg, orgPeople, respondCase, submitCase, withdrawCase, type CaseDecisionInput, type Ctx } from '@orbita/sellers';
import { brandForName, brandName, checkBrandName, effectiveClasses } from './names';
import { readiness } from './readiness';
import { grantBrandOwner } from './vendor';

export { readiness, type Readiness } from './readiness';

/**
 * The Brand Center: lookup first (no duplicate brands), relationship first (owner, manufacturer for the
 * owner, authorised reseller, unbranded), then the evidence that relationship and the trademark need.
 * A reseller of a brand whose owner is on Orbita does not come here: they ask the owner (authorisations.ts).
 */
const brSubject = (orgId: string) => subject('BrandRequest', { orgId });

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2030-12-31.');
export const trademarkInput = z.object({
  markType: z.enum(['word', 'device', 'both']),
  applicationNumber: z.string().trim().regex(/^[0-9]{5,10}$/, 'A trademark application number has 5 to 10 digits.'),
  niceClass: z.number().int().min(1, 'Classes run from 1 to 45.').max(45, 'Classes run from 1 to 45.'),
  ownerName: z.string().trim().min(2, 'Enter the owner name exactly as on the certificate.').max(200),
  validUntil: isoDate.nullable().optional(),
  certificateFileId: z.uuid().nullable().optional(),
});

export const requestInput = z.object({
  brandName,
  relation: z.enum(['owner', 'manufacturer_for_owner', 'authorised_reseller', 'unbranded']),
  brandKind: z.enum(['registered', 'unregistered', 'unbranded']),
  trademark: trademarkInput.nullable().optional(),
  categoryNodeIds: z.array(z.uuid()).max(50).default([]),
  ownerNameMatches: z.boolean().nullable().optional(),
  undertakingAccepted: z.boolean().default(false),
  fileIds: z.array(z.uuid()).default([]),
  note: z.string().trim().max(2000).default(''),
});
export type RequestInput = z.input<typeof requestInput>;

const RELATION = { owner: 'owner', manufacturer_for_owner: 'manufacturer for the owner', authorised_reseller: 'authorised reseller', unbranded: 'unbranded' } as const;

export async function loadRequest(db: DbOrTx, id: string) {
  const [r] = await db
    .select({ r: brandRequests, brandName: brands.name, brandOwnerOrgId: brands.ownerOrgId, tm: trademarks })
    .from(brandRequests)
    .innerJoin(brands, eq(brands.id, brandRequests.brandId))
    .leftJoin(trademarks, eq(trademarks.id, brandRequests.trademarkId))
    .where(eq(brandRequests.id, id));
  if (!r) throw notFound('Brand request');
  return { ...r.r, brandName: r.brandName, brandOwnerOrgId: r.brandOwnerOrgId, trademark: r.tm };
}
export type LoadedRequest = Awaited<ReturnType<typeof loadRequest>>;

const titleOf = (orgName: string, r: Pick<LoadedRequest, 'brandName' | 'relation'>) => `${r.brandName} · ${orgName} (${RELATION[r.relation]})`;

export async function hasApprovedVa(db: DbOrTx, orgId: string) {
  const [va] = await db.select({ id: vendorAssessments.id }).from(vendorAssessments).where(and(eq(vendorAssessments.orgId, orgId), eq(vendorAssessments.status, 'approved'))).limit(1);
  return !!va;
}

export async function requestReadiness(db: DbOrTx, r: LoadedRequest) {
  const org = await loadOrg(db, r.orgId);
  return readiness(r, { verified: org.status === 'verified', hasApprovedVa: await hasApprovedVa(db, r.orgId) });
}

// ---------------------------------------------------------------------------
// Drafting

export async function saveRequest(deps: { db: Database }, ctx: Ctx, orgId: string, id: string | null, raw: RequestInput) {
  if (!ctx.ability.can('update', brSubject(orgId))) throw forbidden('You cannot prepare brand requests for this organisation.');
  const v = requestInput.parse(raw);
  if (v.brandKind === 'unbranded' && v.relation !== 'unbranded') throw badRequest('Unbranded goods use the unbranded relationship.');
  if (v.relation === 'unbranded' && v.brandKind !== 'unbranded') throw badRequest('Pick “unbranded” as the brand type too.');
  if (v.brandKind !== 'registered' && v.trademark) throw badRequest('Only registered brands have trademark details.');
  return deps.db.transaction(async (tx) => {
    await assertOwnFiles(tx, orgId, [...v.fileIds, ...(v.trademark?.certificateFileId ? [v.trademark.certificateFileId] : [])]);
    const check = await checkBrandName(tx, v.brandName);
    if (!check.ok) throw badRequest(check.problem!);
    if (v.relation === 'owner' && check.existing?.ownerOrgId && check.existing.ownerOrgId !== orgId)
      throw conflict(`${check.existing.name} belongs to ${check.existing.ownerName}. Choose “authorised reseller” and ask them for an authorisation.`);
    if (v.relation === 'authorised_reseller' && check.existing?.ownerOrgId && check.existing.ownerOrgId !== orgId)
      throw preconditionFailed(`${check.existing.name}’s owner is on Orbita: ask them for an authorisation from My brands → Ask the owner.`);
    if (v.categoryNodeIds.length) {
      const ok = await tx.select({ id: categoryNodes.id }).from(categoryNodes).where(and(inArray(categoryNodes.id, v.categoryNodeIds), eq(categoryNodes.kind, 'listing'), eq(categoryNodes.status, 'active')));
      if (ok.length !== new Set(v.categoryNodeIds).size) throw badRequest('Pick listing categories.');
    }
    const brand = await brandForName(tx, v.brandName, ctx.actor.id);
    let current: BrandRequest | undefined;
    if (id) {
      [current] = await tx.select().from(brandRequests).where(and(eq(brandRequests.id, id), eq(brandRequests.orgId, orgId))).for('update');
      if (!current) throw notFound('Brand request');
      if (current.status !== 'draft') throw conflict('Only a draft can be changed. Answer the reviewer instead.');
    }
    let trademarkId: string | null = current?.trademarkId ?? null;
    if (v.trademark) {
      const t = { brandId: brand.id, orgId, ...v.trademark, validUntil: v.trademark.validUntil ?? null, certificateFileId: v.trademark.certificateFileId ?? null };
      if (trademarkId) await tx.update(trademarks).set(t).where(eq(trademarks.id, trademarkId));
      else trademarkId = (await tx.insert(trademarks).values(t).returning())[0]!.id;
    } else if (trademarkId) {
      await tx.update(brandRequests).set({ trademarkId: null }).where(eq(brandRequests.id, id!));
      await tx.delete(trademarks).where(eq(trademarks.id, trademarkId));
      trademarkId = null;
    }
    const values = {
      brandId: brand.id,
      relation: v.relation,
      brandKind: v.brandKind,
      trademarkId,
      categoryNodeIds: [...new Set(v.categoryNodeIds)],
      ownerNameMatches: v.brandKind === 'registered' ? (v.ownerNameMatches ?? null) : null,
      undertakingAccepted: v.undertakingAccepted,
      fileIds: [...new Set(v.fileIds)],
      note: v.note,
    };
    if (id) {
      await tx.update(brandRequests).set(values).where(eq(brandRequests.id, id));
      return id;
    }
    const [row] = await tx.insert(brandRequests).values({ orgId, ...values, createdBy: ctx.actor.id }).returning();
    await recordAudit(tx, ctx, { action: 'brand_request.created', subjectType: 'brand_request', subjectId: row!.id, summary: `${ctx.actor.email} started a brand request for ${brand.name} as ${RELATION[v.relation]}` });
    return row!.id;
  });
}

// ---------------------------------------------------------------------------
// Submitting: blocks, attempt limits and auto-approval first

const DEFAULT_COOLDOWN_DAYS = 30;
const MAX_ATTEMPTS = 3;

async function cooldownDays(db: DbOrTx) {
  const [s] = await db.select().from(platformSettings).where(eq(platformSettings.key, 'brand_request_cooldown_days'));
  return typeof s?.value === 'number' ? s.value : DEFAULT_COOLDOWN_DAYS;
}

/** Categories where this seller has been rejected for this brand 3 times within the cool-down. */
async function cooledDown(db: DbOrTx, orgId: string, brandId: string, categoryIds: string[]) {
  const since = new Date(Date.now() - (await cooldownDays(db)) * 86_400_000);
  const rejected = await db
    .select({ cats: brandRequests.categoryNodeIds })
    .from(brandRequests)
    .where(and(eq(brandRequests.orgId, orgId), eq(brandRequests.brandId, brandId), eq(brandRequests.status, 'rejected'), gt(brandRequests.decidedAt, since)));
  return categoryIds.filter((c) => rejected.filter((r) => r.cats.includes(c)).length >= MAX_ATTEMPTS);
}

/**
 * Categories that can be approved without a reviewer: the same seller already has this brand approved
 * (after review) with the same trademark application and class, and the category fits that class.
 */
async function autoApprovable(db: DbOrTx, r: LoadedRequest) {
  if (!r.trademark) return [];
  const prior = await db
    .select({ id: brandCategoryApprovals.id })
    .from(brandCategoryApprovals)
    .innerJoin(brandRequests, eq(brandRequests.id, brandCategoryApprovals.requestId))
    .innerJoin(trademarks, eq(trademarks.id, brandRequests.trademarkId))
    .where(
      and(
        eq(brandCategoryApprovals.orgId, r.orgId),
        eq(brandCategoryApprovals.brandId, r.brandId),
        isNull(brandCategoryApprovals.revokedAt),
        eq(brandCategoryApprovals.source, 'review'),
        eq(trademarks.applicationNumber, r.trademark.applicationNumber),
        eq(trademarks.niceClass, r.trademark.niceClass),
      ),
    )
    .limit(1);
  if (!prior.length) return [];
  const classes = await effectiveClasses(db, r.categoryNodeIds);
  return r.categoryNodeIds.filter((c) => classes.get(c)?.includes(r.trademark!.niceClass));
}

async function approve(tx: DbOrTx, r: LoadedRequest, categoryIds: string[], source: 'review' | 'auto', by: string | null) {
  for (const categoryNodeId of categoryIds)
    await tx
      .insert(brandCategoryApprovals)
      .values({ orgId: r.orgId, brandId: r.brandId, categoryNodeId, relation: r.relation, source, requestId: r.id, approvedBy: by })
      .onConflictDoNothing();
}

/** Already approved for this seller and brand (so a new request does not ask again). */
async function alreadyApproved(db: DbOrTx, orgId: string, brandId: string, categoryIds: string[]) {
  if (!categoryIds.length) return [];
  const rows = await db.select({ c: brandCategoryApprovals.categoryNodeId }).from(brandCategoryApprovals).where(and(eq(brandCategoryApprovals.orgId, orgId), eq(brandCategoryApprovals.brandId, brandId), inArray(brandCategoryApprovals.categoryNodeId, categoryIds), isNull(brandCategoryApprovals.revokedAt)));
  return rows.map((x) => x.c);
}

export async function submitRequest(deps: { db: Database }, ctx: Ctx, id: string) {
  return deps.db.transaction(async (tx) => {
    const r = await loadRequest(tx, id);
    if (!ctx.ability.can('submit', brSubject(r.orgId))) throw forbidden();
    if (r.status !== 'draft') throw conflict('This request has already been submitted.');
    const org = await assertVerified(tx, r.orgId);
    const ready = readiness(r, { verified: true, hasApprovedVa: await hasApprovedVa(tx, r.orgId) });
    if (ready.next) throw preconditionFailed(ready.next, { readiness: ready });
    const blocked = await tx.select({ c: brandBlocks.categoryNodeId, name: categoryNodes.name }).from(brandBlocks).innerJoin(categoryNodes, eq(categoryNodes.id, brandBlocks.categoryNodeId)).where(and(eq(brandBlocks.brandId, r.brandId), inArray(brandBlocks.categoryNodeId, r.categoryNodeIds), isNull(brandBlocks.revivedAt)));
    if (blocked.length) throw preconditionFailed(`${r.brandName} is blocked in ${blocked.map((b) => b.name).join(', ')}. Remove ${blocked.length === 1 ? 'it' : 'them'}, or ask platform support to have it revived.`);
    const cooled = await cooledDown(tx, r.orgId, r.brandId, r.categoryNodeIds);
    if (cooled.length) throw preconditionFailed(`This brand was rejected ${MAX_ATTEMPTS} times for some of these categories. Try again after the cool-down period of ${await cooldownDays(tx)} days.`);
    const have = await alreadyApproved(tx, r.orgId, r.brandId, r.categoryNodeIds);
    const remaining = r.categoryNodeIds.filter((c) => !have.includes(c));
    if (!remaining.length) throw conflict(`You can already sell ${r.brandName} in all of these categories.`);
    const auto = await autoApprovable(tx, { ...r, categoryNodeIds: remaining });
    const toReview = remaining.filter((c) => !auto.includes(c));
    await tx.update(brandRequests).set({ submittedAt: new Date(), categoryNodeIds: remaining }).where(eq(brandRequests.id, id));
    if (auto.length) {
      await approve(tx, r, auto, 'auto', null);
      await recordAudit(tx, ctx, {
        action: 'brand_request.auto_approved',
        subjectType: 'brand_request',
        subjectId: id,
        summary: `${r.brandName} was auto-approved for ${org.legalName} in ${auto.length} categor${auto.length === 1 ? 'y' : 'ies'}: same trademark ${r.trademark!.applicationNumber} (class ${r.trademark!.niceClass}) already approved`,
        after: { categoryIds: auto },
      });
    }
    if (!toReview.length) {
      await tx.update(brandRequests).set({ status: 'approved', decidedAt: new Date(), decisionNote: 'Auto-approved: the same trademark is already approved for this seller.' }).where(eq(brandRequests.id, id));
      await notify(tx, await orgPeople(tx, r.orgId), { kind: 'brand_request.auto_approved', title: `${r.brandName} approved automatically`, body: 'The same trademark and class were already approved for you, so no review was needed.', link: CASE_SPECS.brand_request.sellerLink(id) });
      return { status: 'approved' as const, autoApproved: auto.length };
    }
    await submitCase(tx, ctx, CASE_SPECS.brand_request, { subjectId: id, orgId: r.orgId, title: titleOf(org.legalName, r) });
    await tx.update(brandRequests).set({ status: 'submitted' }).where(eq(brandRequests.id, id));
    return { status: 'submitted' as const, autoApproved: auto.length };
  });
}

// ---------------------------------------------------------------------------
// Reviewing (lean: reviewer → approver on escalation)

export const brandDecision = z.object({
  decision: z.enum(['approve', 'reject', 'request_info', 'escalate']),
  reasonCode: z.string().nullable().optional(),
  note: z.string().max(4000).optional(),
  /** approve: the categories approved (default all); fewer = partial approval */
  categoryIds: z.array(z.uuid()).optional(),
});
export type BrandDecision = z.input<typeof brandDecision>;

/**
 * Approve (all or some categories), reject the request (this seller only), reject the brand in these
 * categories for everyone (reason "infringing"), ask for information, or escalate to an approver.
 */
export async function decideRequest(deps: { db: Database }, ctx: Ctx, id: string, raw: BrandDecision) {
  const input = brandDecision.parse(raw);
  return deps.db.transaction(async (tx) => {
    const r = await loadRequest(tx, id);
    const org = await loadOrg(tx, r.orgId);
    let approved: string[] = [];
    if (input.decision === 'approve') {
      approved = input.categoryIds ?? r.categoryNodeIds;
      if (!approved.length) throw badRequest('Approve at least one category, or reject the request.');
      if (approved.some((c) => !r.categoryNodeIds.includes(c))) throw badRequest('Approve only categories the seller asked for.');
    }
    if (input.decision === 'reject' && input.reasonCode === 'infringing' && !ctx.ability.can('approve', 'Escalation'))
      throw forbidden('Blocking a brand for every seller needs an approver: escalate it instead.');
    const res = await decideCase(tx, ctx, CASE_SPECS.brand_request, { subjectId: id, orgId: r.orgId, title: titleOf(org.legalName, r) }, input as CaseDecisionInput);
    let status = res.status;
    if (res.status === 'approved') {
      await approve(tx, r, approved, 'review', ctx.actor.id);
      if (approved.length < r.categoryNodeIds.length) status = 'partially_approved';
      await tx.update(brands).set({ status: 'active' }).where(eq(brands.id, r.brandId));
      if (r.relation === 'owner' && !r.brandOwnerOrgId && (await hasApprovedVa(tx, r.orgId))) {
        await tx.update(brands).set({ ownerOrgId: r.orgId }).where(eq(brands.id, r.brandId));
        await grantBrandOwner(tx, r.orgId, r.brandId, ctx.actor.id);
      }
    }
    if (res.status === 'rejected' && res.reason?.code === 'infringing') {
      for (const c of r.categoryNodeIds)
        await tx.insert(brandBlocks).values({ brandId: r.brandId, categoryNodeId: c, reason: input.note?.trim() || res.reason.label, requestId: id, blockedBy: ctx.actor.id }).onConflictDoNothing();
      await recordAudit(tx, ctx, { action: 'brand.blocked', subjectType: 'brand', subjectId: r.brandId, summary: `${ctx.actor.email} blocked ${r.brandName} for everyone in ${r.categoryNodeIds.length} categor${r.categoryNodeIds.length === 1 ? 'y' : 'ies'}`, after: { categoryIds: r.categoryNodeIds } });
    }
    await tx.update(brandRequests).set({ status, decisionNote: input.note?.trim() || null, decidedAt: res.final ? new Date() : null }).where(eq(brandRequests.id, id));
    return { status, approved: approved.length };
  });
}

export async function respondRequest(deps: { db: Database }, ctx: Ctx, id: string, reply: { note: string; fileIds?: string[] }) {
  return deps.db.transaction(async (tx) => {
    const r = await loadRequest(tx, id);
    if (r.status !== 'info_requested') throw conflict('Nobody is waiting for a reply on this request.');
    await assertOwnFiles(tx, r.orgId, reply.fileIds ?? []);
    const org = await loadOrg(tx, r.orgId);
    const status = await respondCase(tx, ctx, CASE_SPECS.brand_request, { subjectId: id, orgId: r.orgId, title: titleOf(org.legalName, r) }, reply);
    await tx.update(brandRequests).set({ status, fileIds: [...new Set([...r.fileIds, ...(reply.fileIds ?? [])])] }).where(eq(brandRequests.id, id));
  });
}

export async function withdrawRequest(deps: { db: Database }, ctx: Ctx, id: string) {
  return deps.db.transaction(async (tx) => {
    const r = await loadRequest(tx, id);
    if (!ctx.ability.can('update', brSubject(r.orgId))) throw forbidden();
    if (r.status === 'draft') {
      await tx.delete(brandRequests).where(eq(brandRequests.id, id));
      if (r.trademarkId) await tx.delete(trademarks).where(eq(trademarks.id, r.trademarkId));
      return 'deleted' as const;
    }
    if (!['submitted', 'info_requested'].includes(r.status)) throw conflict('It is too late to withdraw this request.');
    const org = await loadOrg(tx, r.orgId);
    await withdrawCase(tx, ctx, CASE_SPECS.brand_request, { subjectId: id, orgId: r.orgId, title: titleOf(org.legalName, r) });
    await tx.update(brandRequests).set({ status: 'withdrawn', decidedAt: new Date() }).where(eq(brandRequests.id, id));
    return 'withdrawn' as const;
  });
}

// ---------------------------------------------------------------------------
// Lists

export async function orgRequests(db: DbOrTx, ctx: Pick<Ctx, 'ability'>, orgId: string) {
  if (!ctx.ability.can('read', brSubject(orgId))) throw forbidden();
  return db
    .select({ id: brandRequests.id, brandName: brands.name, relation: brandRequests.relation, brandKind: brandRequests.brandKind, status: brandRequests.status, categories: sql<number>`cardinality(${brandRequests.categoryNodeIds})`, createdAt: brandRequests.createdAt, submittedAt: brandRequests.submittedAt, decidedAt: brandRequests.decidedAt })
    .from(brandRequests)
    .innerJoin(brands, eq(brands.id, brandRequests.brandId))
    .where(eq(brandRequests.orgId, orgId))
    .orderBy(desc(brandRequests.createdAt));
}

export { titleOf as requestTitle };
