'use server';

import {
  getValueList,
  saveAttribute,
  saveBooleanPair,
  saveCertificateType,
  saveDimension,
  saveUnit,
  saveValueList,
  similarAttributes,
  updateSetting,
  type AttributeInput,
  type BooleanPairInput,
  type CertificateTypeInput,
  type DimensionInput,
  type UnitInput,
  type ValueListInput,
} from '@orbita/library';
import { getDb } from '@orbita/db';
import type { ActionState } from '@/lib/action-state';
import { actionCtx, runAction } from '@/server/actions';

const PATH = ['/admin/library'];
const deps = () => ({ db: getDb() });
const ok = (message: string, data?: Record<string, unknown>): ActionState => ({ status: 'ok', message, data });

export async function saveAttributeAction(input: AttributeInput) {
  return runAction(async () => {
    const row = await saveAttribute(deps(), await actionCtx(), input);
    return ok(`${row.name} saved.`, { id: row.id });
  }, PATH);
}

export async function similarAttributesAction(name: string, excludeId?: string) {
  const ctx = await actionCtx();
  return similarAttributes(getDb(), ctx.ability, name, excludeId);
}

export async function getValueListAction(id: string) {
  const ctx = await actionCtx();
  return JSON.parse(JSON.stringify(await getValueList(getDb(), ctx.ability, id)));
}

export async function saveValueListAction(input: ValueListInput) {
  return runAction(async () => {
    const list = await saveValueList(deps(), await actionCtx(), input);
    return ok(`${list.name} saved.`, { id: list.id });
  }, PATH);
}

export async function saveDimensionAction(input: DimensionInput) {
  return runAction(async () => ok(`${(await saveDimension(deps(), await actionCtx(), input)).name} saved.`), PATH);
}

export async function saveUnitAction(input: UnitInput) {
  return runAction(async () => ok(`${(await saveUnit(deps(), await actionCtx(), input)).name} saved.`), PATH);
}

export async function saveBooleanPairAction(input: BooleanPairInput) {
  return runAction(async () => {
    const p = await saveBooleanPair(deps(), await actionCtx(), input);
    return ok(`${p.trueLabel} / ${p.falseLabel} saved.`);
  }, PATH);
}

export async function saveCertificateTypeAction(input: CertificateTypeInput) {
  return runAction(async () => ok(`${(await saveCertificateType(deps(), await actionCtx(), input)).name} saved.`), PATH);
}

export async function updateSettingAction(key: string, value: string) {
  return runAction(async () => ok(`${(await updateSetting(deps(), await actionCtx(), key, value)).label} updated.`), PATH);
}
