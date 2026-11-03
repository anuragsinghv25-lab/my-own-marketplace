import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { recordAudit } from '@orbita/audit';
import { subject, type RoleKey } from '@orbita/authz';
import { profiles, roleGrants, type DbOrTx, type ReviewRequest } from '@orbita/db';
import { conflict, forbidden, notFound } from '@orbita/domain';
import { notify } from '@orbita/notifications';
import { activeRequestFor, decide, definitionFor, listRequests, openAttempt, openTask, requestDetail, respond, type DecisionKind } from '@orbita/reviews';
import type { Ctx } from './context';

/**
 * Seller-side cases (seller verification, vendor assessment, brand requests) share one lean path:
 * a reviewer decides, asks the seller for more, or escalates; an approver decides escalations.
 * Each subject module supplies a CaseSpec and applies its own side effects.
 */
export type CaseStatus = 'draft' | 'submitted' | 'info_requested' | 'escalated' | 'approved' | 'partially_approved' | 'rejected' | 'withdrawn';
export type CaseSubject = 'seller_org' | 'vendor_assessment' | 'brand_request';

export interface CaseSpec {
  subjectType: CaseSubject;
  /** the ability subject reviewers need `approve` on */
  abilitySubject: 'SellerOrg' | 'VendorAssessment' | 'BrandRequest';
  /** e.g. "seller verification" */
  noun: string;
  /** reviewer page for a request */
  reviewLink: (requestId: string) => string;
  /** seller page for the subject */
  sellerLink: (subjectId: string) => string;
}

export const CASE_SPECS: Record<CaseSubject, CaseSpec> = {
  seller_org: { subjectType: 'seller_org', abilitySubject: 'SellerOrg', noun: 'seller verification', reviewLink: (id) => `/reviews/sellers/${id}`, sellerLink: () => '/seller/organisation' },
  vendor_assessment: { subjectType: 'vendor_assessment', abilitySubject: 'VendorAssessment', noun: 'vendor assessment', reviewLink: (id) => `/reviews/vendors/${id}`, sellerLink: () => '/seller/vendor-assessment' },
  brand_request: { subjectType: 'brand_request', abilitySubject: 'BrandRequest', noun: 'brand request', reviewLink: (id) => `/reviews/brands/${id}`, sellerLink: (id) => `/seller/brands/requests/${id}` },
};

/** Active people holding a role in an organisation (seller admins and staff by default). */
export async function orgPeople(db: DbOrTx, orgId: string, roles: RoleKey[] = ['seller_admin', 'seller_staff']) {
  const rows = await db
    .selectDistinct({ id: profiles.id })
    .from(roleGrants)
    .innerJoin(profiles, eq(profiles.id, roleGrants.userId))
    .where(and(inArray(roleGrants.role, roles), eq(roleGrants.scopeType, 'org'), eq(roleGrants.scopeId, orgId), isNull(roleGrants.revokedAt), or(eq(profiles.status, 'active'), eq(profiles.status, 'invited'))));
  return rows.map((r) => r.id);
}

/** Active platform staff holding a role (reviewers or approvers). */
export async function staffWithRole(db: DbOrTx, role: 'reviewer' | 'approver') {
  const rows = await db
    .selectDistinct({ id: profiles.id })
    .from(roleGrants)
    .innerJoin(profiles, eq(profiles.id, roleGrants.userId))
    .where(and(eq(roleGrants.role, role), isNull(roleGrants.revokedAt), eq(profiles.status, 'active')));
  return rows.map((r) => r.id);
}

/** Why this person cannot act on the stage, or null. Reviewers take the first stage, approvers escalations. */
export function whyNotStage(ctx: Pick<Ctx, 'ability'>, spec: CaseSpec, stageRole: string | undefined, orgId: string): string | null {
  if (!stageRole) return 'Nothing is waiting for a decision.';
  if (stageRole === 'approver') return ctx.ability.can('approve', 'Escalation') ? null : 'This was escalated: an approver decides it.';
  const reviewer = ctx.ability.can('create', 'Escalation') && ctx.ability.can('approve', subject(spec.abilitySubject, { orgId }));
  return reviewer ? null : 'A reviewer decides this.';
}

export interface SubmitCaseInput {
  subjectId: string;
  orgId: string;
  title: string;
}

/** Opens (or reopens) the review for a subject and tells the reviewers. */
export async function submitCase(tx: DbOrTx, ctx: Ctx, spec: CaseSpec, s: SubmitCaseInput) {
  const { request, task } = await openAttempt(tx, { subjectType: spec.subjectType, subjectId: s.subjectId, title: s.title, workgroupId: null, submittedBy: ctx.actor.id });
  await recordAudit(tx, ctx, {
    action: `${spec.subjectType}.submitted`,
    subjectType: spec.subjectType,
    subjectId: s.subjectId,
    summary: `${ctx.actor.email} submitted ${s.title} for ${spec.noun}${request.attempt > 1 ? ` (attempt ${request.attempt})` : ''}`,
    after: { requestId: request.id, attempt: request.attempt },
  });
  await notify(tx, task.assigneeId ? [task.assigneeId] : await staffWithRole(tx, 'reviewer'), {
    kind: `${spec.subjectType}.submitted`,
    title: `${s.title} is waiting for ${spec.noun}`,
    body: `Submitted by ${ctx.actor.fullName || ctx.actor.email}.`,
    link: spec.reviewLink(request.id),
    subjectType: 'review_request',
    subjectId: request.id,
  }, { except: ctx.actor.id });
  return request;
}

export interface CaseDecisionInput {
  decision: Exclude<DecisionKind, 'send_back' | 'discard' | 'withdraw'>;
  reasonCode?: string | null;
  note?: string;
  fileIds?: string[];
}

const STATUS_AFTER: Record<CaseDecisionInput['decision'], CaseStatus> = { approve: 'approved', reject: 'rejected', request_info: 'info_requested', escalate: 'escalated' };
const WORDS: Record<CaseDecisionInput['decision'], string> = { approve: 'approved', reject: 'rejected', request_info: 'asked for more information on', escalate: 'escalated' };

/**
 * A reviewer's or approver's decision on the open stage. Returns the new case status; the subject
 * module applies what the status means (grants, approvals, blocks) in the same transaction.
 */
export async function decideCase(tx: DbOrTx, ctx: Ctx, spec: CaseSpec, s: SubmitCaseInput, input: CaseDecisionInput) {
  const request = await activeRequestFor(tx, spec.subjectType, s.subjectId);
  if (!request || request.state !== 'open') throw conflict(`This ${spec.noun} is not waiting for a decision.`);
  if (request.awaitingReplySince) throw conflict('This is waiting for a reply from the seller.');
  const task = await openTask(tx, request.id);
  const def = await definitionFor(tx, spec.subjectType);
  const stage = def.stages.find((x) => x.key === task?.stage);
  const why = whyNotStage(ctx, spec, stage?.role, s.orgId);
  if (why) throw forbidden(why);
  const res = await decide(tx, { requestId: request.id, decision: input.decision, reasonCode: input.reasonCode, note: input.note, fileIds: input.fileIds, by: ctx.actor.id });
  const status = STATUS_AFTER[input.decision];
  await recordAudit(tx, ctx, {
    action: `${spec.subjectType}.${input.decision}`,
    subjectType: spec.subjectType,
    subjectId: s.subjectId,
    summary: `${ctx.actor.email} ${WORDS[input.decision]} ${s.title}${res.reason ? `: ${res.reason.label}` : ''}`,
    after: { status, reason: res.reason?.code ?? null, note: input.note?.trim() || null },
  });
  const sellers = await orgPeople(tx, s.orgId);
  if (input.decision === 'escalate') {
    await notify(tx, await staffWithRole(tx, 'approver'), { kind: `${spec.subjectType}.escalated`, title: `Escalated: ${s.title}`, body: `${res.reason?.label ?? ''}. ${input.note?.trim() ?? ''}`.trim(), link: spec.reviewLink(request.id) }, { except: ctx.actor.id });
  } else {
    const title = { approve: `${s.title}: approved`, reject: `${s.title}: rejected`, request_info: `${s.title}: more information needed` }[input.decision];
    await notify(tx, sellers, { kind: `${spec.subjectType}.${input.decision}`, title, body: [res.reason?.label, input.note?.trim()].filter(Boolean).join('. '), link: spec.sellerLink(s.subjectId) });
  }
  return { request: res.request, status, reason: res.reason, final: res.final };
}

/** The seller answers an information request. */
export async function respondCase(tx: DbOrTx, ctx: Ctx, spec: CaseSpec, s: SubmitCaseInput, reply: { note: string; fileIds?: string[] }) {
  if (!ctx.ability.can('update', subject('SellerOrg', { orgId: s.orgId })) && !ctx.ability.can('update', subject(spec.abilitySubject, { orgId: s.orgId }))) throw forbidden();
  const request = await activeRequestFor(tx, spec.subjectType, s.subjectId);
  if (!request) throw notFound('Review');
  const { task } = await respond(tx, { requestId: request.id, by: ctx.actor.id, note: reply.note, fileIds: reply.fileIds });
  const def = await definitionFor(tx, spec.subjectType);
  const stage = def.stages.find((x) => x.key === task.stage);
  await recordAudit(tx, ctx, { action: `${spec.subjectType}.responded`, subjectType: spec.subjectType, subjectId: s.subjectId, summary: `${ctx.actor.email} answered the information request on ${s.title}` });
  await notify(tx, task.assigneeId ? [task.assigneeId] : await staffWithRole(tx, stage?.role === 'approver' ? 'approver' : 'reviewer'), { kind: `${spec.subjectType}.responded`, title: `${s.title}: the seller replied`, body: reply.note.slice(0, 200), link: spec.reviewLink(request.id) });
  return stage?.escalationOnly ? ('escalated' as const) : ('submitted' as const);
}

/** Withdraw before a decision (the seller changed their mind). */
export async function withdrawCase(tx: DbOrTx, ctx: Ctx, spec: CaseSpec, s: SubmitCaseInput) {
  const request = await activeRequestFor(tx, spec.subjectType, s.subjectId);
  if (!request || request.state !== 'open') throw conflict('There is nothing to withdraw.');
  await decide(tx, { requestId: request.id, decision: 'withdraw', note: 'Withdrawn by the seller', by: ctx.actor.id });
  await recordAudit(tx, ctx, { action: `${spec.subjectType}.withdrawn`, subjectType: spec.subjectType, subjectId: s.subjectId, summary: `${ctx.actor.email} withdrew ${s.title}` });
}

// ---------------------------------------------------------------------------
// Queues and detail for the review desk

export type CaseView = 'queue' | 'mine' | 'all' | 'escalated';

export async function caseQueue(db: DbOrTx, ctx: Ctx, spec: CaseSpec, view: CaseView, orgOf: (subjectId: string) => Promise<string | null>) {
  if (!ctx.ability.can('read', spec.abilitySubject) && !ctx.ability.can('read', 'Escalation')) throw forbidden();
  const def = await definitionFor(db, spec.subjectType);
  const rows = await listRequests(db, { subjectType: spec.subjectType, view: view === 'escalated' ? 'all' : view, actorId: ctx.actor.id, states: view === 'escalated' ? ['open'] : undefined });
  const out = [];
  for (const r of rows) {
    const stage = def.stages.find((x) => x.key === r.stage);
    const orgId = (await orgOf(r.subjectId)) ?? '';
    const canDecide = r.state === 'open' && !r.awaitingReplySince && !whyNotStage(ctx, spec, stage?.role, orgId);
    if (view === 'queue' && !canDecide) continue;
    if (view === 'escalated' && !stage?.escalationOnly) continue;
    out.push({ ...r, stageLabel: stage?.label ?? null, escalated: !!stage?.escalationOnly, waitingOnSeller: !!r.awaitingReplySince, canDecide, link: spec.reviewLink(r.id) });
  }
  return out;
}
export type CaseRow = Awaited<ReturnType<typeof caseQueue>>[number];

export async function caseDetail(db: DbOrTx, ctx: Ctx, spec: CaseSpec, requestId: string, orgId: string) {
  const d = await requestDetail(db, requestId);
  if (d.request.subjectType !== spec.subjectType) throw notFound('Review');
  const stage = d.definition.stages.find((x) => x.key === d.openTask?.stage);
  const open = d.request.state === 'open' && !d.request.awaitingReplySince;
  const why = open ? whyNotStage(ctx, spec, stage?.role, orgId) : null;
  return {
    ...d,
    stage: stage ?? null,
    canDecide: open && !why,
    whyNot: why,
    overdue: open && !!d.openTask && d.openTask.dueAt.getTime() < Date.now(),
    canEscalate: open && !why && d.definition.stages.some((x, i) => x.escalationOnly && i > d.definition.stages.findIndex((y) => y.key === stage?.key)),
    canClaim: open && !why && d.openTask?.assigneeId !== ctx.actor.id && !d.openTask?.assigneeId,
    reasons: d.definition.reasonCodes,
  };
}
export type CaseDetail = Awaited<ReturnType<typeof caseDetail>>;

/** The seller-facing review status, with what the reviewer last said. */
export async function caseTimeline(db: DbOrTx, spec: CaseSpec, subjectId: string): Promise<{ request: ReviewRequest; detail: Awaited<ReturnType<typeof requestDetail>> } | null> {
  const r = await activeRequestFor(db, spec.subjectType, subjectId);
  if (!r) return null;
  return { request: r, detail: await requestDetail(db, r.id) };
}
