import { createHash } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNull, lte, max, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { recordAudit } from '@orbita/audit';
import { CLONE_SECTIONS, compileInput, copySections, loadVersion, versionSubject, type Ctx, type VersionRef } from '@orbita/category-config';
import { canonicalJson, compile, evaluate, type Contract, type Sample } from '@orbita/contract';
import {
  categoryContracts,
  categoryNodes,
  categorySchedules,
  categoryVersionContracts,
  categoryVersions,
  contractTestCases,
  profiles,
  roleGrants,
  type Database,
  type DbOrTx,
} from '@orbita/db';
import { badRequest, conflict, forbidden, notFound, preconditionFailed } from '@orbita/domain';
import { notify } from '@orbita/notifications';
import { activeRequestFor, addComment, attemptTouched, closeSentBack, decide, openAttempt, openTask } from '@orbita/reviews';
import { todayIn } from './status';

export const SUBJECT = 'category_version';

export interface PublishingDeps {
  db: Database;
}

const hashOf = (c: Contract) => createHash('sha256').update(canonicalJson(c)).digest('hex');
const label = (v: VersionRef) => `${v.node.name} v${v.number}`;
const titleOf = (v: VersionRef) => `${v.node.path.join(' › ')} · v${v.number}`;
const versionLink = (id: string) => `/workbench/versions/${id}`;
const reviewLink = (id: string) => `/reviews/${id}`;

// ---------------------------------------------------------------------------
// Who may approve

/** Approvers who could decide this version: in scope, active, and not among its editors or submitter. */
export async function eligibleApprovers(db: DbOrTx, v: Pick<VersionRef, 'workgroupId' | 'editorIds' | 'submittedBy'>) {
  const rows = await db
    .selectDistinct({ id: profiles.id, name: profiles.fullName, email: profiles.email })
    .from(roleGrants)
    .innerJoin(profiles, eq(profiles.id, roleGrants.userId))
    .where(
      and(
        eq(roleGrants.role, 'approver'),
        isNull(roleGrants.revokedAt),
        eq(profiles.status, 'active'),
        v.workgroupId ? or(eq(roleGrants.scopeType, 'global'), and(eq(roleGrants.scopeType, 'workgroup'), eq(roleGrants.scopeId, v.workgroupId))) : eq(roleGrants.scopeType, 'global'),
      ),
    )
    .orderBy(asc(profiles.fullName));
  return rows.filter((p) => !v.editorIds.includes(p.id) && p.id !== v.submittedBy);
}

/** Why this person cannot approve, in words, or null when they can. */
export function whyCannotApprove(ctx: Pick<Ctx, 'actor' | 'ability'>, v: VersionRef): string | null {
  if (ctx.ability.can('approve', versionSubject(v))) return null;
  if (v.state !== 'IN_REVIEW') return 'This version is not waiting for approval.';
  if (v.submittedBy === ctx.actor.id) return 'You submitted this version, so someone else must approve it.';
  if (v.editorIds.includes(ctx.actor.id)) return 'You edited this version, so someone else must approve it.';
  return 'You cannot approve category versions in this part of the tree.';
}

// ---------------------------------------------------------------------------
// Submitting

export interface Readiness {
  ready: boolean;
  problems: string[];
  contract: { id: string; hash: string } | null;
}

/** A version can be submitted when its latest compile is clean, current and its test cases behave. */
export async function submissionReadiness(db: DbOrTx, v: VersionRef): Promise<Readiness> {
  const problems: string[] = [];
  const [last] = await db.select().from(categoryContracts).where(eq(categoryContracts.versionId, v.id)).orderBy(desc(categoryContracts.createdAt)).limit(1);
  const draft = compile((await compileInput(db, v)).input);
  if (!draft.ok || !draft.contract) problems.push('Fix the configuration problems first: the version does not compile.');
  if (!last) problems.push('Compile the contract before submitting.');
  else {
    if (!last.ok) problems.push('The last compile failed. Fix the problems and compile again.');
    if (draft.contract && last.hash !== hashOf(draft.contract)) problems.push('There are changes since the last compile. Compile again.');
    if (last.testsFailed > 0) problems.push(`${last.testsFailed} test case${last.testsFailed === 1 ? '' : 's'} did not behave as expected.`);
  }
  return { ready: problems.length === 0, problems, contract: problems.length === 0 && last ? { id: last.id, hash: last.hash! } : null };
}

export async function submitVersion(deps: PublishingDeps, ctx: Ctx, id: string, note?: string) {
  return deps.db.transaction(async (tx) => {
    const v = await loadVersion(tx, id, true);
    if (!ctx.ability.can('submit', versionSubject(v))) throw forbidden(v.state === 'IN_REVIEW' ? 'This version is already waiting for approval.' : 'You cannot submit this version.');
    const ready = await submissionReadiness(tx, v);
    if (!ready.ready) throw preconditionFailed(ready.problems.join(' '), { problems: ready.problems });
    const { request, task } = await openAttempt(tx, {
      subjectType: SUBJECT,
      subjectId: id,
      title: titleOf(v),
      workgroupId: v.workgroupId,
      submittedBy: ctx.actor.id,
      snapshotId: ready.contract!.id,
      snapshotHash: ready.contract!.hash,
    });
    // the submitter is a maker too: they may not approve it either
    await tx
      .update(categoryVersions)
      .set({
        state: 'IN_REVIEW',
        submittedBy: ctx.actor.id,
        submittedAt: new Date(),
        lockedBy: null,
        lockedAt: null,
        editorIds: sql`case when ${ctx.actor.id}::uuid = any(${categoryVersions.editorIds}) then ${categoryVersions.editorIds} else array_append(${categoryVersions.editorIds}, ${ctx.actor.id}::uuid) end`,
      })
      .where(eq(categoryVersions.id, id));
    if (note?.trim()) await addComment(tx, ctx, request, { body: note.trim() });
    await recordAudit(tx, ctx, {
      action: 'category.version.submitted',
      subjectType: 'category_version',
      subjectId: id,
      summary: `${ctx.actor.email} submitted ${label(v)} for approval${request.attempt > 1 ? ` (attempt ${request.attempt})` : ''}; contract ${ready.contract!.hash.slice(0, 12)}`,
      after: { state: 'IN_REVIEW', requestId: request.id, attempt: request.attempt, contractHash: ready.contract!.hash },
    });
    const after = { ...v, submittedBy: ctx.actor.id, editorIds: [...new Set([...v.editorIds, ctx.actor.id])] };
    const recipients = task.assigneeId ? [task.assigneeId] : (await eligibleApprovers(tx, after)).map((a) => a.id);
    await notify(
      tx,
      recipients,
      {
        kind: request.attempt > 1 ? 'review.resubmitted' : 'review.submitted',
        title: `${label(v)} ${request.attempt > 1 ? 'is back' : 'is waiting'} for approval`,
        body: `${ctx.actor.fullName || ctx.actor.email} submitted ${v.node.path.join(' › ')}${request.attempt > 1 ? ` again (attempt ${request.attempt})` : ''}.`,
        link: reviewLink(request.id),
        subjectType: 'review_request',
        subjectId: request.id,
      },
      { except: ctx.actor.id },
    );
    return { requestId: request.id, attempt: request.attempt };
  });
}

/** Pull a version back from review before the approver has acted on it. */
export async function withdrawVersion(deps: PublishingDeps, ctx: Ctx, id: string) {
  return deps.db.transaction(async (tx) => {
    const v = await loadVersion(tx, id, true);
    if (!ctx.ability.can('withdraw', versionSubject(v))) throw forbidden(v.state === 'IN_REVIEW' ? 'You cannot withdraw this version.' : 'This version is not waiting for approval.');
    const request = await activeRequestFor(tx, SUBJECT, id);
    if (!request || request.state !== 'open') throw conflict('This version is not waiting for approval.');
    if (await attemptTouched(tx, request)) throw conflict('The approver has started reviewing this version. Ask them to send it back instead.');
    const task = await openTask(tx, request.id);
    await decide(tx, { requestId: request.id, decision: 'withdraw', note: 'Withdrawn by the category team', by: ctx.actor.id });
    await tx.update(categoryVersions).set({ state: 'DRAFT' }).where(eq(categoryVersions.id, id));
    await recordAudit(tx, ctx, {
      action: 'category.version.withdrawn',
      subjectType: 'category_version',
      subjectId: id,
      summary: `${ctx.actor.email} withdrew ${label(v)} from review`,
      before: { state: 'IN_REVIEW' },
      after: { state: 'DRAFT' },
    });
    await notify(tx, [task?.assigneeId], { kind: 'review.withdrawn', title: `${label(v)} was withdrawn`, body: 'The category team pulled it back to keep working on it.', link: versionLink(id), subjectType: 'category_version', subjectId: id }, { except: ctx.actor.id });
  });
}

// ---------------------------------------------------------------------------
// Deciding

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-09.');
export const scheduleInput = z.object({
  sellerGoLive: isoDate,
  buyerGoLive: isoDate,
  minCatalogs: z.number().int().min(0).max(10_000).default(0),
  testMode: z.boolean().default(false),
});
export type ScheduleInput = z.input<typeof scheduleInput>;

export const decisionInput = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('approve'), schedule: scheduleInput, note: z.string().max(4000).optional() }),
  z.object({ decision: z.literal('send_back'), reasonCode: z.string().min(1, 'Pick a reason.'), note: z.string().max(4000) }),
  z.object({ decision: z.literal('discard'), reasonCode: z.string().min(1, 'Pick a reason.'), note: z.string().max(4000) }),
]);
export type DecisionInput = z.input<typeof decisionInput>;

function checkSchedule(s: z.output<typeof scheduleInput>, today: string, opts: { sellerLocked?: string } = {}) {
  if (opts.sellerLocked) {
    if (s.sellerGoLive !== opts.sellerLocked) throw badRequest('Sellers already have this version, so their go-live date cannot change.');
  } else if (s.sellerGoLive < today) throw badRequest('Seller go-live cannot be in the past.');
  if (s.buyerGoLive < s.sellerGoLive) throw badRequest('Buyers cannot go live before sellers: pick a buyer date on or after the seller date.');
}

/** Runs the version's test cases against a contract without touching the (frozen) test rows. */
async function testsAgainst(tx: DbOrTx, versionId: string, contract: Contract) {
  const tests = await tx.select().from(contractTestCases).where(eq(contractTestCases.versionId, versionId));
  const failed = tests.filter((t) => {
    const problems = evaluate(contract, t.sample as unknown as Sample).errors.length;
    return t.expectation === 'pass' ? problems > 0 : problems === 0;
  });
  return { total: tests.length, failed: failed.map((t) => t.name) };
}

/** Makes a version the one sellers see; the version it replaces is superseded. */
async function publish(tx: DbOrTx, who: Pick<Ctx, 'actor' | 'meta'> | { actor: null }, v: VersionRef) {
  const [prev] = await tx
    .select({ id: categoryVersions.id, version: categoryVersions.version })
    .from(categoryVersions)
    .where(and(eq(categoryVersions.nodeId, v.nodeId), eq(categoryVersions.state, 'PUBLISHED')))
    .for('update');
  if (prev) await tx.update(categoryVersions).set({ state: 'SUPERSEDED' }).where(eq(categoryVersions.id, prev.id));
  await tx.update(categoryVersions).set({ state: 'PUBLISHED', publishedAt: new Date() }).where(eq(categoryVersions.id, v.id));
  await recordAudit(tx, who, {
    action: 'category.version.published',
    subjectType: 'category_version',
    subjectId: v.id,
    summary: `${label(v)} went live for sellers${prev ? `, replacing v${prev.version}` : ''}`,
    before: { state: v.state, replaces: prev?.id ?? null },
    after: { state: 'PUBLISHED' },
  });
  const [s] = await tx.select().from(categorySchedules).where(eq(categorySchedules.versionId, v.id));
  await notify(tx, [v.assigneeId, v.submittedBy, ...v.editorIds], {
    kind: 'category.live',
    title: `${label(v)} is live for sellers`,
    body: s && s.buyerGoLive > s.sellerGoLive ? `Buyers see it from ${s.buyerGoLive}.` : 'Buyers see it too once its buyer go-live conditions are met.',
    link: versionLink(v.id),
    subjectType: 'category_version',
    subjectId: v.id,
  });
  return prev?.id ?? null;
}

/**
 * The approver's decision. Approving runs a final compile, which must reproduce exactly the contract
 * that was submitted, re-runs the test cases, freezes the version with that contract and schedules
 * (or immediately starts) its go-live.
 */
export async function decideVersion(deps: PublishingDeps, ctx: Ctx, id: string, raw: DecisionInput, now = new Date()) {
  const input = decisionInput.parse(raw);
  return deps.db.transaction(async (tx) => {
    const v = await loadVersion(tx, id, true);
    const why = whyCannotApprove(ctx, v);
    if (why) throw forbidden(why);
    const request = await activeRequestFor(tx, SUBJECT, id);
    if (!request || request.state !== 'open') throw conflict('This version is not waiting for approval.');
    const task = await openTask(tx, request.id);

    if (input.decision === 'approve') {
      const today = todayIn(undefined, now);
      checkSchedule(input.schedule, today);
      const res = compile((await compileInput(tx, v)).input);
      if (!res.ok || !res.contract) throw preconditionFailed('The final compile failed. Send the version back so the category team can fix it.');
      if (task?.snapshotHash && hashOf(res.contract) !== task.snapshotHash)
        throw preconditionFailed('The shared library changed since this version was submitted, so the contract would differ from the one you reviewed. Send it back to be compiled again.');
      const tests = await testsAgainst(tx, id, res.contract);
      if (tests.failed.length) throw preconditionFailed(`Publishing is blocked: test case${tests.failed.length === 1 ? '' : 's'} ${tests.failed.map((n) => `"${n}"`).join(', ')} no longer behave as expected.`);
      const contractId = task?.snapshotId ?? (await tx.select({ id: categoryContracts.id }).from(categoryContracts).where(and(eq(categoryContracts.versionId, id), eq(categoryContracts.hash, hashOf(res.contract)))).limit(1))[0]?.id;
      if (!contractId) throw preconditionFailed('No compiled contract to publish.');
      await decide(tx, { requestId: request.id, decision: 'approve', note: input.note, by: ctx.actor.id });
      await tx.insert(categoryVersionContracts).values({ versionId: id, contractId, approvedBy: ctx.actor.id });
      await tx.insert(categorySchedules).values({ versionId: id, ...input.schedule, setBy: ctx.actor.id }).onConflictDoUpdate({ target: categorySchedules.versionId, set: { ...input.schedule, setBy: ctx.actor.id } });
      const liveNow = input.schedule.sellerGoLive <= today;
      await tx.update(categoryVersions).set({ state: liveNow ? 'APPROVED' : 'SCHEDULED', lockedBy: null, lockedAt: null }).where(eq(categoryVersions.id, id));
      await recordAudit(tx, ctx, {
        action: 'category.version.approved',
        subjectType: 'category_version',
        subjectId: id,
        summary: `${ctx.actor.email} approved ${label(v)}: sellers from ${input.schedule.sellerGoLive}, buyers from ${input.schedule.buyerGoLive}${input.schedule.minCatalogs ? ` once ${input.schedule.minCatalogs} catalogs exist` : ''}${input.schedule.testMode ? ', test mode before go-live' : ''}`,
        before: { state: 'IN_REVIEW' },
        after: { state: liveNow ? 'PUBLISHED' : 'SCHEDULED', contractHash: task?.snapshotHash ?? null, ...input.schedule },
      });
      await notify(
        tx,
        [v.assigneeId, v.submittedBy, ...v.editorIds],
        {
          kind: 'review.approved',
          title: `${label(v)} was approved`,
          body: liveNow ? 'It goes live for sellers now.' : `Sellers see it from ${input.schedule.sellerGoLive}, buyers from ${input.schedule.buyerGoLive}.`,
          link: versionLink(id),
          subjectType: 'category_version',
          subjectId: id,
        },
        { except: ctx.actor.id },
      );
      if (liveNow) await publish(tx, ctx, { ...v, state: 'APPROVED' });
      return { state: liveNow ? 'PUBLISHED' : 'SCHEDULED', requestId: request.id };
    }

    const { reason } = await decide(tx, { requestId: request.id, decision: input.decision, reasonCode: input.reasonCode, note: input.note, by: ctx.actor.id });
    const next = input.decision === 'send_back' ? 'SENT_BACK' : 'DISCARDED';
    await tx
      .update(categoryVersions)
      .set({ state: next, ...(next === 'DISCARDED' ? { discardReason: `${reason!.label}: ${input.note.trim()}` } : {}) })
      .where(eq(categoryVersions.id, id));
    await recordAudit(tx, ctx, {
      action: input.decision === 'send_back' ? 'category.version.sent_back' : 'category.version.discarded',
      subjectType: 'category_version',
      subjectId: id,
      summary: `${ctx.actor.email} ${input.decision === 'send_back' ? 'sent back' : 'discarded'} ${label(v)}: ${reason!.label}`,
      before: { state: 'IN_REVIEW' },
      after: { state: next, reason: reason!.code, note: input.note.trim() },
    });
    await notify(
      tx,
      [v.assigneeId, v.submittedBy],
      {
        kind: `review.${input.decision}`,
        title: input.decision === 'send_back' ? `${label(v)} was sent back` : `${label(v)} was discarded`,
        body: `${reason!.label}. ${input.note.trim()}`,
        link: input.decision === 'send_back' ? versionLink(id) : reviewLink(request.id),
        subjectType: 'category_version',
        subjectId: id,
      },
      { except: ctx.actor.id },
    );
    return { state: next, requestId: request.id };
  });
}

/** The category team abandons a draft (with a reason). A published version, if any, keeps serving. */
export async function discardDraft(deps: PublishingDeps, ctx: Ctx, id: string, note: string) {
  const text = note.trim();
  if (text.length < 5) throw badRequest('Say why this draft is being discarded.');
  return deps.db.transaction(async (tx) => {
    const v = await loadVersion(tx, id, true);
    if (!ctx.ability.can('discard', versionSubject(v))) throw forbidden(v.state === 'IN_REVIEW' ? 'Withdraw it from review first.' : 'You cannot discard this version.');
    const request = await activeRequestFor(tx, SUBJECT, id);
    if (request?.state === 'sent_back') await closeSentBack(tx, request.id, { by: ctx.actor.id, note: text, reasonCode: 'other' });
    await tx.update(categoryVersions).set({ state: 'DISCARDED', discardReason: text, lockedBy: null, lockedAt: null }).where(eq(categoryVersions.id, id));
    const [live] = await tx.select({ version: categoryVersions.version }).from(categoryVersions).where(and(eq(categoryVersions.nodeId, v.nodeId), eq(categoryVersions.state, 'PUBLISHED')));
    await recordAudit(tx, ctx, {
      action: 'category.version.discarded',
      subjectType: 'category_version',
      subjectId: id,
      summary: `${ctx.actor.email} discarded ${label(v)}: ${text}${live ? `; v${live.version} keeps serving` : ''}`,
      before: { state: v.state },
      after: { state: 'DISCARDED', reason: text },
    });
    return { liveVersion: live?.version ?? null };
  });
}

// ---------------------------------------------------------------------------
// Scheduling and go-live

export async function rescheduleVersion(deps: PublishingDeps, ctx: Ctx, id: string, raw: ScheduleInput, now = new Date()) {
  const s = scheduleInput.parse(raw);
  return deps.db.transaction(async (tx) => {
    const v = await loadVersion(tx, id, true);
    if (!ctx.ability.can('schedule', versionSubject(v))) throw forbidden(['SCHEDULED', 'PUBLISHED'].includes(v.state) ? 'You cannot reschedule category versions.' : 'Only an approved version that is not fully live can be rescheduled.');
    const [old] = await tx.select().from(categorySchedules).where(eq(categorySchedules.versionId, id)).for('update');
    if (!old) throw notFound('Schedule');
    const today = todayIn(undefined, now);
    if (v.state === 'PUBLISHED') {
      if (old.buyerGoLive <= today) throw conflict('Buyers already have this version; there is nothing left to schedule.');
      checkSchedule(s, today, { sellerLocked: old.sellerGoLive });
      if (s.buyerGoLive < today) throw badRequest('Buyer go-live cannot be in the past.');
    } else checkSchedule(s, today);
    await tx.update(categorySchedules).set({ ...s, setBy: ctx.actor.id }).where(eq(categorySchedules.versionId, id));
    await recordAudit(tx, ctx, {
      action: 'category.version.rescheduled',
      subjectType: 'category_version',
      subjectId: id,
      summary: `${ctx.actor.email} rescheduled ${label(v)}: sellers ${s.sellerGoLive}, buyers ${s.buyerGoLive}`,
      before: { sellerGoLive: old.sellerGoLive, buyerGoLive: old.buyerGoLive, minCatalogs: old.minCatalogs, testMode: old.testMode },
      after: s,
    });
    await notify(tx, [v.assigneeId, v.submittedBy], { kind: 'category.rescheduled', title: `${label(v)} was rescheduled`, body: `Sellers from ${s.sellerGoLive}, buyers from ${s.buyerGoLive}.`, link: versionLink(id), subjectType: 'category_version', subjectId: id }, { except: ctx.actor.id });
    if (v.state === 'SCHEDULED' && s.sellerGoLive <= today) await publish(tx, ctx, v);
  });
}

/** Approved versions whose seller go-live has arrived go live. Run by the daily job and on page loads. */
export async function promoteDue(db: Database, now = new Date()) {
  const today = todayIn(undefined, now);
  const due = await db
    .select({ id: categoryVersions.id })
    .from(categoryVersions)
    .innerJoin(categorySchedules, eq(categorySchedules.versionId, categoryVersions.id))
    .where(and(inArray(categoryVersions.state, ['SCHEDULED', 'APPROVED']), lte(categorySchedules.sellerGoLive, today)));
  let published = 0;
  for (const d of due) {
    await db.transaction(async (tx) => {
      const v = await loadVersion(tx, d.id, true);
      if (v.state !== 'SCHEDULED' && v.state !== 'APPROVED') return;
      await publish(tx, { actor: null }, v);
      published++;
    });
  }
  return published;
}

// ---------------------------------------------------------------------------
// The next version of a category

/** Starts a new draft from the latest approved version (or empty when there is none). */
export async function createNextVersion(deps: PublishingDeps, ctx: Ctx, nodeId: string) {
  return deps.db.transaction(async (tx) => {
    const [node] = await tx.select().from(categoryNodes).where(eq(categoryNodes.id, nodeId)).for('update');
    if (!node) throw notFound('Category');
    if (node.kind !== 'listing') throw badRequest('Only listing categories have versions.');
    const versions = await tx.select().from(categoryVersions).where(eq(categoryVersions.nodeId, nodeId)).orderBy(desc(categoryVersions.version));
    const open = versions.find((x) => ['DRAFT', 'IN_REVIEW', 'SENT_BACK'].includes(x.state));
    if (open) throw conflict(`v${open.version} is still being worked on. Finish or discard it before starting another version.`);
    const source = versions.find((x) => ['SCHEDULED', 'APPROVED', 'PUBLISHED'].includes(x.state));
    const any = versions[0];
    const ref = any ? await loadVersion(tx, any.id) : null;
    if (!ctx.ability.can('create', versionSubjectFor(ref?.workgroupId ?? node.workgroupId))) throw forbidden('You cannot start versions in this part of the tree.');
    const [{ next } = { next: 0 }] = await tx.select({ next: sql<number>`coalesce(${max(categoryVersions.version)}, -1) + 1` }).from(categoryVersions).where(eq(categoryVersions.nodeId, nodeId));
    const [row] = await tx
      .insert(categoryVersions)
      .values({ nodeId, version: Number(next), state: 'DRAFT', assigneeId: ctx.actor.id, createdBy: ctx.actor.id, editorIds: [ctx.actor.id] })
      .returning();
    if (source) await copySections(tx, ctx, row!.id, await loadVersion(tx, source.id), CLONE_SECTIONS);
    await recordAudit(tx, ctx, {
      action: 'category.version.created',
      subjectType: 'category_version',
      subjectId: row!.id,
      summary: `${ctx.actor.email} started ${node.name} v${row!.version}${source ? ` from v${source.version}` : ''}`,
      after: { version: row!.version, from: source?.id ?? null },
    });
    return { id: row!.id, number: row!.version, from: source?.version ?? null };
  });
}

const versionSubjectFor = (workgroupId: string | null) => versionSubject({ workgroupId, state: 'DRAFT', editorIds: [] });

/** The contract a version was approved with, if any. */
export async function approvedContract(db: DbOrTx, versionId: string) {
  const [row] = await db
    .select({ contract: categoryContracts.contract, hash: categoryContracts.hash, approvedAt: categoryVersionContracts.approvedAt, approvedBy: categoryVersionContracts.approvedBy })
    .from(categoryVersionContracts)
    .innerJoin(categoryContracts, eq(categoryContracts.id, categoryVersionContracts.contractId))
    .where(eq(categoryVersionContracts.versionId, versionId));
  return row ? { ...row, contract: row.contract as Contract } : null;
}

export async function contractById(db: DbOrTx, id: string | null | undefined) {
  if (!id) return null;
  const [row] = await db.select().from(categoryContracts).where(eq(categoryContracts.id, id));
  return row?.contract ? { id: row.id, hash: row.hash, contract: row.contract as Contract, createdAt: row.createdAt } : null;
}
