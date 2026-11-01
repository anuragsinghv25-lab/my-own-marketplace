import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { recordAudit } from '@orbita/audit';
import type { AppAbility } from '@orbita/authz';
import {
  profiles,
  reviewComments,
  reviewDecisions,
  reviewDefinitions,
  reviewRequests,
  reviewTasks,
  type Database,
  type DbOrTx,
  type ReasonCode,
  type ReviewDefinition,
  type ReviewRequest,
  type ReviewTask,
} from '@orbita/db';
import { badRequest, conflict, forbidden, notFound, preconditionFailed, type Actor, type RequestMeta } from '@orbita/domain';

/**
 * The generic review engine (ADR 0005, 0011). It knows requests, attempts, stage tasks, decisions,
 * comments and SLA timers; it does not know what is being reviewed. A subject module (category
 * publishing now, brands and catalogs later) calls it inside its own transaction and owns the
 * subject's state and the "who may decide" question.
 */
export interface Ctx {
  actor: Actor;
  ability: AppAbility;
  meta: RequestMeta;
}

export type DecisionKind = 'approve' | 'send_back' | 'discard' | 'withdraw';

const HOUR = 3_600_000;

export async function definitionFor(db: DbOrTx, subjectType: string): Promise<ReviewDefinition> {
  const [d] = await db.select().from(reviewDefinitions).where(eq(reviewDefinitions.subjectType, subjectType));
  if (!d) throw preconditionFailed(`No review definition for ${subjectType}. Ask a platform admin to set one up.`);
  return d;
}

// ---------------------------------------------------------------------------
// Definitions (data, edited by a platform admin)

export async function listDefinitions(db: DbOrTx, ability: AppAbility) {
  if (!ability.can('read', 'ReviewDefinition')) throw forbidden();
  return db.select().from(reviewDefinitions).orderBy(asc(reviewDefinitions.name));
}

const reasonSchema = z.object({
  code: z.string().trim().regex(/^[a-z0-9_]{2,40}$/, 'Codes use lower-case letters, digits and underscores.'),
  label: z.string().trim().min(2).max(120),
  for: z.array(z.enum(['send_back', 'discard'])).min(1, 'Pick at least one decision the reason applies to.'),
});

export const definitionPatch = z.object({
  name: z.string().trim().min(2).max(120),
  slaHours: z.number().int().min(1).max(24 * 60),
  reminderHours: z.number().int().min(1).max(24 * 60),
  maxAttempts: z.number().int().min(1).max(20),
  stageLabels: z.record(z.string(), z.string().trim().min(2).max(60)).optional(),
  reasonCodes: z.array(reasonSchema).min(1, 'Keep at least one reason code.'),
});

export async function updateDefinition(deps: { db: Database }, ctx: Ctx, id: string, patch: z.input<typeof definitionPatch>) {
  if (!ctx.ability.can('update', 'ReviewDefinition')) throw forbidden('Only a platform admin can change review rules.');
  const p = definitionPatch.parse(patch);
  if (p.reminderHours >= p.slaHours) throw badRequest('Send the reminder before the task is due: reminder hours must be less than the SLA.');
  const codes = p.reasonCodes.map((r) => r.code);
  if (new Set(codes).size !== codes.length) throw badRequest('Each reason code must be unique.');
  for (const kind of ['send_back', 'discard'] as const)
    if (!p.reasonCodes.some((r) => r.for.includes(kind))) throw badRequest(`Keep at least one reason for ${kind === 'send_back' ? 'sending back' : 'discarding'}.`);
  return deps.db.transaction(async (tx) => {
    const [d] = await tx.select().from(reviewDefinitions).where(eq(reviewDefinitions.id, id)).for('update');
    if (!d) throw notFound('Review definition');
    const stages = d.stages.map((s) => ({ ...s, label: p.stageLabels?.[s.key] ?? s.label }));
    const [row] = await tx
      .update(reviewDefinitions)
      .set({ name: p.name, slaHours: p.slaHours, reminderHours: p.reminderHours, maxAttempts: p.maxAttempts, reasonCodes: p.reasonCodes, stages, updatedBy: ctx.actor.id })
      .where(eq(reviewDefinitions.id, id))
      .returning();
    await recordAudit(tx, ctx, {
      action: 'review.definition.updated',
      subjectType: 'review_definition',
      subjectId: id,
      summary: `${ctx.actor.email} changed the review rules for ${d.name}`,
      before: { slaHours: d.slaHours, reminderHours: d.reminderHours, maxAttempts: d.maxAttempts, reasonCodes: d.reasonCodes },
      after: { slaHours: p.slaHours, reminderHours: p.reminderHours, maxAttempts: p.maxAttempts, reasonCodes: p.reasonCodes },
    });
    return row!;
  });
}

// ---------------------------------------------------------------------------
// Submitting

export interface OpenAttemptInput {
  subjectType: string;
  subjectId: string;
  title: string;
  workgroupId: string | null;
  submittedBy: string;
  snapshotId?: string | null;
  snapshotHash?: string | null;
}

/**
 * Opens the first attempt of a new request, or the next attempt of a request that was sent back.
 * A resubmission goes back to whoever handled the previous attempt.
 */
export async function openAttempt(tx: DbOrTx, input: OpenAttemptInput): Promise<{ request: ReviewRequest; task: ReviewTask; definition: ReviewDefinition }> {
  const definition = await definitionFor(tx, input.subjectType);
  const stage = definition.stages[0];
  if (!stage) throw preconditionFailed(`${definition.name} has no stages.`);
  const [active] = await tx
    .select()
    .from(reviewRequests)
    .where(and(eq(reviewRequests.subjectType, input.subjectType), eq(reviewRequests.subjectId, input.subjectId), inArray(reviewRequests.state, ['open', 'sent_back'])))
    .for('update');
  if (active?.state === 'open') throw conflict('This is already waiting for review.');
  let request: ReviewRequest;
  let assigneeId: string | null = null;
  if (active) {
    if (active.attempt >= definition.maxAttempts)
      throw preconditionFailed(`This has been submitted ${active.attempt} times, the most ${definition.name.toLowerCase()} allows. Discard it and start a new version.`);
    const [prev] = await tx.select().from(reviewTasks).where(and(eq(reviewTasks.requestId, active.id), eq(reviewTasks.attempt, active.attempt))).orderBy(desc(reviewTasks.createdAt)).limit(1);
    assigneeId = prev?.assigneeId ?? null;
    [request] = (await tx
      .update(reviewRequests)
      .set({ state: 'open', attempt: active.attempt + 1, submittedBy: input.submittedBy, submittedAt: new Date(), decidedAt: null, title: input.title, workgroupId: input.workgroupId })
      .where(eq(reviewRequests.id, active.id))
      .returning()) as [ReviewRequest];
  } else {
    [request] = (await tx
      .insert(reviewRequests)
      .values({ definitionId: definition.id, subjectType: input.subjectType, subjectId: input.subjectId, title: input.title, workgroupId: input.workgroupId, submittedBy: input.submittedBy })
      .returning()) as [ReviewRequest];
  }
  const [task] = (await tx
    .insert(reviewTasks)
    .values({
      requestId: request.id,
      attempt: request.attempt,
      stage: stage.key,
      assigneeId,
      snapshotId: input.snapshotId ?? null,
      snapshotHash: input.snapshotHash ?? null,
      dueAt: new Date(Date.now() + definition.slaHours * HOUR),
    })
    .returning()) as [ReviewTask];
  return { request, task, definition };
}

export async function activeRequestFor(db: DbOrTx, subjectType: string, subjectId: string) {
  const [r] = await db
    .select()
    .from(reviewRequests)
    .where(and(eq(reviewRequests.subjectType, subjectType), eq(reviewRequests.subjectId, subjectId)))
    .orderBy(desc(reviewRequests.createdAt))
    .limit(1);
  return r ?? null;
}

export async function openTask(db: DbOrTx, requestId: string) {
  const [t] = await db.select().from(reviewTasks).where(and(eq(reviewTasks.requestId, requestId), eq(reviewTasks.state, 'open'))).orderBy(desc(reviewTasks.createdAt)).limit(1);
  return t ?? null;
}

// ---------------------------------------------------------------------------
// Deciding

export interface DecideInput {
  requestId: string;
  decision: DecisionKind;
  reasonCode?: string | null;
  note?: string;
  by: string;
}

/**
 * Records a decision on the open attempt. Send-back and discard need a reason code from the
 * definition and a note. Approving a stage that is not the last opens the next stage's task.
 * Returns the request's new state ("open" while later stages remain).
 */
export async function decide(tx: DbOrTx, input: DecideInput): Promise<{ request: ReviewRequest; final: boolean; reason: ReasonCode | null }> {
  const [r] = await tx.select().from(reviewRequests).where(eq(reviewRequests.id, input.requestId)).for('update');
  if (!r) throw notFound('Review request');
  if (r.state !== 'open') throw conflict('This request is not waiting for a decision any more.');
  const [d] = await tx.select().from(reviewDefinitions).where(eq(reviewDefinitions.id, r.definitionId));
  const task = await openTask(tx, r.id);
  const note = (input.note ?? '').trim();
  let reason: ReasonCode | null = null;
  if (input.decision === 'send_back' || input.decision === 'discard') {
    reason = d!.reasonCodes.find((x) => x.code === input.reasonCode && x.for.includes(input.decision as 'send_back' | 'discard')) ?? null;
    if (!reason) throw badRequest(`Pick a reason for ${input.decision === 'send_back' ? 'sending this back' : 'discarding this'}.`);
    if (note.length < 5) throw badRequest('Add a note so the category manager knows what to do.');
  }
  await tx.insert(reviewDecisions).values({ requestId: r.id, taskId: task?.id ?? null, attempt: r.attempt, decision: input.decision, reasonCode: reason?.code ?? null, note, decidedBy: input.by });
  if (task) await tx.update(reviewTasks).set({ state: input.decision === 'withdraw' ? 'cancelled' : 'done', completedAt: new Date(), assigneeId: task.assigneeId ?? (input.decision === 'withdraw' ? null : input.by) }).where(eq(reviewTasks.id, task.id));

  if (input.decision === 'approve' && task) {
    const idx = d!.stages.findIndex((s) => s.key === task.stage);
    const next = d!.stages[idx + 1];
    if (next) {
      await tx.insert(reviewTasks).values({ requestId: r.id, attempt: r.attempt, stage: next.key, snapshotId: task.snapshotId, snapshotHash: task.snapshotHash, dueAt: new Date(Date.now() + d!.slaHours * HOUR) });
      return { request: r, final: false, reason };
    }
  }
  const state = ({ approve: 'approved', send_back: 'sent_back', discard: 'discarded', withdraw: 'withdrawn' } as const)[input.decision];
  const [updated] = await tx.update(reviewRequests).set({ state, decidedAt: new Date() }).where(eq(reviewRequests.id, r.id)).returning();
  return { request: updated!, final: true, reason };
}

/** Closes a request that is waiting on the submitter (sent back), e.g. when they discard their draft. */
export async function closeSentBack(tx: DbOrTx, requestId: string, input: { by: string; note: string; reasonCode?: string | null }) {
  const [r] = await tx.select().from(reviewRequests).where(eq(reviewRequests.id, requestId)).for('update');
  if (!r || r.state !== 'sent_back') return null;
  await tx.insert(reviewDecisions).values({ requestId, attempt: r.attempt, decision: 'discard', reasonCode: input.reasonCode ?? null, note: input.note, decidedBy: input.by });
  const [updated] = await tx.update(reviewRequests).set({ state: 'discarded', decidedAt: new Date() }).where(eq(reviewRequests.id, requestId)).returning();
  return updated!;
}

/** Whether anyone has acted on the open attempt yet (a decision or a comment from someone other than the submitter). */
export async function attemptTouched(db: DbOrTx, request: ReviewRequest) {
  const [c] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(reviewComments)
    .where(and(eq(reviewComments.requestId, request.id), eq(reviewComments.attempt, request.attempt), sql`${reviewComments.authorId} <> ${request.submittedBy}`));
  return (c?.n ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Assignment and transfers

/** Takes or moves open tasks; the subject module says who is eligible. */
export async function assignTasks(
  deps: { db: Database },
  ctx: Ctx,
  requestIds: string[],
  assigneeId: string,
  eligible: (tx: DbOrTx, request: ReviewRequest, assigneeId: string) => Promise<string | null>,
) {
  if (!requestIds.length) throw badRequest('Pick at least one request.');
  const selfClaim = assigneeId === ctx.actor.id;
  if (!selfClaim && !ctx.ability.can('assign', 'ReviewRequest')) throw forbidden('You cannot reassign reviews.');
  return deps.db.transaction(async (tx) => {
    const [who] = await tx.select({ name: profiles.fullName, email: profiles.email, status: profiles.status }).from(profiles).where(eq(profiles.id, assigneeId));
    if (!who || who.status !== 'active') throw badRequest('Pick an active person.');
    const moved: ReviewRequest[] = [];
    for (const id of requestIds) {
      const [r] = await tx.select().from(reviewRequests).where(eq(reviewRequests.id, id)).for('update');
      if (!r) throw notFound('Review request');
      if (r.state !== 'open') throw conflict(`"${r.title}" is not waiting for review.`);
      const task = await openTask(tx, id);
      if (!task) throw conflict(`"${r.title}" has no open task.`);
      if (task.assigneeId === assigneeId) continue;
      if (selfClaim && task.assigneeId && !ctx.ability.can('assign', 'ReviewRequest')) throw conflict(`"${r.title}" is already assigned to someone else.`);
      const problem = await eligible(tx, r, assigneeId);
      if (problem) throw preconditionFailed(`${who.name || who.email} cannot take "${r.title}": ${problem}`);
      await tx.update(reviewTasks).set({ assigneeId, remindedAt: null }).where(eq(reviewTasks.id, task.id));
      await recordAudit(tx, ctx, {
        action: selfClaim ? 'review.claimed' : 'review.transferred',
        subjectType: 'review_request',
        subjectId: id,
        summary: selfClaim ? `${ctx.actor.email} picked up "${r.title}"` : `${ctx.actor.email} assigned "${r.title}" to ${who.name || who.email}`,
        before: { assigneeId: task.assigneeId },
        after: { assigneeId },
      });
      moved.push(r);
    }
    return { moved, assignee: { id: assigneeId, name: who.name || who.email } };
  });
}

// ---------------------------------------------------------------------------
// Comments (per field, or on the whole request)

export const commentInput = z.object({
  fieldKey: z.string().trim().max(200).nullable().optional(),
  fieldLabel: z.string().trim().max(200).nullable().optional(),
  body: z.string().trim().min(2, 'Write a comment.').max(4000),
});

export async function addComment(tx: DbOrTx, ctx: Ctx, request: ReviewRequest, c: z.input<typeof commentInput>) {
  if (!ctx.ability.can('comment', 'ReviewRequest')) throw forbidden('You cannot comment on reviews.');
  const p = commentInput.parse(c);
  if (request.state !== 'open' && request.state !== 'sent_back') throw conflict('Comments are closed: this review is finished.');
  const [row] = await tx
    .insert(reviewComments)
    .values({ requestId: request.id, attempt: request.attempt, fieldKey: p.fieldKey || null, fieldLabel: p.fieldLabel || null, body: p.body, authorId: ctx.actor.id })
    .returning();
  return row!;
}

export async function resolveComment(tx: DbOrTx, ctx: Ctx, requestId: string, commentId: string, resolved: boolean) {
  if (!ctx.ability.can('comment', 'ReviewRequest')) throw forbidden();
  const [row] = await tx
    .update(reviewComments)
    .set(resolved ? { resolvedBy: ctx.actor.id, resolvedAt: new Date() } : { resolvedBy: null, resolvedAt: null })
    .where(and(eq(reviewComments.id, commentId), eq(reviewComments.requestId, requestId)))
    .returning();
  if (!row) throw notFound('Comment');
  return row;
}

// ---------------------------------------------------------------------------
// Reading

export async function requestDetail(db: DbOrTx, id: string) {
  const [r] = await db.select().from(reviewRequests).where(eq(reviewRequests.id, id));
  if (!r) throw notFound('Review request');
  const [d] = await db.select().from(reviewDefinitions).where(eq(reviewDefinitions.id, r.definitionId));
  const [tasks, decisions, comments] = await Promise.all([
    db.select().from(reviewTasks).where(eq(reviewTasks.requestId, id)).orderBy(asc(reviewTasks.createdAt)),
    db.select().from(reviewDecisions).where(eq(reviewDecisions.requestId, id)).orderBy(asc(reviewDecisions.decidedAt)),
    db.select().from(reviewComments).where(eq(reviewComments.requestId, id)).orderBy(asc(reviewComments.createdAt)),
  ]);
  const people = [...new Set([r.submittedBy, ...tasks.map((t) => t.assigneeId), ...decisions.map((x) => x.decidedBy), ...comments.flatMap((c) => [c.authorId, c.resolvedBy])].filter((x): x is string => !!x))];
  const names = people.length ? await db.select({ id: profiles.id, name: profiles.fullName, email: profiles.email }).from(profiles).where(inArray(profiles.id, people)) : [];
  const nameOf = (uid: string | null) => (uid ? (names.find((n) => n.id === uid)?.name || names.find((n) => n.id === uid)?.email || 'Someone') : null);
  const open = tasks.filter((t) => t.state === 'open').at(-1) ?? null;
  return {
    request: r,
    definition: d!,
    openTask: open,
    tasks: tasks.map((t) => ({ ...t, assigneeName: nameOf(t.assigneeId) })),
    decisions: decisions.map((x) => ({ ...x, byName: nameOf(x.decidedBy), reasonLabel: d!.reasonCodes.find((c) => c.code === x.reasonCode)?.label ?? null })),
    comments: comments.map((c) => ({ ...c, authorName: nameOf(c.authorId), resolvedByName: nameOf(c.resolvedBy) })),
    submittedByName: nameOf(r.submittedBy),
  };
}
export type RequestDetail = Awaited<ReturnType<typeof requestDetail>>;

export interface QueueFilter {
  subjectType?: string;
  /** queue = open and unassigned; mine = open and assigned to me; all = every request */
  view: 'queue' | 'mine' | 'all';
  actorId: string;
  states?: ReviewRequest['state'][];
  overdueOnly?: boolean;
}

export async function listRequests(db: DbOrTx, f: QueueFilter) {
  const rows = await db
    .select({
      r: reviewRequests,
      taskId: reviewTasks.id,
      stage: reviewTasks.stage,
      assigneeId: reviewTasks.assigneeId,
      dueAt: reviewTasks.dueAt,
      assigneeName: profiles.fullName,
      submitter: sql<string>`(select coalesce(nullif(p.full_name, ''), p.email) from profiles p where p.id = ${reviewRequests.submittedBy})`,
    })
    .from(reviewRequests)
    .leftJoin(reviewTasks, and(eq(reviewTasks.requestId, reviewRequests.id), eq(reviewTasks.state, 'open')))
    .leftJoin(profiles, eq(profiles.id, reviewTasks.assigneeId))
    .where(
      and(
        f.subjectType ? eq(reviewRequests.subjectType, f.subjectType) : undefined,
        f.view === 'queue' ? and(eq(reviewRequests.state, 'open'), isNull(reviewTasks.assigneeId)) : undefined,
        f.view === 'mine' ? and(eq(reviewRequests.state, 'open'), eq(reviewTasks.assigneeId, f.actorId)) : undefined,
        f.states?.length ? inArray(reviewRequests.state, f.states) : undefined,
        f.overdueOnly ? and(eq(reviewRequests.state, 'open'), lt(reviewTasks.dueAt, new Date())) : undefined,
      ),
    )
    .orderBy(sql`${reviewTasks.dueAt} asc nulls last`, desc(reviewRequests.updatedAt))
    .limit(500);
  return rows.map((x) => ({ ...x.r, taskId: x.taskId, stage: x.stage, assigneeId: x.assigneeId, assigneeName: x.assigneeName, dueAt: x.dueAt, submitterName: x.submitter, overdue: !!x.dueAt && x.dueAt.getTime() < Date.now() }));
}
export type QueueRow = Awaited<ReturnType<typeof listRequests>>[number];

// ---------------------------------------------------------------------------
// SLA timers (run by the daily job)

/** Open tasks that should get a reminder now, or are overdue and not yet escalated. */
export async function slaDue(db: DbOrTx, now = new Date()) {
  const rows = await db
    .select({ t: reviewTasks, r: reviewRequests, d: reviewDefinitions })
    .from(reviewTasks)
    .innerJoin(reviewRequests, eq(reviewRequests.id, reviewTasks.requestId))
    .innerJoin(reviewDefinitions, eq(reviewDefinitions.id, reviewRequests.definitionId))
    .where(and(eq(reviewTasks.state, 'open'), or(isNull(reviewTasks.remindedAt), isNull(reviewTasks.escalatedAt))));
  const remind = rows.filter(({ t, d }) => !t.remindedAt && now.getTime() - t.createdAt.getTime() >= d.reminderHours * HOUR && t.dueAt > now);
  const escalate = rows.filter(({ t }) => !t.escalatedAt && t.dueAt <= now);
  return { remind, escalate };
}

export async function markReminded(tx: DbOrTx, taskId: string) {
  await tx.update(reviewTasks).set({ remindedAt: new Date() }).where(eq(reviewTasks.id, taskId));
}

export async function markEscalated(tx: DbOrTx, taskId: string) {
  await tx.update(reviewTasks).set({ escalatedAt: new Date(), remindedAt: sql`coalesce(${reviewTasks.remindedAt}, now())` }).where(eq(reviewTasks.id, taskId));
}
