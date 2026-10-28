'use server';

import { getDb } from '@orbita/db';
import {
  addAlias,
  createNode,
  findSimilarCategories,
  moveNode,
  removeAlias,
  renameNode,
  setNodeStatus,
  type CreateNodeInput,
} from '@orbita/taxonomy';
import type { ActionState } from '@/lib/action-state';
import { actionCtx, runAction } from '@/server/actions';

const PATH = ['/workbench/taxonomy', '/workbench'];
const deps = () => ({ db: getDb() });

export async function findSimilarAction(text: string) {
  const ctx = await actionCtx();
  return findSimilarCategories(getDb(), ctx.ability, text);
}

export async function createNodeAction(input: CreateNodeInput): Promise<ActionState> {
  return runAction(async () => {
    const r = await createNode(deps(), await actionCtx(), input);
    return {
      status: 'ok',
      message: r.draft ? `${r.node.name} created with an empty draft v0.` : `${r.node.name} created (${r.node.code}).`,
      data: { id: r.node.id },
    };
  }, PATH);
}

export async function renameNodeAction(id: string, name: string, description: string): Promise<ActionState> {
  return runAction(async () => {
    const n = await renameNode(deps(), await actionCtx(), id, { name, description });
    return { status: 'ok', message: `Saved ${n.name}.` };
  }, PATH);
}

export async function moveNodeAction(id: string, parentId: string | null): Promise<ActionState> {
  return runAction(async () => {
    await moveNode(deps(), await actionCtx(), id, parentId);
    return { status: 'ok', message: 'Category moved. Its code is unchanged.' };
  }, PATH);
}

export async function addAliasAction(id: string, alias: string): Promise<ActionState> {
  return runAction(async () => {
    await addAlias(deps(), await actionCtx(), id, alias);
    return { status: 'ok', message: `Alias "${alias}" added.` };
  }, PATH);
}

export async function removeAliasAction(id: string, aliasId: string): Promise<ActionState> {
  return runAction(async () => {
    await removeAlias(deps(), await actionCtx(), id, aliasId);
    return { status: 'ok', message: 'Alias removed.' };
  }, PATH);
}

export async function setNodeStatusAction(id: string, status: 'active' | 'inactive'): Promise<ActionState> {
  return runAction(async () => {
    await setNodeStatus(deps(), await actionCtx(), id, status);
    return { status: 'ok', message: status === 'active' ? 'Category reactivated.' : 'Category deactivated.' };
  }, PATH);
}
