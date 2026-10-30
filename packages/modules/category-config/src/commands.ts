import { createHash } from 'node:crypto';
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { recordAudit } from '@orbita/audit';
import { canonicalJson, compile, evaluate, type Sample } from '@orbita/contract';
import {
  attributes,
  categoryContracts,
  categoryRules,
  categoryVersions,
  contractTestCases,
  flagDefinitions,
  flagProfiles,
  profiles,
  roleGrants,
  specDefinitions,
  versionFlagValues,
  type Database,
  type DbOrTx,
} from '@orbita/db';
import { badRequest, conflict, forbidden, notFound, preconditionFailed } from '@orbita/domain';
import { flagValueProblem } from '@orbita/library';
import { categoryAttributeSet } from '@orbita/taxonomy';
import { compileInput, effectiveFlags, LOCK_MINUTES, loadSpecs, loadVersion, versionSubject, type Ctx, type VersionRef } from './load';

export interface ConfigDeps {
  db: Database;
}

const lockFresh = (v: VersionRef) => !!v.lockedBy && !!v.lockedAt && Date.now() - v.lockedAt.getTime() < LOCK_MINUTES * 60_000;

async function personName(tx: DbOrTx, id: string) {
  const [p] = await tx.select({ name: profiles.fullName, email: profiles.email }).from(profiles).where(eq(profiles.id, id));
  return p?.name || p?.email || 'Someone';
}

interface Change<T> {
  result: T;
  summary: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Every change to a version goes through here: permission, the edit lock (one editor at a time),
 * the change itself, the editor list used for separation of duties, and the audit entry, in one transaction.
 */
async function edit<T>(deps: ConfigDeps, ctx: Ctx, id: string, action: string, fn: (tx: DbOrTx, v: VersionRef) => Promise<Change<T>>): Promise<T> {
  return deps.db.transaction(async (tx) => {
    const v = await loadVersion(tx, id, true);
    if (!ctx.ability.can('update', versionSubject(v)))
      throw forbidden(v.state === 'DRAFT' || v.state === 'SENT_BACK' ? 'You cannot edit this category version.' : `This version is ${v.state.toLowerCase().replace('_', ' ')} and can no longer be edited.`);
    if (lockFresh(v) && v.lockedBy !== ctx.actor.id)
      throw conflict(`${await personName(tx, v.lockedBy!)} is editing this version. Ask them to finish, or take over after ${LOCK_MINUTES} minutes without changes.`);
    const change = await fn(tx, v);
    await tx
      .update(categoryVersions)
      .set({
        lockedBy: ctx.actor.id,
        lockedAt: new Date(),
        updatedBy: ctx.actor.id,
        editorIds: sql`case when ${ctx.actor.id}::uuid = any(${categoryVersions.editorIds}) then ${categoryVersions.editorIds} else array_append(${categoryVersions.editorIds}, ${ctx.actor.id}::uuid) end`,
      })
      .where(eq(categoryVersions.id, id));
    await recordAudit(tx, ctx, {
      action,
      subjectType: 'category_version',
      subjectId: id,
      summary: `${ctx.actor.email} ${change.summary} (${v.node.name} v${v.number})`,
      before: change.before as Record<string, unknown> | undefined,
      after: change.after as Record<string, unknown> | undefined,
    });
    return change.result;
  });
}

// ---------------------------------------------------------------------------
// Edit lock

/** Takes the lock when free or stale; with takeOver, also from someone idle for LOCK_MINUTES (that is the only case it is held but stale). */
export async function acquireLock(deps: ConfigDeps, ctx: Ctx, id: string) {
  return deps.db.transaction(async (tx) => {
    const v = await loadVersion(tx, id, true);
    if (!ctx.ability.can('update', versionSubject(v))) return { locked: false as const, reason: 'read-only' as const };
    if (lockFresh(v) && v.lockedBy !== ctx.actor.id) return { locked: false as const, reason: 'held' as const, by: await personName(tx, v.lockedBy!) };
    const takingOver = !!v.lockedBy && v.lockedBy !== ctx.actor.id;
    await tx.update(categoryVersions).set({ lockedBy: ctx.actor.id, lockedAt: new Date() }).where(eq(categoryVersions.id, id));
    if (takingOver)
      await recordAudit(tx, ctx, {
        action: 'config.lock.taken_over',
        subjectType: 'category_version',
        subjectId: id,
        summary: `${ctx.actor.email} took over editing from ${await personName(tx, v.lockedBy!)} after ${LOCK_MINUTES} minutes without changes (${v.node.name} v${v.number})`,
      });
    return { locked: true as const };
  });
}

export async function releaseLock(deps: ConfigDeps, ctx: Ctx, id: string) {
  await deps.db
    .update(categoryVersions)
    .set({ lockedBy: null, lockedAt: null })
    .where(and(eq(categoryVersions.id, id), eq(categoryVersions.lockedBy, ctx.actor.id)));
}

// ---------------------------------------------------------------------------
// Profile and flags

export async function applyProfile(deps: ConfigDeps, ctx: Ctx, id: string, profileId: string | null) {
  return edit(deps, ctx, id, 'config.profile.applied', async (tx, v) => {
    let name = 'no profile';
    let version: number | null = null;
    if (profileId) {
      const [p] = await tx.select().from(flagProfiles).where(eq(flagProfiles.id, profileId));
      if (!p) throw notFound('Flag profile');
      if (p.status !== 'active') throw preconditionFailed('That profile is deprecated.');
      name = `profile "${p.name}" v${p.version}`;
      version = p.version;
    }
    await tx.update(categoryVersions).set({ profileId, profileVersion: version }).where(eq(categoryVersions.id, id));
    return { result: null, summary: `applied ${name}`, before: { profileId: v.profileId, profileVersion: v.profileVersion }, after: { profileId, profileVersion: version } };
  });
}

export async function setFlag(deps: ConfigDeps, ctx: Ctx, id: string, key: string, value: unknown) {
  return edit(deps, ctx, id, 'config.flag.set', async (tx, v) => {
    const [def] = await tx.select().from(flagDefinitions).where(eq(flagDefinitions.key, key));
    if (!def || def.status !== 'active') throw notFound('Flag');
    if (def.groupName === 'transactional') throw forbidden(`${def.label} is set by the buying side, not per category.`);
    const problem = flagValueProblem(def, value);
    if (problem) throw badRequest(problem);
    const before = (await effectiveFlags(tx, v)).find((f) => f.key === key);
    await tx
      .insert(versionFlagValues)
      .values({ versionId: id, flagId: def.id, value })
      .onConflictDoUpdate({ target: [versionFlagValues.versionId, versionFlagValues.flagId], set: { value } });
    return { result: null, summary: `set ${def.label}`, before: { [key]: before?.value ?? null }, after: { [key]: value } };
  });
}

export async function clearFlag(deps: ConfigDeps, ctx: Ctx, id: string, key: string) {
  return edit(deps, ctx, id, 'config.flag.cleared', async (tx) => {
    const [def] = await tx.select().from(flagDefinitions).where(eq(flagDefinitions.key, key));
    if (!def) throw notFound('Flag');
    const gone = await tx.delete(versionFlagValues).where(and(eq(versionFlagValues.versionId, id), eq(versionFlagValues.flagId, def.id))).returning();
    return { result: null, summary: `reset ${def.label} to the profile or default`, before: { [key]: gone[0]?.value ?? null } };
  });
}

// ---------------------------------------------------------------------------
// Specifications

const LIST_TYPES = ['enumerable', 'multi_enumerable', 'ordinal', 'group_ordinal'];
const NUMBER_TYPES = ['numeric', 'numeric_range', 'measurable', 'measurable_range'];

/** Adds the category's attribute set (own and inherited, R1.1) as specifications, skipping those already there. */
export async function startFromAttributeSet(deps: ConfigDeps, ctx: Ctx, id: string) {
  return edit(deps, ctx, id, 'config.specs.seeded', async (tx, v) => {
    const set = await categoryAttributeSet(tx, ctx.ability, v.nodeId);
    const existing = await tx.select({ a: specDefinitions.attributeId }).from(specDefinitions).where(eq(specDefinitions.versionId, id));
    const have = new Set(existing.map((e) => e.a));
    const add = set.filter((a) => !have.has(a.attributeId));
    if (!add.length) return { result: { added: 0 }, summary: 'found no new attributes in the attribute set' };
    let sort = existing.length;
    await tx.insert(specDefinitions).values(
      add.map((a) => ({
        versionId: id,
        attributeId: a.attributeId,
        groupName: 'General',
        sortOrder: sort++,
        importance: a.required ? ('required' as const) : ('recommended' as const),
        filterable: LIST_TYPES.includes(a.dataType) || NUMBER_TYPES.includes(a.dataType),
        comparable: a.dataType !== 'text',
      })),
    );
    return { result: { added: add.length }, summary: `added ${add.length} specifications from the attribute set`, after: { attributes: add.map((a) => a.code) } };
  });
}

export async function addSpec(deps: ConfigDeps, ctx: Ctx, id: string, attributeId: string, groupName = 'General') {
  return edit(deps, ctx, id, 'config.spec.added', async (tx) => {
    const [a] = await tx.select().from(attributes).where(eq(attributes.id, attributeId));
    if (!a) throw notFound('Attribute');
    if (a.status !== 'active') throw preconditionFailed(`${a.name} is deprecated in the library.`);
    const [{ n }] = (await tx.select({ n: sql<number>`count(*)::int` }).from(specDefinitions).where(eq(specDefinitions.versionId, id))) as [{ n: number }];
    try {
      const [row] = await tx
        .insert(specDefinitions)
        .values({
          versionId: id,
          attributeId,
          groupName: groupName.trim() || 'General',
          sortOrder: n,
          importance: 'optional',
          filterable: LIST_TYPES.includes(a.dataType),
          comparable: a.dataType !== 'text',
        })
        .returning();
      return { result: row!, summary: `added specification ${a.name}`, after: { attribute: a.code } };
    } catch (e) {
      const x = e as { code?: string; cause?: { code?: string } };
      if (x.code === '23505' || x.cause?.code === '23505') throw conflict(`${a.name} is already a specification here.`);
      throw e;
    }
  });
}

const optionalNumber = z.number().finite().nullable().optional();
export const specPatch = z
  .object({
    groupName: z.string().trim().min(1).max(60).optional(),
    importance: z.enum(['key', 'required', 'recommended', 'optional']).optional(),
    filterable: z.boolean().optional(),
    comparable: z.boolean().optional(),
    variantOption: z.boolean().optional(),
    preference: z.enum(['none', 'higher', 'lower']).optional(),
    multiple: z.boolean().nullable().optional(),
    allowedValues: z.array(z.string()).nullable().optional(),
    minValue: optionalNumber,
    maxValue: optionalNumber,
    step: optionalNumber,
    decimals: z.number().int().min(0).max(6).nullable().optional(),
    unitId: z.uuid().nullable().optional(),
    sellerHint: z.string().trim().max(300).optional(),
    buyerHint: z.string().trim().max(300).optional(),
  })
  .strict();
export type SpecPatch = z.input<typeof specPatch>;

export async function updateSpec(deps: ConfigDeps, ctx: Ctx, id: string, specId: string, raw: SpecPatch) {
  const patch = specPatch.parse(raw);
  return edit(deps, ctx, id, 'config.spec.updated', async (tx) => {
    const specs = await loadSpecs(tx, id);
    const s = specs.find((x) => x.id === specId);
    if (!s) throw notFound('Specification');
    if (patch.allowedValues) {
      const unknown = patch.allowedValues.filter((x) => !s.options.some((o) => o.value === x));
      if (unknown.length) throw badRequest(`${unknown.join(', ')} ${unknown.length === 1 ? 'is' : 'are'} not in the value list of ${s.name}.`);
      if (!patch.allowedValues.length) throw badRequest('Allow at least one value.');
    }
    if (patch.unitId && !s.units.some((u) => u.id === patch.unitId)) throw badRequest(`That unit does not measure ${s.name}.`);
    const [before] = await tx.select().from(specDefinitions).where(eq(specDefinitions.id, specId));
    const [after] = await tx.update(specDefinitions).set(patch).where(eq(specDefinitions.id, specId)).returning();
    const changed = Object.keys(patch);
    return {
      result: after!,
      summary: `changed ${s.name}: ${changed.join(', ')}`,
      before: Object.fromEntries(changed.map((k) => [k, (before as Record<string, unknown>)[k]])),
      after: patch,
    };
  });
}

export async function removeSpec(deps: ConfigDeps, ctx: Ctx, id: string, specId: string) {
  return edit(deps, ctx, id, 'config.spec.removed', async (tx) => {
    const specs = await loadSpecs(tx, id);
    const s = specs.find((x) => x.id === specId);
    if (!s) throw notFound('Specification');
    await tx.delete(specDefinitions).where(eq(specDefinitions.id, specId));
    return { result: null, summary: `removed specification ${s.name}`, before: { attribute: s.key } };
  });
}

/** Moves a spec one place up or down; renumbers the whole list so the order stays dense. */
export async function moveSpec(deps: ConfigDeps, ctx: Ctx, id: string, specId: string, direction: 'up' | 'down') {
  return edit(deps, ctx, id, 'config.spec.moved', async (tx) => {
    const specs = await loadSpecs(tx, id);
    const i = specs.findIndex((x) => x.id === specId);
    if (i < 0) throw notFound('Specification');
    const j = direction === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= specs.length) return { result: null, summary: `kept ${specs[i]!.name} in place` };
    const order = specs.map((s) => s.id);
    [order[i], order[j]] = [order[j]!, order[i]!];
    for (let k = 0; k < order.length; k++) await tx.update(specDefinitions).set({ sortOrder: k }).where(eq(specDefinitions.id, order[k]!));
    return { result: null, summary: `moved ${specs[i]!.name} ${direction}` };
  });
}

export async function renameGroup(deps: ConfigDeps, ctx: Ctx, id: string, from: string, to: string) {
  const name = z.string().trim().min(1).max(60).parse(to);
  return edit(deps, ctx, id, 'config.group.renamed', async (tx) => {
    const rows = await tx.update(specDefinitions).set({ groupName: name }).where(and(eq(specDefinitions.versionId, id), eq(specDefinitions.groupName, from))).returning();
    if (!rows.length) throw notFound('Group');
    return { result: null, summary: `renamed group "${from}" to "${name}"`, before: { group: from }, after: { group: name } };
  });
}

export async function setTitleTemplate(deps: ConfigDeps, ctx: Ctx, id: string, template: string) {
  const t = z.string().trim().max(200).parse(template);
  return edit(deps, ctx, id, 'config.title.set', async (tx, v) => {
    await tx.update(categoryVersions).set({ titleTemplate: t }).where(eq(categoryVersions.id, id));
    return { result: null, summary: 'changed the title template', before: { titleTemplate: v.titleTemplate }, after: { titleTemplate: t } };
  });
}

// ---------------------------------------------------------------------------
// Rules

const conditionSchema = z.object({
  key: z.string().min(1),
  op: z.enum(['in', 'not_in', 'gte', 'lte', 'between', 'is_true', 'is_false', 'filled']),
  values: z.array(z.string()).optional(),
  value: z.number().finite().optional(),
  value2: z.number().finite().optional(),
});
export const ruleInput = z.object({
  ruleId: z.uuid().optional(),
  kind: z.enum(['restrict', 'require', 'hide', 'price']),
  name: z.string().trim().max(120).default(''),
  enabled: z.boolean().default(true),
  when: z.array(conditionSchema).max(5).default([]),
  target: z.string().optional(),
  values: z.array(z.string()).optional(),
  min: z.number().finite().nullable().optional(),
  max: z.number().finite().nullable().optional(),
  priceMin: z.number().finite().nonnegative().nullable().optional(),
  priceMax: z.number().finite().nonnegative().nullable().optional(),
  message: z.string().trim().max(200).optional(),
});
export type RuleInputRaw = z.input<typeof ruleInput>;

/** Saves a rule, then compiles the draft and returns the issues about this rule, so the editor can show them at once. */
export async function saveRule(deps: ConfigDeps, ctx: Ctx, id: string, raw: RuleInputRaw) {
  const r = ruleInput.parse(raw);
  const { ruleId, kind, name, enabled, ...rest } = r;
  const definition = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) as Record<string, unknown>;
  const saved = await edit(deps, ctx, id, ruleId ? 'config.rule.updated' : 'config.rule.added', async (tx) => {
    if (ruleId) {
      const [before] = await tx.select().from(categoryRules).where(and(eq(categoryRules.id, ruleId), eq(categoryRules.versionId, id)));
      if (!before) throw notFound('Rule');
      const [row] = await tx.update(categoryRules).set({ kind, name, enabled, definition }).where(eq(categoryRules.id, ruleId)).returning();
      return { result: row!, summary: `changed rule "${name || kind}"`, before: { kind: before.kind, name: before.name, enabled: before.enabled, definition: before.definition }, after: { kind, name, enabled, definition } };
    }
    const [{ n }] = (await tx.select({ n: sql<number>`count(*)::int` }).from(categoryRules).where(eq(categoryRules.versionId, id))) as [{ n: number }];
    const [row] = await tx.insert(categoryRules).values({ versionId: id, kind, name, enabled, definition, sortOrder: n, createdBy: ctx.actor.id }).returning();
    return { result: row!, summary: `added ${kind} rule "${name || kind}"`, after: { kind, name, enabled, definition } };
  });
  const v = await loadVersion(deps.db, id);
  const res = compile((await compileInput(deps.db, v)).input);
  return { rule: saved, issues: res.issues.filter((i) => i.ref === saved.id) };
}

export async function setRuleEnabled(deps: ConfigDeps, ctx: Ctx, id: string, ruleId: string, enabled: boolean) {
  return edit(deps, ctx, id, 'config.rule.toggled', async (tx) => {
    const [row] = await tx.update(categoryRules).set({ enabled }).where(and(eq(categoryRules.id, ruleId), eq(categoryRules.versionId, id))).returning();
    if (!row) throw notFound('Rule');
    return { result: null, summary: `${enabled ? 'switched on' : 'switched off'} rule "${row.name || row.kind}"`, after: { enabled } };
  });
}

export async function deleteRule(deps: ConfigDeps, ctx: Ctx, id: string, ruleId: string) {
  return edit(deps, ctx, id, 'config.rule.deleted', async (tx) => {
    const [row] = await tx.delete(categoryRules).where(and(eq(categoryRules.id, ruleId), eq(categoryRules.versionId, id))).returning();
    if (!row) throw notFound('Rule');
    return { result: null, summary: `deleted rule "${row.name || row.kind}"`, before: { kind: row.kind, name: row.name, definition: row.definition } };
  });
}

// ---------------------------------------------------------------------------
// Contract test cases

const sampleSchema = z.object({
  values: z.record(z.string(), z.unknown()),
  brand: z.string().trim().max(80).optional(),
  model: z.string().trim().max(80).optional(),
  price: z.number().finite().nullable().optional(),
  mrp: z.number().finite().nullable().optional(),
});
export const testCaseInput = z.object({
  testId: z.uuid().optional(),
  name: z.string().trim().min(2).max(120),
  expectation: z.enum(['pass', 'fail']),
  sample: sampleSchema,
});
export type TestCaseInput = z.input<typeof testCaseInput>;

export async function saveTestCase(deps: ConfigDeps, ctx: Ctx, id: string, raw: TestCaseInput) {
  const t = testCaseInput.parse(raw);
  return edit(deps, ctx, id, t.testId ? 'config.test.updated' : 'config.test.added', async (tx) => {
    if (t.testId) {
      const [row] = await tx
        .update(contractTestCases)
        .set({ name: t.name, expectation: t.expectation, sample: t.sample, lastResult: null, lastMessage: null, lastRunAt: null })
        .where(and(eq(contractTestCases.id, t.testId), eq(contractTestCases.versionId, id)))
        .returning();
      if (!row) throw notFound('Test case');
      return { result: row, summary: `changed test case "${t.name}"` };
    }
    const [row] = await tx.insert(contractTestCases).values({ versionId: id, name: t.name, expectation: t.expectation, sample: t.sample, createdBy: ctx.actor.id }).returning();
    return { result: row!, summary: `added test case "${t.name}" (must ${t.expectation})`, after: { name: t.name, expectation: t.expectation } };
  });
}

export async function deleteTestCase(deps: ConfigDeps, ctx: Ctx, id: string, testId: string) {
  return edit(deps, ctx, id, 'config.test.deleted', async (tx) => {
    const [row] = await tx.delete(contractTestCases).where(and(eq(contractTestCases.id, testId), eq(contractTestCases.versionId, id))).returning();
    if (!row) throw notFound('Test case');
    return { result: null, summary: `deleted test case "${row.name}"` };
  });
}

// ---------------------------------------------------------------------------
// Compile

/**
 * Compiles the version, runs every test case against the result, and stores the outcome. A compile
 * that passes and whose tests all behave as expected is what R3 submits for approval.
 */
export async function compileVersion(deps: ConfigDeps, ctx: Ctx, id: string) {
  return edit(deps, ctx, id, 'config.compiled', async (tx, v) => {
    const { input } = await compileInput(tx, v);
    const res = compile(input);
    const tests = await tx.select().from(contractTestCases).where(eq(contractTestCases.versionId, id)).orderBy(asc(contractTestCases.createdAt));
    let passed = 0;
    let failed = 0;
    const results: { id: string; name: string; ok: boolean; message: string }[] = [];
    for (const t of tests) {
      let ok = false;
      let message = 'The contract did not compile.';
      if (res.contract) {
        const e = evaluate(res.contract, t.sample as unknown as Sample);
        const problems = e.errors.length;
        ok = t.expectation === 'pass' ? problems === 0 : problems > 0;
        message = problems ? e.errors[0]!.message + (problems > 1 ? ` (+${problems - 1} more)` : '') : 'No problems.';
      }
      if (ok) passed++;
      else failed++;
      results.push({ id: t.id, name: t.name, ok, message });
      await tx.update(contractTestCases).set({ lastResult: ok ? 'pass' : 'fail', lastMessage: message, lastRunAt: new Date() }).where(eq(contractTestCases.id, t.id));
    }
    const hash = res.contract ? createHash('sha256').update(canonicalJson(res.contract)).digest('hex') : null;
    const [row] = await tx
      .insert(categoryContracts)
      .values({ versionId: id, ok: res.ok, hash, contract: res.contract, issues: res.issues, testsPassed: passed, testsFailed: failed, compiledBy: ctx.actor.id })
      .returning();
    const errors = res.issues.filter((i) => i.severity === 'error').length;
    return {
      result: { id: row!.id, ok: res.ok, hash, issues: res.issues, tests: results, contract: res.contract },
      summary: res.ok
        ? `compiled the contract ${hash!.slice(0, 12)}; ${passed} of ${tests.length} test cases behaved as expected`
        : `tried to compile; ${errors} problem${errors === 1 ? '' : 's'} to fix`,
      after: { ok: res.ok, hash, errors, testsPassed: passed, testsFailed: failed },
    };
  });
}

// ---------------------------------------------------------------------------
// Clone and assign

export const CLONE_SECTIONS = ['flags', 'specs', 'rules', 'title', 'tests'] as const;
export type CloneSection = (typeof CLONE_SECTIONS)[number];

/** Copies sections from another version (a sibling category, or an earlier version), replacing what is here. */
export async function cloneFrom(deps: ConfigDeps, ctx: Ctx, id: string, sourceId: string, sections: CloneSection[]) {
  if (!sections.length) throw badRequest('Pick at least one section to copy.');
  if (sourceId === id) throw badRequest('Pick another version to copy from.');
  return edit(deps, ctx, id, 'config.cloned', async (tx) => {
    const src = await loadVersion(tx, sourceId);
    if (!ctx.ability.can('read', versionSubject(src))) throw forbidden('You cannot read that version.');
    if (sections.includes('flags')) {
      await tx.delete(versionFlagValues).where(eq(versionFlagValues.versionId, id));
      const rows = await tx.select().from(versionFlagValues).where(eq(versionFlagValues.versionId, sourceId));
      if (rows.length) await tx.insert(versionFlagValues).values(rows.map((r) => ({ versionId: id, flagId: r.flagId, value: r.value })));
      await tx.update(categoryVersions).set({ profileId: src.profileId, profileVersion: src.profileVersion }).where(eq(categoryVersions.id, id));
    }
    if (sections.includes('specs')) {
      await tx.delete(specDefinitions).where(eq(specDefinitions.versionId, id));
      const rows = await tx.select().from(specDefinitions).where(eq(specDefinitions.versionId, sourceId));
      if (rows.length) await tx.insert(specDefinitions).values(rows.map(({ id: _i, versionId: _v, createdAt: _c, updatedAt: _u, ...r }) => ({ ...r, versionId: id })));
    }
    if (sections.includes('rules')) {
      await tx.delete(categoryRules).where(eq(categoryRules.versionId, id));
      const rows = await tx.select().from(categoryRules).where(eq(categoryRules.versionId, sourceId));
      if (rows.length)
        await tx.insert(categoryRules).values(rows.map((r) => ({ versionId: id, kind: r.kind, name: r.name, enabled: r.enabled, definition: r.definition, sortOrder: r.sortOrder, createdBy: ctx.actor.id })));
    }
    if (sections.includes('title')) await tx.update(categoryVersions).set({ titleTemplate: src.titleTemplate }).where(eq(categoryVersions.id, id));
    if (sections.includes('tests')) {
      await tx.delete(contractTestCases).where(eq(contractTestCases.versionId, id));
      const rows = await tx.select().from(contractTestCases).where(eq(contractTestCases.versionId, sourceId));
      if (rows.length) await tx.insert(contractTestCases).values(rows.map((r) => ({ versionId: id, name: r.name, expectation: r.expectation, sample: r.sample, createdBy: ctx.actor.id })));
    }
    return { result: null, summary: `copied ${sections.join(', ')} from ${src.node.name} v${src.number}`, after: { sourceId, sections } };
  });
}

/** Category managers who can work on this version: global ones, and those of its workgroup. */
export async function assignableManagers(db: DbOrTx, v: Pick<VersionRef, 'workgroupId'>) {
  return db
    .selectDistinct({ id: profiles.id, name: profiles.fullName, email: profiles.email })
    .from(roleGrants)
    .innerJoin(profiles, eq(profiles.id, roleGrants.userId))
    .where(
      and(
        eq(roleGrants.role, 'category_manager'),
        isNull(roleGrants.revokedAt),
        eq(profiles.status, 'active'),
        v.workgroupId ? or(eq(roleGrants.scopeType, 'global'), and(eq(roleGrants.scopeType, 'workgroup'), eq(roleGrants.scopeId, v.workgroupId))) : eq(roleGrants.scopeType, 'global'),
      ),
    )
    .orderBy(asc(profiles.fullName));
}

export async function assignVersion(deps: ConfigDeps, ctx: Ctx, id: string, assigneeId: string) {
  return deps.db.transaction(async (tx) => {
    const v = await loadVersion(tx, id, true);
    if (!ctx.ability.can('assign', versionSubject(v))) throw forbidden('You cannot reassign this version.');
    const people = await assignableManagers(tx, v);
    const who = people.find((p) => p.id === assigneeId);
    if (!who) throw badRequest('Pick a category manager who works on this part of the tree.');
    await tx.update(categoryVersions).set({ assigneeId }).where(eq(categoryVersions.id, id));
    await recordAudit(tx, ctx, {
      action: 'config.assigned',
      subjectType: 'category_version',
      subjectId: id,
      summary: `${ctx.actor.email} assigned ${v.node.name} v${v.number} to ${who.name || who.email}`,
      before: { assigneeId: v.assigneeId },
      after: { assigneeId },
    });
  });
}
