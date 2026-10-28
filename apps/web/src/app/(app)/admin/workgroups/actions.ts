'use server';

import { getDb } from '@orbita/db';
import { grantRole, revokeRole } from '@orbita/identity';
import { assignWorkgroup, findSimilarCategories, saveWorkgroup, WORKGROUP_ROLES, type WorkgroupInput } from '@orbita/taxonomy';
import { badRequest } from '@orbita/domain';
import type { ActionState } from '@/lib/action-state';
import { actionCtx, runAction } from '@/server/actions';

const PATH = ['/admin/workgroups', '/admin/users'];
const deps = () => ({ db: getDb() });

export async function saveWorkgroupAction(input: WorkgroupInput): Promise<ActionState> {
  return runAction(async () => {
    const w = await saveWorkgroup(deps(), await actionCtx(), input);
    return { status: 'ok', message: `${w.name} saved.`, data: { id: w.id } };
  }, PATH);
}

export async function assignWorkgroupAction(nodeId: string, workgroupId: string | null): Promise<ActionState> {
  return runAction(async () => {
    await assignWorkgroup(deps(), await actionCtx(), nodeId, workgroupId);
    return { status: 'ok', message: workgroupId ? 'Category added to the workgroup.' : 'Category removed from the workgroup.' };
  }, [...PATH, '/workbench/taxonomy']);
}

export async function searchCategoriesAction(text: string) {
  const ctx = await actionCtx();
  return findSimilarCategories(getDb(), ctx.ability, text);
}

/** Members are role grants scoped to the workgroup, so the identity module enforces separation of duties. */
export async function addMemberAction(workgroupId: string, userId: string, role: string): Promise<ActionState> {
  return runAction(async () => {
    if (!(WORKGROUP_ROLES as readonly string[]).includes(role)) throw badRequest('Pick category manager or approver.');
    await grantRole(deps(), await actionCtx(), userId, {
      role: role as (typeof WORKGROUP_ROLES)[number],
      scopeType: 'workgroup',
      scopeId: workgroupId,
    });
    return { status: 'ok', message: 'Member added.' };
  }, PATH);
}

export async function removeMemberAction(userId: string, grantId: string): Promise<ActionState> {
  return runAction(async () => {
    await revokeRole(deps(), await actionCtx(), userId, grantId);
    return { status: 'ok', message: 'Member removed.' };
  }, PATH);
}
