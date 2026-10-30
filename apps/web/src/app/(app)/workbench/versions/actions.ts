'use server';

import {
  acquireLock,
  addSpec,
  applyProfile,
  assignVersion,
  clearFlag,
  cloneFrom,
  compileVersion,
  deleteRule,
  deleteTestCase,
  moveSpec,
  releaseLock,
  removeSpec,
  renameGroup,
  saveRule,
  saveTestCase,
  setFlag,
  setRuleEnabled,
  setTitleTemplate,
  startFromAttributeSet,
  updateSpec,
  type CloneSection,
  type RuleInputRaw,
  type SpecPatch,
  type TestCaseInput,
} from '@orbita/category-config';
import { getDb } from '@orbita/db';
import { listAttributes } from '@orbita/library';
import type { ActionState } from '@/lib/action-state';
import { actionCtx, runAction } from '@/server/actions';

const deps = () => ({ db: getDb() });
const paths = (id: string) => [`/workbench/versions/${id}`, '/workbench/versions', '/workbench'];
const ok = (message: string, data?: Record<string, unknown>): ActionState => ({ status: 'ok', message, data });
const plain = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export async function acquireLockAction(id: string) {
  const ctx = await actionCtx();
  return acquireLock(deps(), ctx, id);
}

export async function releaseLockAction(id: string) {
  const ctx = await actionCtx();
  await releaseLock(deps(), ctx, id);
}

export async function applyProfileAction(id: string, profileId: string | null) {
  return runAction(async () => {
    await applyProfile(deps(), await actionCtx(), id, profileId);
    return ok(profileId ? 'Profile applied.' : 'Profile removed.');
  }, paths(id));
}

export async function setFlagAction(id: string, key: string, value: unknown) {
  return runAction(async () => {
    await setFlag(deps(), await actionCtx(), id, key, value);
    return ok('Saved.');
  }, paths(id));
}

export async function clearFlagAction(id: string, key: string) {
  return runAction(async () => {
    await clearFlag(deps(), await actionCtx(), id, key);
    return ok('Back to the profile or default.');
  }, paths(id));
}

export async function startFromAttributeSetAction(id: string) {
  return runAction(async () => {
    const r = await startFromAttributeSet(deps(), await actionCtx(), id);
    return ok(r.added ? `Added ${r.added} specification${r.added === 1 ? '' : 's'} from the attribute set.` : 'Everything in the attribute set is already here.');
  }, paths(id));
}

export async function searchAttributesAction(q: string) {
  const ctx = await actionCtx();
  const rows = await listAttributes(getDb(), ctx.ability, { q: q || undefined, status: 'active' });
  return rows.slice(0, 40).map((r) => ({ id: r.attribute.id, name: r.attribute.name, code: r.attribute.code, dataType: r.attribute.dataType, source: r.attribute.source }));
}

export async function addSpecAction(id: string, attributeId: string, groupName?: string) {
  return runAction(async () => {
    await addSpec(deps(), await actionCtx(), id, attributeId, groupName);
    return ok('Specification added.');
  }, paths(id));
}

export async function updateSpecAction(id: string, specId: string, patch: SpecPatch) {
  return runAction(async () => {
    await updateSpec(deps(), await actionCtx(), id, specId, patch);
    return ok('');
  }, paths(id));
}

export async function removeSpecAction(id: string, specId: string) {
  return runAction(async () => {
    await removeSpec(deps(), await actionCtx(), id, specId);
    return ok('Specification removed.');
  }, paths(id));
}

export async function moveSpecAction(id: string, specId: string, direction: 'up' | 'down') {
  return runAction(async () => {
    await moveSpec(deps(), await actionCtx(), id, specId, direction);
    return ok('');
  }, paths(id));
}

export async function renameGroupAction(id: string, from: string, to: string) {
  return runAction(async () => {
    await renameGroup(deps(), await actionCtx(), id, from, to);
    return ok(`Group renamed to ${to}.`);
  }, paths(id));
}

export async function setTitleTemplateAction(id: string, template: string) {
  return runAction(async () => {
    await setTitleTemplate(deps(), await actionCtx(), id, template);
    return ok('Title template saved.');
  }, paths(id));
}

export async function saveRuleAction(id: string, input: RuleInputRaw) {
  return runAction(async () => {
    const r = await saveRule(deps(), await actionCtx(), id, input);
    const errors = r.issues.filter((i) => i.severity === 'error');
    return ok(errors.length ? `Saved, but it needs fixing: ${errors[0]!.message}` : 'Rule saved.', plain({ ruleId: r.rule.id, issues: r.issues }));
  }, paths(id));
}

export async function setRuleEnabledAction(id: string, ruleId: string, enabled: boolean) {
  return runAction(async () => {
    await setRuleEnabled(deps(), await actionCtx(), id, ruleId, enabled);
    return ok(enabled ? 'Rule switched on.' : 'Rule switched off.');
  }, paths(id));
}

export async function deleteRuleAction(id: string, ruleId: string) {
  return runAction(async () => {
    await deleteRule(deps(), await actionCtx(), id, ruleId);
    return ok('Rule deleted.');
  }, paths(id));
}

export async function saveTestCaseAction(id: string, input: TestCaseInput) {
  return runAction(async () => {
    await saveTestCase(deps(), await actionCtx(), id, input);
    return ok('Test case saved. It runs on every compile.');
  }, paths(id));
}

export async function deleteTestCaseAction(id: string, testId: string) {
  return runAction(async () => {
    await deleteTestCase(deps(), await actionCtx(), id, testId);
    return ok('Test case deleted.');
  }, paths(id));
}

export async function compileAction(id: string) {
  return runAction(async () => {
    const r = await compileVersion(deps(), await actionCtx(), id);
    const errors = r.issues.filter((i) => i.severity === 'error').length;
    const failed = r.tests.filter((t) => !t.ok).length;
    const message = !r.ok
      ? `Not compiled: ${errors} problem${errors === 1 ? '' : 's'} to fix.`
      : failed
        ? `Compiled, but ${failed} test case${failed === 1 ? '' : 's'} did not behave as expected.`
        : `Compiled. Contract ${r.hash!.slice(0, 12)}${r.tests.length ? `; all ${r.tests.length} test cases behave as expected` : ''}.`;
    return { status: r.ok && !failed ? 'ok' : 'error', message } as ActionState;
  }, paths(id));
}

export async function cloneFromAction(id: string, sourceId: string, sections: CloneSection[]) {
  return runAction(async () => {
    await cloneFrom(deps(), await actionCtx(), id, sourceId, sections);
    return ok('Copied.');
  }, paths(id));
}

export async function assignVersionAction(id: string, assigneeId: string) {
  return runAction(async () => {
    await assignVersion(deps(), await actionCtx(), id, assigneeId);
    return ok('Reassigned.');
  }, paths(id));
}
