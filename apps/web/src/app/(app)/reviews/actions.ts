'use server';

import {
  assignReviews,
  cancelStatus,
  commentOnReview,
  createNextVersion,
  decideVersion,
  discardDraft,
  rescheduleVersion,
  resolveReviewComment,
  setCategoryStatus,
  submitVersion,
  withdrawVersion,
  type DecisionInput,
  type ScheduleInput,
} from '@orbita/category-publishing';
import { getDb } from '@orbita/db';
import { markRead } from '@orbita/notifications';
import { updateDefinition } from '@orbita/reviews';
import type { ActionState } from '@/lib/action-state';
import { actionCtx, runAction } from '@/server/actions';
import { deliverNotificationEmails } from '@/server/notify';

const deps = () => ({ db: getDb() });
const ok = (message: string, data?: Record<string, unknown>): ActionState => ({ status: 'ok', message, data });
const versionPaths = (id: string) => [`/workbench/versions/${id}`, '/workbench/versions', '/workbench/status', '/workbench', '/reviews'];
const reviewPaths = (requestId: string) => [`/reviews/${requestId}`, '/reviews', '/workbench/status', '/workbench/versions'];

export async function submitVersionAction(id: string, note: string) {
  return runAction(async () => {
    const r = await submitVersion(deps(), await actionCtx(), id, note);
    deliverNotificationEmails();
    return ok(r.attempt > 1 ? `Sent back to the approver (attempt ${r.attempt}).` : 'Submitted for approval.', { requestId: r.requestId });
  }, versionPaths(id));
}

export async function withdrawVersionAction(id: string) {
  return runAction(async () => {
    await withdrawVersion(deps(), await actionCtx(), id);
    deliverNotificationEmails();
    return ok('Withdrawn. The version is a draft again.');
  }, versionPaths(id));
}

export async function discardDraftAction(id: string, note: string) {
  return runAction(async () => {
    const r = await discardDraft(deps(), await actionCtx(), id, note);
    return ok(r.liveVersion !== null ? `Discarded. v${r.liveVersion} keeps serving sellers.` : 'Discarded.');
  }, versionPaths(id));
}

export async function decideAction(versionId: string, requestId: string, input: DecisionInput) {
  return runAction(async () => {
    const r = await decideVersion(deps(), await actionCtx(), versionId, input);
    deliverNotificationEmails();
    const msg = { PUBLISHED: 'Approved. It is live for sellers now.', SCHEDULED: 'Approved and scheduled.', SENT_BACK: 'Sent back to the category team.', DISCARDED: 'Discarded.' }[r.state] ?? 'Done.';
    return ok(msg, { state: r.state });
  }, [...reviewPaths(requestId), ...versionPaths(versionId)]);
}

export async function rescheduleAction(versionId: string, schedule: ScheduleInput) {
  return runAction(async () => {
    await rescheduleVersion(deps(), await actionCtx(), versionId, schedule);
    deliverNotificationEmails();
    return ok('Rescheduled.');
  }, versionPaths(versionId));
}

export async function assignReviewsAction(requestIds: string[], assigneeId: string) {
  return runAction(async () => {
    const r = await assignReviews(deps(), await actionCtx(), requestIds, assigneeId);
    deliverNotificationEmails();
    return ok(r.moved.length ? `Assigned ${r.moved.length === 1 ? 'it' : `${r.moved.length} requests`} to ${r.assignee.name}.` : 'Nothing to change.');
  }, ['/reviews', ...requestIds.map((id) => `/reviews/${id}`)]);
}

export async function claimReviewAction(requestId: string) {
  return runAction(async () => {
    const ctx = await actionCtx();
    await assignReviews(deps(), ctx, [requestId], ctx.actor.id);
    return ok('It is on your worklist.');
  }, reviewPaths(requestId));
}

export async function commentAction(requestId: string, input: { fieldKey?: string | null; fieldLabel?: string | null; body: string }, versionId?: string) {
  return runAction(async () => {
    await commentOnReview(deps(), await actionCtx(), requestId, input);
    deliverNotificationEmails();
    return ok('Comment added.');
  }, [...reviewPaths(requestId), ...(versionId ? [`/workbench/versions/${versionId}`] : [])]);
}

export async function resolveCommentAction(requestId: string, commentId: string, resolved: boolean, versionId?: string) {
  return runAction(async () => {
    await resolveReviewComment(deps(), await actionCtx(), requestId, commentId, resolved);
    return ok(resolved ? 'Marked as resolved.' : 'Reopened.');
  }, [...reviewPaths(requestId), ...(versionId ? [`/workbench/versions/${versionId}`] : [])]);
}

export async function createNextVersionAction(nodeId: string) {
  return runAction(async () => {
    const r = await createNextVersion(deps(), await actionCtx(), nodeId);
    return ok(r.from !== null ? `v${r.number} started from v${r.from}.` : `v${r.number} started.`, { id: r.id });
  }, ['/workbench/status', '/workbench/versions', '/workbench/taxonomy']);
}

export async function setStatusAction(nodeId: string, input: { status: string; reason: string; startsAt?: string | null; endsAt?: string | null }) {
  return runAction(async () => {
    await setCategoryStatus(deps(), await actionCtx(), nodeId, {
      status: input.status as never,
      reason: input.reason,
      startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
    });
    return ok(input.status === 'active' ? 'Back to normal.' : 'Status set.');
  }, ['/workbench/status']);
}

export async function cancelStatusAction(rowId: string) {
  return runAction(async () => {
    await cancelStatus(deps(), await actionCtx(), rowId);
    return ok('Cancelled.');
  }, ['/workbench/status']);
}

export async function markNotificationsReadAction(ids?: string[]) {
  const ctx = await actionCtx();
  await markRead(getDb(), ctx.actor, ids);
}

export async function updateReviewDefinitionAction(id: string, patch: Parameters<typeof updateDefinition>[3]) {
  return runAction(async () => {
    await updateDefinition(deps(), await actionCtx(), id, patch);
    return ok('Review rules saved.');
  }, ['/admin/reviews']);
}
