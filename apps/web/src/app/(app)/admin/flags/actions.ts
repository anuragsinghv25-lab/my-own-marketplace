'use server';

import { getDb } from '@orbita/db';
import {
  getFlagProfile,
  saveFlagDefinition,
  saveFlagProfile,
  type FlagDefinitionInput,
  type FlagProfileInput,
} from '@orbita/library';
import type { ActionState } from '@/lib/action-state';
import { actionCtx, runAction } from '@/server/actions';

const PATH = ['/admin/flags'];
const deps = () => ({ db: getDb() });

export async function saveFlagDefinitionAction(input: FlagDefinitionInput): Promise<ActionState> {
  return runAction(async () => {
    const f = await saveFlagDefinition(deps(), await actionCtx(), input);
    return { status: 'ok', message: `${f.label} saved.` };
  }, PATH);
}

export async function getFlagProfileAction(id: string) {
  const ctx = await actionCtx();
  return JSON.parse(JSON.stringify(await getFlagProfile(getDb(), ctx.ability, id)));
}

export async function saveFlagProfileAction(input: FlagProfileInput): Promise<ActionState> {
  return runAction(async () => {
    const p = await saveFlagProfile(deps(), await actionCtx(), input);
    return { status: 'ok', message: `${p.name} saved as version ${p.version}.`, data: { id: p.id } };
  }, PATH);
}
