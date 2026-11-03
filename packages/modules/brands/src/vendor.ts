import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { recordAudit } from '@orbita/audit';
import { subject } from '@orbita/authz';
import { brands, orgAddresses, roleGrants, vendorAssessments, type Database, type DbOrTx, type VendorAssessment } from '@orbita/db';
import { badRequest, conflict, forbidden, notFound, preconditionFailed } from '@orbita/domain';
import { assertOwnFiles, assertVerified, CASE_SPECS, decideCase, loadOrg, orgPeople, respondCase, submitCase, withdrawCase, type CaseDecisionInput, type Ctx } from '@orbita/sellers';
import { brandForName, brandName, checkBrandName } from './names';

/**
 * Vendor assessment: an organisation shows it makes the products of some brands (OEM, deemed OEM or
 * OEM fabricator). Approval makes those brands its own, approves its manufacturing addresses and gives
 * its seller admins brand-owner powers (authorise resellers, approve their catalogs in R5).
 */
const vaSubject = (orgId: string) => subject('VendorAssessment', { orgId });

export const vaInput = z.object({
  oemType: z.enum(['oem', 'deemed_oem', 'oem_fabricator']),
  brandNames: z.array(brandName).max(20, 'Up to 20 brands per assessment.').default([]),
  addressIds: z.array(z.uuid()).default([]),
  fileIds: z.array(z.uuid()).default([]),
  description: z.string().trim().max(2000).default(''),
});
export type VaInput = z.input<typeof vaInput>;

const OEM_LABEL = { oem: 'OEM', deemed_oem: 'deemed OEM', oem_fabricator: 'OEM fabricator' } as const;
const titleOf = (orgName: string, va: Pick<VendorAssessment, 'oemType' | 'brandNames'>) => `${orgName} · ${OEM_LABEL[va.oemType]} for ${va.brandNames.join(', ') || 'no brands yet'}`;

export async function loadVa(db: DbOrTx, id: string) {
  const [va] = await db.select().from(vendorAssessments).where(eq(vendorAssessments.id, id));
  if (!va) throw notFound('Vendor assessment');
  return va;
}

export async function orgAssessments(db: DbOrTx, ctx: Pick<Ctx, 'ability'>, orgId: string) {
  if (!ctx.ability.can('read', vaSubject(orgId))) throw forbidden();
  return db.select().from(vendorAssessments).where(eq(vendorAssessments.orgId, orgId)).orderBy(desc(vendorAssessments.createdAt));
}

/** Creates or updates the organisation's draft assessment (only drafts and answered info requests change). */
export async function saveAssessment(deps: { db: Database }, ctx: Ctx, orgId: string, id: string | null, raw: VaInput) {
  if (!ctx.ability.can('update', vaSubject(orgId))) throw forbidden('Only a seller admin prepares the vendor assessment.');
  const v = vaInput.parse(raw);
  return deps.db.transaction(async (tx) => {
    await assertOwnFiles(tx, orgId, v.fileIds);
    if (v.addressIds.length) {
      const own = await tx.select({ id: orgAddresses.id }).from(orgAddresses).where(and(eq(orgAddresses.orgId, orgId), eq(orgAddresses.kind, 'manufacturing'), inArray(orgAddresses.id, v.addressIds)));
      if (own.length !== new Set(v.addressIds).size) throw badRequest('Pick manufacturing addresses of your organisation.');
    }
    for (const n of v.brandNames) {
      const c = await checkBrandName(tx, n);
      if (!c.ok) throw badRequest(c.problem!);
      if (c.existing?.ownerOrgId && c.existing.ownerOrgId !== orgId) throw conflict(`${c.existing.name} already belongs to ${c.existing.ownerName}. Ask them for an authorisation instead.`);
    }
    if (id) {
      const [cur] = await tx.select().from(vendorAssessments).where(and(eq(vendorAssessments.id, id), eq(vendorAssessments.orgId, orgId))).for('update');
      if (!cur) throw notFound('Vendor assessment');
      if (cur.status !== 'draft') throw conflict('Only a draft can be changed. Answer the reviewer instead.');
      const [row] = await tx.update(vendorAssessments).set(v).where(eq(vendorAssessments.id, id)).returning();
      return row!;
    }
    const [open] = await tx.select({ id: vendorAssessments.id }).from(vendorAssessments).where(and(eq(vendorAssessments.orgId, orgId), inArray(vendorAssessments.status, ['draft', 'submitted', 'info_requested', 'escalated'])));
    if (open) throw conflict('Your organisation already has an assessment in progress.');
    const [row] = await tx.insert(vendorAssessments).values({ orgId, ...v, createdBy: ctx.actor.id }).returning();
    await recordAudit(tx, ctx, { action: 'vendor_assessment.created', subjectType: 'vendor_assessment', subjectId: row!.id, summary: `${ctx.actor.email} started a vendor assessment as ${OEM_LABEL[v.oemType]}` });
    return row!;
  });
}

export function assessmentProblems(va: VendorAssessment, addresses: number): string[] {
  const p: string[] = [];
  if (!va.brandNames.length) p.push('Name at least one brand you make.');
  if (!va.addressIds.length && !addresses) p.push('Add a manufacturing address (Organisation → Addresses), then pick it here.');
  else if (!va.addressIds.length) p.push('Pick at least one manufacturing address.');
  if (!va.fileIds.length) p.push('Attach evidence that you manufacture (factory licence, BIS registration, production photos or invoices).');
  return p;
}

export async function submitAssessment(deps: { db: Database }, ctx: Ctx, id: string) {
  return deps.db.transaction(async (tx) => {
    const [va] = await tx.select().from(vendorAssessments).where(eq(vendorAssessments.id, id)).for('update');
    if (!va) throw notFound('Vendor assessment');
    if (!ctx.ability.can('submit', vaSubject(va.orgId))) throw forbidden();
    if (va.status !== 'draft') throw conflict('This assessment has already been submitted.');
    const org = await assertVerified(tx, va.orgId);
    const addrs = await tx.select({ id: orgAddresses.id }).from(orgAddresses).where(and(eq(orgAddresses.orgId, va.orgId), eq(orgAddresses.kind, 'manufacturing')));
    const problems = assessmentProblems(va, addrs.length);
    if (problems.length) throw preconditionFailed(problems.join(' '), { problems });
    await submitCase(tx, ctx, CASE_SPECS.vendor_assessment, { subjectId: id, orgId: va.orgId, title: titleOf(org.legalName, va) });
    await tx.update(vendorAssessments).set({ status: 'submitted', submittedAt: new Date() }).where(eq(vendorAssessments.id, id));
  });
}

/** Gives the organisation's seller admins brand-owner powers over a brand (idempotent). */
export async function grantBrandOwner(tx: DbOrTx, orgId: string, brandId: string, by: string | null) {
  const admins = await orgPeople(tx, orgId, ['seller_admin']);
  for (const userId of admins) {
    const [has] = await tx.select({ id: roleGrants.id }).from(roleGrants).where(and(eq(roleGrants.userId, userId), eq(roleGrants.role, 'brand_owner'), eq(roleGrants.scopeType, 'brand'), eq(roleGrants.scopeId, brandId), isNull(roleGrants.revokedAt)));
    if (!has) await tx.insert(roleGrants).values({ userId, role: 'brand_owner', scopeType: 'brand', scopeId: brandId, grantedBy: by });
  }
}

export async function decideAssessment(deps: { db: Database }, ctx: Ctx, id: string, input: CaseDecisionInput) {
  return deps.db.transaction(async (tx) => {
    const [va] = await tx.select().from(vendorAssessments).where(eq(vendorAssessments.id, id)).for('update');
    if (!va) throw notFound('Vendor assessment');
    const org = await loadOrg(tx, va.orgId);
    const res = await decideCase(tx, ctx, CASE_SPECS.vendor_assessment, { subjectId: id, orgId: va.orgId, title: titleOf(org.legalName, va) }, input);
    await tx.update(vendorAssessments).set({ status: res.status, decisionNote: input.note?.trim() || null, decidedAt: res.final ? new Date() : null }).where(eq(vendorAssessments.id, id));
    if (res.status === 'approved') {
      if (va.addressIds.length) await tx.update(orgAddresses).set({ approved: true }).where(inArray(orgAddresses.id, va.addressIds));
      const owned: string[] = [];
      for (const name of va.brandNames) {
        const b = await brandForName(tx, name, ctx.actor.id);
        if (b.ownerOrgId && b.ownerOrgId !== va.orgId) throw conflict(`${b.name} belongs to another organisation now; reject or ask the seller to remove it.`);
        await tx.update(brands).set({ ownerOrgId: va.orgId, status: 'active' }).where(eq(brands.id, b.id));
        await grantBrandOwner(tx, va.orgId, b.id, ctx.actor.id);
        owned.push(b.name);
      }
      await recordAudit(tx, ctx, { action: 'brand.owner_set', subjectType: 'seller_org', subjectId: va.orgId, summary: `${org.legalName} now owns ${owned.join(', ')} and can authorise resellers`, after: { brands: owned } });
    }
    return res.status;
  });
}

export async function respondAssessment(deps: { db: Database }, ctx: Ctx, id: string, reply: { note: string; fileIds?: string[] }) {
  return deps.db.transaction(async (tx) => {
    const va = await loadVa(tx, id);
    if (va.status !== 'info_requested') throw conflict('Nobody is waiting for a reply on this assessment.');
    await assertOwnFiles(tx, va.orgId, reply.fileIds ?? []);
    const org = await loadOrg(tx, va.orgId);
    const status = await respondCase(tx, ctx, CASE_SPECS.vendor_assessment, { subjectId: id, orgId: va.orgId, title: titleOf(org.legalName, va) }, reply);
    if (reply.fileIds?.length) await tx.update(vendorAssessments).set({ fileIds: [...new Set([...va.fileIds, ...reply.fileIds])] }).where(eq(vendorAssessments.id, id));
    await tx.update(vendorAssessments).set({ status }).where(eq(vendorAssessments.id, id));
  });
}

export async function withdrawAssessment(deps: { db: Database }, ctx: Ctx, id: string) {
  return deps.db.transaction(async (tx) => {
    const va = await loadVa(tx, id);
    if (!ctx.ability.can('update', vaSubject(va.orgId))) throw forbidden();
    if (va.status === 'draft') {
      await tx.delete(vendorAssessments).where(eq(vendorAssessments.id, id));
      return;
    }
    if (!['submitted', 'info_requested'].includes(va.status)) throw conflict('It is too late to withdraw this assessment.');
    const org = await loadOrg(tx, va.orgId);
    await withdrawCase(tx, ctx, CASE_SPECS.vendor_assessment, { subjectId: id, orgId: va.orgId, title: titleOf(org.legalName, va) });
    await tx.update(vendorAssessments).set({ status: 'withdrawn' }).where(eq(vendorAssessments.id, id));
  });
}

export { titleOf as assessmentTitle };
