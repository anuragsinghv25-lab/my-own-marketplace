'use server';

import { getDb } from '@orbita/db';
import { listAttributes } from '@orbita/library';
import { browseStandard, getStandardCategory, searchStandard, standardsStatus, type ReferenceSource } from '@orbita/standards';
import {
  addAlias,
  addCategoryAttribute,
  adoptStandardCategory,
  categoryAttributeSet,
  createNode,
  findSimilarCategories,
  moveNode,
  removeAlias,
  removeCategoryAttribute,
  renameNode,
  setNodeKind,
  setNodeStatus,
  setUnspscCode,
  updateCategoryAttribute,
  type AdoptInput,
  type CategoryKind,
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

export async function setNodeKindAction(id: string, kind: CategoryKind, aliases: string[]): Promise<ActionState> {
  return runAction(async () => {
    await setNodeKind(deps(), await actionCtx(), id, kind, aliases);
    return { status: 'ok', message: kind === 'listing' ? 'Now a listing category, with an empty draft v0.' : 'Now a category group.' };
  }, PATH);
}

export async function setUnspscCodeAction(id: string, code: string | null): Promise<ActionState> {
  return runAction(async () => {
    await setUnspscCode(deps(), await actionCtx(), id, code);
    return { status: 'ok', message: code ? `Mapped to UNSPSC ${code}.` : 'UNSPSC mapping removed.' };
  }, PATH);
}

// ----------------------------------------------------------------- attribute sets

const plain = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export async function attributeSetAction(nodeId: string) {
  const ctx = await actionCtx();
  return plain(await categoryAttributeSet(getDb(), ctx.ability, nodeId));
}

export async function searchLibraryAttributesAction(q: string) {
  const ctx = await actionCtx();
  const rows = await listAttributes(getDb(), ctx.ability, { q: q || undefined, status: 'active' });
  return rows.slice(0, 30).map((r) => ({ id: r.attribute.id, name: r.attribute.name, code: r.attribute.code, dataType: r.attribute.dataType, source: r.attribute.source }));
}

export async function addCategoryAttributeAction(nodeId: string, attributeId: string, required: boolean): Promise<ActionState> {
  return runAction(async () => {
    await addCategoryAttribute(deps(), await actionCtx(), nodeId, attributeId, required);
    return { status: 'ok', message: 'Attribute added.' };
  }, PATH);
}

export async function updateCategoryAttributeAction(nodeId: string, id: string, required: boolean): Promise<ActionState> {
  return runAction(async () => {
    await updateCategoryAttribute(deps(), await actionCtx(), nodeId, id, required);
    return { status: 'ok', message: required ? 'Now required.' : 'Now optional.' };
  }, PATH);
}

export async function removeCategoryAttributeAction(nodeId: string, id: string): Promise<ActionState> {
  return runAction(async () => {
    await removeCategoryAttribute(deps(), await actionCtx(), nodeId, id);
    return { status: 'ok', message: 'Attribute removed.' };
  }, PATH);
}

// ----------------------------------------------------------------- standards

export async function standardsStatusAction() {
  const ctx = await actionCtx();
  return plain(await standardsStatus(getDb(), ctx.ability));
}

export async function browseStandardAction(source: ReferenceSource, parentExternalId: string | null) {
  const ctx = await actionCtx();
  return plain(await browseStandard(getDb(), ctx.ability, source, parentExternalId));
}

export async function searchStandardAction(source: ReferenceSource, q: string) {
  const ctx = await actionCtx();
  return plain(await searchStandard(getDb(), ctx.ability, source, q));
}

export async function standardDetailAction(source: ReferenceSource, externalId: string) {
  const ctx = await actionCtx();
  return plain(await getStandardCategory(getDb(), ctx.ability, source, externalId));
}

export async function adoptStandardAction(input: AdoptInput): Promise<ActionState> {
  return runAction(async () => {
    const r = await adoptStandardCategory(deps(), await actionCtx(), input);
    const bits = [
      r.adopted > 1 ? `${r.adopted} categories` : r.node.name,
      r.createdAncestors.length ? `${r.createdAncestors.length} parent group${r.createdAncestors.length === 1 ? '' : 's'}` : null,
      r.attributesAttached ? `${r.attributesAttached} attributes` : null,
    ].filter(Boolean);
    return { status: 'ok', message: `Added ${bits.join(', ')}.`, data: { id: r.node.id } };
  }, PATH);
}
