import { eq } from 'drizzle-orm';
import { brandRequests, vendorAssessments, type Database, type DbOrTx } from '@orbita/db';
import { forbidden, notFound } from '@orbita/domain';
import { subject } from '@orbita/authz';
import { assignTasks, definitionFor, requestDetail } from '@orbita/reviews';
import { CASE_SPECS, caseDetail, caseQueue, staffWithRole, type CaseSubject, type CaseView, type Ctx } from '@orbita/sellers';

/** The organisation a reviewed subject belongs to. */
export async function orgOfSubject(db: DbOrTx, subjectType: CaseSubject, subjectId: string): Promise<string | null> {
  if (subjectType === 'seller_org') return subjectId;
  if (subjectType === 'vendor_assessment') return (await db.select({ o: vendorAssessments.orgId }).from(vendorAssessments).where(eq(vendorAssessments.id, subjectId)))[0]?.o ?? null;
  return (await db.select({ o: brandRequests.orgId }).from(brandRequests).where(eq(brandRequests.id, subjectId)))[0]?.o ?? null;
}

export async function sellerQueue(db: DbOrTx, ctx: Ctx, subjectType: CaseSubject, view: CaseView) {
  return caseQueue(db, ctx, CASE_SPECS[subjectType], view, (id) => orgOfSubject(db, subjectType, id));
}

/** Everything escalated to approvers, across seller verification, vendor assessments and brands. */
export async function escalations(db: DbOrTx, ctx: Ctx) {
  const out = [];
  for (const s of ['seller_org', 'vendor_assessment', 'brand_request'] as const) {
    if (!ctx.ability.can('read', CASE_SPECS[s].abilitySubject)) continue;
    for (const r of await sellerQueue(db, ctx, s, 'escalated')) out.push({ ...r, kind: CASE_SPECS[s].noun });
  }
  return out.sort((a, b) => (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0));
}

export async function sellerCase(db: DbOrTx, ctx: Ctx, subjectType: CaseSubject, requestId: string) {
  const d = await requestDetail(db, requestId);
  if (d.request.subjectType !== subjectType) throw notFound('Review');
  const orgId = await orgOfSubject(db, subjectType, d.request.subjectId);
  if (!orgId) throw notFound('Review');
  if (!ctx.ability.can('read', subject(CASE_SPECS[subjectType].abilitySubject, { orgId })) && !ctx.ability.can('read', 'Escalation')) throw forbidden();
  return { orgId, ...(await caseDetail(db, ctx, CASE_SPECS[subjectType], requestId, orgId)) };
}

/** Pick up a case (or move it, for platform admins and approvers): only people holding the stage's role qualify. */
export async function claimCases(deps: { db: Database }, ctx: Ctx, subjectType: CaseSubject, requestIds: string[], assigneeId: string) {
  const def = await definitionFor(deps.db, subjectType);
  return assignTasks(deps, ctx, requestIds, assigneeId, async (tx, r) => {
    const d = await requestDetail(tx, r.id);
    const stage = def.stages.find((s) => s.key === d.openTask?.stage);
    const role = stage?.role === 'approver' ? 'approver' : 'reviewer';
    return (await staffWithRole(tx, role)).includes(assigneeId) ? null : `this stage needs a${role === 'approver' ? 'n approver' : ' reviewer'}`;
  });
}
