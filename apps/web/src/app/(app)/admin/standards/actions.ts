'use server';

import { getDb } from '@orbita/db';
import { importUnspscChunk, loadShopifyPart, type UnspscChunkInput } from '@orbita/standards';
import type { ActionState } from '@/lib/action-state';
import { actionCtx, runAction } from '@/server/actions';

const PATH = ['/admin/standards', '/workbench/taxonomy'];
const deps = () => ({ db: getDb() });

/** One Shopify vertical per call, so each request stays well inside serverless time limits. */
export async function loadShopifyPartAction(prefix: string): Promise<ActionState> {
  return runAction(async () => {
    const r = await loadShopifyPart(deps(), await actionCtx(), prefix);
    return { status: 'ok', message: '', data: { ...r } };
  }, PATH);
}

/** A chunk of UNSPSC rows parsed in the admin's browser (at most 5,000 per call). */
export async function importUnspscChunkAction(input: UnspscChunkInput): Promise<ActionState> {
  return runAction(async () => {
    const r = await importUnspscChunk(deps(), await actionCtx(), input);
    return { status: 'ok', message: '', data: { ...r } };
  }, PATH);
}
