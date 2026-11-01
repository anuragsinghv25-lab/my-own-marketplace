import { and, desc, eq, gt, inArray, isNull, lte, or } from 'drizzle-orm';
import { z } from 'zod';
import { recordAudit } from '@orbita/audit';
import { loadVersion, versionSubject, type Ctx, type VersionRef } from '@orbita/category-config';
import { subject } from '@orbita/authz';
import { compareContracts } from '@orbita/contract';
import {
  categoryNodes,
  categorySchedules,
  categoryStatusHistory,
  categoryVersions,
  type Database,
  type DbOrTx,
} from '@orbita/db';
import { badRequest, forbidden, notFound } from '@orbita/domain';
import { notify } from '@orbita/notifications';
import { activeRequestFor, addComment, assignTasks, listRequests, markEscalated, markReminded, requestDetail, resolveComment, slaDue, type QueueRow } from '@orbita/reviews';
import { approvedContract, contractById, eligibleApprovers, promoteDue, SUBJECT, submissionReadiness, whyCannotApprove, type PublishingDeps } from './lifecycle';
import { computeStatus, todayIn, type OpStatus } from './status';

const nodeSubject = (v: Pick<VersionRef, 'workgroupId'>) => subject('CategoryNode', { workgroupId: v.workgroupId });

// ---------------------------------------------------------------------------
// Queues

export type DeskView = 'queue' | 'mine' | 'all';

export async function reviewQueue(db: DbOrTx, ctx: Pick<Ctx, 'actor' | 'ability'>, view: DeskView, opts: { overdueOnly?: boolean } = {}) {
  if (!ctx.ability.can('read', 'ReviewRequest')) throw forbidden();
  const rows = await listRequests(db, { subjectType: SUBJECT, view, actorId: ctx.actor.id, overdueOnly: opts.overdueOnly });
  const out: (QueueRow & { versionState: string; canDecide: boolean; mineToSkip: boolean })[] = [];
  for (const r of rows) {
    const v = await loadVersion(db, r.subjectId).catch(() => null);
    if (!v || !ctx.ability.can('read', versionSubject(v))) continue;
    const canDecide = !whyCannotApprove(ctx, v);
    // the open queue lists what this person could pick up; "all" lists everything they may see
    if (view === 'queue' && !canDecide) continue;
    out.push({ ...r, versionState: v.state, canDecide, mineToSkip: v.editorIds.includes(ctx.actor.id) || v.submittedBy === ctx.actor.id });
  }
  return out;
}

export async function deskCounts(db: DbOrTx, ctx: Pick<Ctx, 'actor' | 'ability'>) {
  if (!ctx.ability.can('read', 'ReviewRequest')) return null;
  const [queue, mine] = await Promise.all([reviewQueue(db, ctx, 'queue'), reviewQueue(db, ctx, 'mine')]);
  return { queue: queue.length, mine: mine.length, overdue: [...queue, ...mine].filter((r) => r.overdue).length };
}

// ---------------------------------------------------------------------------
// One request, everything the approver (and the category team) needs

export async function reviewWorkspace(db: DbOrTx, ctx: Pick<Ctx, 'actor' | 'ability'>, requestId: string) {
  const detail = await requestDetail(db, requestId);
  if (detail.request.subjectType !== SUBJECT) throw notFound('Review request');
  const v = await loadVersion(db, detail.request.subjectId);
  if (!ctx.ability.can('read', versionSubject(v)) || !ctx.ability.can('read', 'ReviewRequest')) throw forbidden();

  const attempts = [...new Set(detail.tasks.map((t) => t.attempt))].sort((a, b) => a - b);
  const snapOf = (attempt: number) => detail.tasks.filter((t) => t.attempt === attempt).at(-1)?.snapshotId ?? null;
  const current = await contractById(db, snapOf(detail.request.attempt));
  const previousAttempt = attempts.filter((a) => a < detail.request.attempt).at(-1);
  const previous = previousAttempt ? await contractById(db, snapOf(previousAttempt)) : null;

  // the version sellers have now (another version of the same category)
  const [live] = await db
    .select({ id: categoryVersions.id, number: categoryVersions.version })
    .from(categoryVersions)
    .where(and(eq(categoryVersions.nodeId, v.nodeId), eq(categoryVersions.state, 'PUBLISHED')));
  const liveContract = live && live.id !== v.id ? await approvedContract(db, live.id) : null;

  const schedule = (await db.select().from(categorySchedules).where(eq(categorySchedules.versionId, v.id)))[0] ?? null;
  const why = whyCannotApprove(ctx, v);
  const isOpen = detail.request.state === 'open';
  return {
    ...detail,
    version: { id: v.id, number: v.number, state: v.state, node: v.node, assigneeId: v.assigneeId, submittedBy: v.submittedBy },
    contract: current?.contract ?? null,
    contractHash: current?.hash ?? null,
    changes: {
      sincePrevious: previous && current ? compareContracts(previous.contract, current.contract) : null,
      previousAttempt: previousAttempt ?? null,
      sinceLive: current ? compareContracts(liveContract?.contract ?? null, current.contract) : null,
      liveNumber: liveContract ? live!.number : null,
    },
    schedule,
    overdue: isOpen && !!detail.openTask && detail.openTask.dueAt.getTime() < Date.now(),
    canDecide: isOpen && !why,
    whyNot: isOpen ? why : null,
    canComment: (isOpen || detail.request.state === 'sent_back') && ctx.ability.can('comment', 'ReviewRequest'),
    canAssign: isOpen && ctx.ability.can('assign', 'ReviewRequest'),
    canClaim: isOpen && !why && detail.openTask?.assigneeId !== ctx.actor.id && (!detail.openTask?.assigneeId || ctx.ability.can('assign', 'ReviewRequest')),
    approvers: isOpen ? await eligibleApprovers(db, v) : [],
  };
}
export type ReviewWorkspace = Awaited<ReturnType<typeof reviewWorkspace>>;

/** Claim (assign to yourself) or transfer reviews, individually or in bulk. */
export async function assignReviews(deps: PublishingDeps, ctx: Ctx, requestIds: string[], assigneeId: string) {
  const res = await assignTasks(deps, ctx, requestIds, assigneeId, async (tx, r) => {
    if (r.subjectType !== SUBJECT) return 'not a category version';
    const v = await loadVersion(tx, r.subjectId);
    const ok = (await eligibleApprovers(tx, v)).some((a) => a.id === assigneeId);
    return ok ? null : 'they edited or submitted it, or approve a different part of the tree';
  });
  if (assigneeId !== ctx.actor.id && res.moved.length)
    await deps.db.transaction((tx) =>
      notify(tx, [assigneeId], {
        kind: 'review.assigned',
        title: res.moved.length === 1 ? `${res.moved[0]!.title} is assigned to you` : `${res.moved.length} category versions are assigned to you`,
        body: `${ctx.actor.fullName || ctx.actor.email} assigned ${res.moved.length === 1 ? 'it' : 'them'} to you for approval.`,
        link: res.moved.length === 1 ? `/reviews/${res.moved[0]!.id}` : '/reviews?view=mine',
      }),
    );
  return res;
}

export async function commentOnReview(deps: PublishingDeps, ctx: Ctx, requestId: string, input: { fieldKey?: string | null; fieldLabel?: string | null; body: string }) {
  return deps.db.transaction(async (tx) => {
    const detail = await requestDetail(tx, requestId);
    const v = await loadVersion(tx, detail.request.subjectId);
    if (!ctx.ability.can('read', versionSubject(v))) throw forbidden();
    const row = await addComment(tx, ctx, detail.request, input);
    await recordAudit(tx, ctx, {
      action: 'review.commented',
      subjectType: 'review_request',
      subjectId: requestId,
      summary: `${ctx.actor.email} commented on ${input.fieldLabel ? `${input.fieldLabel} in ` : ''}${detail.request.title}`,
      after: { fieldKey: row.fieldKey, body: row.body },
    });
    // the category team answering goes to the approver handling it
    if (ctx.actor.id === v.assigneeId || v.editorIds.includes(ctx.actor.id))
      await notify(tx, [detail.openTask?.assigneeId], { kind: 'review.comment', title: `New comment on ${detail.request.title}`, body: row.body.slice(0, 200), link: `/reviews/${requestId}` }, { except: ctx.actor.id });
    return row;
  });
}

export async function resolveReviewComment(deps: PublishingDeps, ctx: Ctx, requestId: string, commentId: string, resolved: boolean) {
  return deps.db.transaction(async (tx) => {
    const detail = await requestDetail(tx, requestId);
    const v = await loadVersion(tx, detail.request.subjectId);
    if (!ctx.ability.can('read', versionSubject(v))) throw forbidden();
    return resolveComment(tx, ctx, requestId, commentId, resolved);
  });
}

/** The review attached to a version, for the studio's Review tab. */
export async function versionReview(db: DbOrTx, ctx: Pick<Ctx, 'actor' | 'ability'>, versionId: string) {
  const v = await loadVersion(db, versionId);
  if (!ctx.ability.can('read', versionSubject(v))) throw forbidden();
  const r = await activeRequestFor(db, SUBJECT, versionId);
  const readiness = ['DRAFT', 'SENT_BACK'].includes(v.state) ? await submissionReadiness(db, v) : null;
  const detail = r ? await requestDetail(db, r.id) : null;
  const schedule = (await db.select().from(categorySchedules).where(eq(categorySchedules.versionId, versionId)))[0] ?? null;
  return {
    detail,
    readiness,
    schedule,
    canSubmit: ctx.ability.can('submit', versionSubject(v)),
    canWithdraw: ctx.ability.can('withdraw', versionSubject(v)),
    canDiscard: ctx.ability.can('discard', versionSubject(v)),
    canReschedule: ctx.ability.can('schedule', versionSubject(v)),
    canComment: !!r && (r.state === 'open' || r.state === 'sent_back') && ctx.ability.can('comment', 'ReviewRequest'),
  };
}
export type VersionReview = Awaited<ReturnType<typeof versionReview>>;

// ---------------------------------------------------------------------------
// Category status

async function overrideNow(db: DbOrTx, nodeIds: string[], now: Date) {
  if (!nodeIds.length) return new Map<string, typeof categoryStatusHistory.$inferSelect>();
  const rows = await db
    .select()
    .from(categoryStatusHistory)
    .where(
      and(
        inArray(categoryStatusHistory.nodeId, nodeIds),
        isNull(categoryStatusHistory.cancelledAt),
        lte(categoryStatusHistory.startsAt, now),
        or(isNull(categoryStatusHistory.endsAt), gt(categoryStatusHistory.endsAt, now)),
      ),
    )
    .orderBy(desc(categoryStatusHistory.startsAt), desc(categoryStatusHistory.createdAt));
  const m = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!m.has(r.nodeId)) m.set(r.nodeId, r);
  return m;
}

/** Status of every listing category that has ever had a version, with what is live, scheduled and in progress. */
export async function categoryStatusList(db: DbOrTx, ctx: Pick<Ctx, 'actor' | 'ability'>, now = new Date()) {
  if (!ctx.ability.can('read', 'CategoryVersion')) throw forbidden();
  const today = todayIn(undefined, now);
  const versions = await db
    .select({ v: categoryVersions, s: categorySchedules, node: { id: categoryNodes.id, name: categoryNodes.name, code: categoryNodes.code } })
    .from(categoryVersions)
    .innerJoin(categoryNodes, eq(categoryNodes.id, categoryVersions.nodeId))
    .leftJoin(categorySchedules, eq(categorySchedules.versionId, categoryVersions.id))
    .where(eq(categoryNodes.kind, 'listing'))
    .orderBy(categoryNodes.name, desc(categoryVersions.version));
  const byNode = new Map<string, typeof versions>();
  for (const r of versions) byNode.set(r.node.id, [...(byNode.get(r.node.id) ?? []), r]);
  const overrides = await overrideNow(db, [...byNode.keys()], now);
  const upcoming = await db
    .select()
    .from(categoryStatusHistory)
    .where(and(isNull(categoryStatusHistory.cancelledAt), gt(categoryStatusHistory.startsAt, now)))
    .orderBy(categoryStatusHistory.startsAt);
  const out = [];
  for (const [nodeId, vs] of byNode) {
    const ref = await loadVersion(db, vs[0]!.v.id);
    if (!ctx.ability.can('read', versionSubject(ref))) continue;
    const pub = vs.find((x) => x.v.state === 'PUBLISHED');
    const sch = vs.find((x) => x.v.state === 'SCHEDULED' || x.v.state === 'APPROVED');
    const open = vs.find((x) => ['DRAFT', 'IN_REVIEW', 'SENT_BACK'].includes(x.v.state));
    const o = overrides.get(nodeId);
    const status = computeStatus({
      published: pub ? { number: pub.v.version, schedule: pub.s } : null,
      scheduled: sch?.s ? { number: sch.v.version, schedule: sch.s } : null,
      override: o ? { status: o.status, reason: o.reason, endsAt: o.endsAt } : null,
      catalogs: 0,
      today,
    });
    out.push({
      nodeId,
      name: ref.node.name,
      code: ref.node.code,
      path: ref.node.path,
      workgroupId: ref.workgroupId,
      status,
      override: o ?? null,
      upcoming: upcoming.filter((u) => u.nodeId === nodeId),
      live: pub ? { id: pub.v.id, number: pub.v.version, schedule: pub.s, canReschedule: ctx.ability.can('schedule', versionSubject({ ...ref, state: 'PUBLISHED' })) && !!pub.s && pub.s.buyerGoLive > today } : null,
      scheduled: sch ? { id: sch.v.id, number: sch.v.version, schedule: sch.s, canReschedule: ctx.ability.can('schedule', versionSubject({ ...ref, state: 'SCHEDULED' })) } : null,
      open: open ? { id: open.v.id, number: open.v.version, state: open.v.state } : null,
      canOperate: ctx.ability.can('operate', nodeSubject(ref)),
      canStartNext: !open && ctx.ability.can('create', versionSubject({ workgroupId: ref.workgroupId, state: 'DRAFT', editorIds: [] })),
    });
  }
  return out;
}

const statusInput = z.object({
  status: z.enum(['active', 'deactivated', 'down_for_buyers', 'down_for_sellers', 'maintenance']),
  reason: z.string().trim().min(5, 'Say why, in a few words.').max(300),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().nullable().optional(),
});

/** Downtime, maintenance windows and deactivation; "active" ends any override in force. */
export async function setCategoryStatus(deps: PublishingDeps, ctx: Ctx, nodeId: string, raw: z.input<typeof statusInput>, now = new Date()) {
  const p = statusInput.parse(raw);
  const startsAt = p.startsAt ?? now;
  if (p.endsAt && p.endsAt <= startsAt) throw badRequest('The end must be after the start.');
  return deps.db.transaction(async (tx) => {
    const [anyVersion] = await tx.select({ id: categoryVersions.id }).from(categoryVersions).where(eq(categoryVersions.nodeId, nodeId)).limit(1);
    if (!anyVersion) throw notFound('Listing category');
    const ref = await loadVersion(tx, anyVersion.id);
    if (!ctx.ability.can('operate', nodeSubject(ref))) throw forbidden('You cannot change the status of this category.');
    if (p.status === 'deactivated' && !ctx.ability.can('approve', 'CategoryVersion')) throw forbidden('Only an approver can deactivate a category.');
    if (p.status === 'active') {
      await tx
        .update(categoryStatusHistory)
        .set({ cancelledAt: now, cancelledBy: ctx.actor.id })
        .where(and(eq(categoryStatusHistory.nodeId, nodeId), isNull(categoryStatusHistory.cancelledAt), or(isNull(categoryStatusHistory.endsAt), gt(categoryStatusHistory.endsAt, now))));
    }
    const [row] = await tx
      .insert(categoryStatusHistory)
      .values({ nodeId, status: p.status as OpStatus, reason: p.reason, startsAt, endsAt: p.endsAt ?? null, setBy: ctx.actor.id })
      .returning();
    await recordAudit(tx, ctx, {
      action: 'category.status.set',
      subjectType: 'category_node',
      subjectId: nodeId,
      summary: `${ctx.actor.email} set ${ref.node.name} to ${p.status.replaceAll('_', ' ')}${p.startsAt && p.startsAt > now ? ` from ${startsAt.toISOString()}` : ''}${p.endsAt ? ` until ${p.endsAt.toISOString()}` : ''}: ${p.reason}`,
      after: { status: p.status, startsAt, endsAt: p.endsAt ?? null, reason: p.reason },
    });
    return row!;
  });
}

export async function cancelStatus(deps: PublishingDeps, ctx: Ctx, rowId: string) {
  return deps.db.transaction(async (tx) => {
    const [row] = await tx.select().from(categoryStatusHistory).where(eq(categoryStatusHistory.id, rowId)).for('update');
    if (!row || row.cancelledAt) throw notFound('Status change');
    const [anyVersion] = await tx.select({ id: categoryVersions.id }).from(categoryVersions).where(eq(categoryVersions.nodeId, row.nodeId)).limit(1);
    const ref = await loadVersion(tx, anyVersion!.id);
    if (!ctx.ability.can('operate', nodeSubject(ref))) throw forbidden();
    await tx.update(categoryStatusHistory).set({ cancelledAt: new Date(), cancelledBy: ctx.actor.id }).where(eq(categoryStatusHistory.id, rowId));
    await recordAudit(tx, ctx, {
      action: 'category.status.cancelled',
      subjectType: 'category_node',
      subjectId: row.nodeId,
      summary: `${ctx.actor.email} cancelled "${row.status.replaceAll('_', ' ')}" on ${ref.node.name}`,
      before: { status: row.status, startsAt: row.startsAt, endsAt: row.endsAt },
    });
  });
}

/** The published contract and status of a listing category, for the API and later the seller app. */
export async function liveCategory(db: DbOrTx, ctx: Pick<Ctx, 'actor' | 'ability'>, nodeId: string, now = new Date()) {
  const list = await categoryStatusList(db, ctx, now);
  const row = list.find((r) => r.nodeId === nodeId);
  if (!row) throw notFound('Listing category');
  const contract = row.live ? await approvedContract(db, row.live.id) : null;
  return { status: row.status, version: row.live?.number ?? null, schedule: row.live?.schedule ?? null, contract: contract?.contract ?? null, hash: contract?.hash ?? null };
}

// ---------------------------------------------------------------------------
// The daily job: go-lives, SLA reminders and escalations

export async function runDaily(db: Database, now = new Date()) {
  const published = await promoteDue(db, now);
  const { remind, escalate } = await slaDue(db, now);
  let reminded = 0;
  let escalated = 0;
  for (const { t, r } of remind) {
    await db.transaction(async (tx) => {
      const v = r.subjectType === SUBJECT ? await loadVersion(tx, r.subjectId).catch(() => null) : null;
      const to = t.assigneeId ? [t.assigneeId] : v ? (await eligibleApprovers(tx, v)).map((a) => a.id) : [];
      await notify(tx, to, { kind: 'review.reminder', title: `Reminder: ${r.title} is waiting`, body: `Due ${t.dueAt.toISOString().slice(0, 16).replace('T', ' ')} UTC.`, link: `/reviews/${r.id}` });
      await markReminded(tx, t.id);
      reminded++;
    });
  }
  for (const { t, r } of escalate) {
    await db.transaction(async (tx) => {
      const v = r.subjectType === SUBJECT ? await loadVersion(tx, r.subjectId).catch(() => null) : null;
      // overdue: everyone who could take it over hears about it, not just the assignee
      const approvers = v ? (await eligibleApprovers(tx, v)).map((a) => a.id) : [];
      await notify(tx, [t.assigneeId, ...approvers], { kind: 'review.overdue', title: `Overdue: ${r.title}`, body: 'This review is past its SLA. Pick it up or reassign it.', link: `/reviews/${r.id}` });
      await recordAudit(tx, { actor: null }, { action: 'review.escalated', subjectType: 'review_request', subjectId: r.id, summary: `"${r.title}" passed its SLA and was escalated to every eligible approver` });
      await markEscalated(tx, t.id);
      escalated++;
    });
  }
  return { published, reminded, escalated };
}
