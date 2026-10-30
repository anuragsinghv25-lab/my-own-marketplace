import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { subject, type AppAbility } from '@orbita/authz';
import { compile, describeRule, fieldsFor, type CompileInput, type Condition, type FlagInput, type RuleInput, type SpecInput } from '@orbita/contract';
import {
  attributes,
  auditEvents,
  booleanPairs,
  categoryContracts,
  categoryNodes,
  categoryRules,
  categoryVersions,
  contractTestCases,
  flagDefinitions,
  flagProfiles,
  flagProfileValues,
  platformSettings,
  profiles,
  specDefinitions,
  units,
  valueListItems,
  versionFlagValues,
  type CategoryRule,
  type DbOrTx,
} from '@orbita/db';
import { forbidden, notFound, type Actor, type RequestMeta } from '@orbita/domain';
import { categoryAttributeSet } from '@orbita/taxonomy';

export interface Ctx {
  actor: Actor;
  ability: AppAbility;
  meta: RequestMeta;
}

/** Minutes of inactivity after which another category manager may take over a version. */
export const LOCK_MINUTES = 15;

export interface VersionRef {
  id: string;
  nodeId: string;
  number: number;
  state: string;
  assigneeId: string | null;
  profileId: string | null;
  profileVersion: number | null;
  titleTemplate: string;
  lockedBy: string | null;
  lockedAt: Date | null;
  editorIds: string[];
  node: { id: string; code: string; name: string; kind: string; path: string[] };
  workgroupId: string | null;
}

/** The version, its listing category and the workgroup that owns it (inherited down the tree). */
export async function loadVersion(db: DbOrTx, id: string, forUpdate = false): Promise<VersionRef> {
  const [v] = forUpdate
    ? await db.select().from(categoryVersions).where(eq(categoryVersions.id, id)).for('update')
    : await db.select().from(categoryVersions).where(eq(categoryVersions.id, id));
  if (!v) throw notFound('Category version');
  const chain = await db.execute<{ id: string; code: string; name: string; kind: string; workgroup_id: string | null; depth: number }>(sql`
    with recursive up as (
      select id, parent_id, code, name, kind, workgroup_id, 0 as depth from category_nodes where id = ${v.nodeId}
      union all
      select n.id, n.parent_id, n.code, n.name, n.kind, n.workgroup_id, up.depth + 1 from category_nodes n join up on n.id = up.parent_id
    )
    select id, code, name, kind, workgroup_id, depth from up order by depth desc`);
  const self = chain.at(-1)!;
  return {
    id: v.id,
    nodeId: v.nodeId,
    number: v.version,
    state: v.state,
    assigneeId: v.assigneeId,
    profileId: v.profileId,
    profileVersion: v.profileVersion,
    titleTemplate: v.titleTemplate,
    lockedBy: v.lockedBy,
    lockedAt: v.lockedAt,
    editorIds: v.editorIds,
    node: { id: self.id, code: self.code, name: self.name, kind: self.kind, path: chain.map((c) => c.name) },
    workgroupId: [...chain].reverse().find((c) => c.workgroup_id)?.workgroup_id ?? null,
  };
}

export const versionSubject = (v: Pick<VersionRef, 'workgroupId' | 'state' | 'editorIds'>) =>
  subject('CategoryVersion', { workgroupId: v.workgroupId, state: v.state, editorIds: v.editorIds });

export function assertRead(ability: AppAbility, v: VersionRef) {
  if (!ability.can('read', versionSubject(v))) throw forbidden('You cannot view this category version.');
}

// ---------------------------------------------------------------------------
// Flags: platform default → profile → this version

export interface EffectiveFlag {
  id: string;
  key: string;
  label: string;
  group: string;
  valueType: FlagInput['valueType'];
  schema: { options?: string[]; unit?: string; min?: number; max?: number };
  helpText: string;
  defaultValue: unknown;
  profileValue: unknown;
  versionValue: unknown;
  value: unknown;
  source: FlagInput['source'];
  /** transactional flags belong to the buying side and are read-only for category teams */
  readOnly: boolean;
}

export async function effectiveFlags(db: DbOrTx, v: Pick<VersionRef, 'id' | 'profileId'>): Promise<EffectiveFlag[]> {
  const defs = await db.select().from(flagDefinitions).where(eq(flagDefinitions.status, 'active')).orderBy(asc(flagDefinitions.groupName), asc(flagDefinitions.label));
  const prof = v.profileId ? await db.select().from(flagProfileValues).where(eq(flagProfileValues.profileId, v.profileId)) : [];
  const own = await db.select().from(versionFlagValues).where(eq(versionFlagValues.versionId, v.id));
  return defs.map((d) => {
    const p = prof.find((x) => x.flagId === d.id);
    const o = own.find((x) => x.flagId === d.id);
    const has = (x: unknown) => x !== undefined && x !== null;
    const source: FlagInput['source'] = o ? 'version' : p ? 'profile' : has(d.defaultValue) ? 'default' : 'none';
    return {
      id: d.id,
      key: d.key,
      label: d.label,
      group: d.groupName,
      valueType: d.valueType,
      schema: d.schema,
      helpText: d.helpText,
      defaultValue: d.defaultValue,
      profileValue: p?.value,
      versionValue: o?.value,
      value: o ? o.value : p ? p.value : (d.defaultValue ?? null),
      source,
      readOnly: d.groupName === 'transactional',
    };
  });
}

// ---------------------------------------------------------------------------
// Specs with everything the editor and the compiler need from the library

export interface SpecView {
  id: string;
  attributeId: string;
  key: string;
  name: string;
  dataType: SpecInput['attributeType'];
  attributeStatus: string;
  source: string;
  groupName: string;
  sortOrder: number;
  importance: SpecInput['importance'];
  filterable: boolean;
  comparable: boolean;
  variantOption: boolean;
  preference: SpecInput['preference'];
  multiple: boolean | null;
  allowedValues: string[] | null;
  minValue: number | null;
  maxValue: number | null;
  step: number | null;
  decimals: number | null;
  unitId: string | null;
  sellerHint: string;
  buyerHint: string;
  /** library side */
  options: { value: string; weight: number | null; group: string | null }[];
  attributeValidation: Record<string, number | string>;
  booleanLabels: { true: string; false: string } | null;
  units: { id: string; code: string; symbol: string; name: string; isDefault: boolean }[];
}

export async function loadSpecs(db: DbOrTx, versionId: string): Promise<SpecView[]> {
  const rows = await db
    .select({ s: specDefinitions, a: attributes, pair: booleanPairs })
    .from(specDefinitions)
    .innerJoin(attributes, eq(attributes.id, specDefinitions.attributeId))
    .leftJoin(booleanPairs, eq(booleanPairs.id, attributes.booleanPairId))
    .where(eq(specDefinitions.versionId, versionId))
    .orderBy(asc(specDefinitions.sortOrder), asc(attributes.name));
  const listIds = [...new Set(rows.map((r) => r.a.valueListId).filter((x): x is string => !!x))];
  const items = listIds.length
    ? await db
        .select()
        .from(valueListItems)
        .where(and(inArray(valueListItems.listId, listIds), eq(valueListItems.status, 'active')))
        .orderBy(asc(valueListItems.sortOrder))
    : [];
  const dimIds = [...new Set(rows.map((r) => r.a.dimensionId).filter((x): x is string => !!x))];
  const dimUnits = dimIds.length ? await db.select().from(units).where(and(inArray(units.dimensionId, dimIds), eq(units.status, 'active'))) : [];
  return rows.map(({ s, a, pair }) => ({
    id: s.id,
    attributeId: a.id,
    key: a.code,
    name: a.name,
    dataType: a.dataType,
    attributeStatus: a.status,
    source: a.source,
    groupName: s.groupName,
    sortOrder: s.sortOrder,
    importance: s.importance,
    filterable: s.filterable,
    comparable: s.comparable,
    variantOption: s.variantOption,
    preference: s.preference,
    multiple: s.multiple,
    allowedValues: s.allowedValues,
    minValue: s.minValue,
    maxValue: s.maxValue,
    step: s.step,
    decimals: s.decimals,
    unitId: s.unitId,
    sellerHint: s.sellerHint || a.sellerHint,
    buyerHint: s.buyerHint || a.buyerHint,
    options: items.filter((i) => i.listId === a.valueListId).map((i) => ({ value: i.value, weight: i.weight, group: i.groupName })),
    attributeValidation: a.validation,
    booleanLabels: pair ? { true: pair.trueLabel, false: pair.falseLabel } : null,
    units: dimUnits
      .filter((u) => u.dimensionId === a.dimensionId)
      .map((u) => ({ id: u.id, code: u.code, symbol: u.symbol, name: u.name, isDefault: u.id === a.defaultUnitId })),
  }));
}

export function toSpecInput(s: SpecView): SpecInput {
  const unit = s.units.find((u) => (s.unitId ? u.id === s.unitId : u.isDefault));
  const av = s.attributeValidation;
  const num = (k: string) => (typeof av[k] === 'number' ? (av[k] as number) : undefined);
  return {
    key: s.key,
    label: s.name,
    attributeType: s.dataType,
    group: s.groupName,
    importance: s.importance,
    filterable: s.filterable,
    comparable: s.comparable,
    variantOption: s.variantOption,
    preference: s.preference,
    multiple: s.multiple,
    options: s.options,
    allowedValues: s.allowedValues,
    booleanLabels: s.booleanLabels,
    unit: unit ? { code: unit.code, symbol: unit.symbol, name: unit.name } : null,
    attributeValidation: {
      min: num('min'),
      max: num('max'),
      step: num('step'),
      decimals: num('decimals'),
      maxLength: num('maxLength'),
      regex: typeof av.regex === 'string' ? av.regex : undefined,
    },
    min: s.minValue,
    max: s.maxValue,
    step: s.step,
    decimals: s.decimals,
    sellerHint: s.sellerHint,
    buyerHint: s.buyerHint,
  };
}

export function toRuleInput(r: CategoryRule): RuleInput {
  const d = r.definition as { when?: Condition[]; target?: string; values?: string[]; min?: number | null; max?: number | null; priceMin?: number | null; priceMax?: number | null; message?: string };
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    enabled: r.enabled,
    when: d.when ?? [],
    target: d.target,
    values: d.values,
    min: d.min ?? null,
    max: d.max ?? null,
    priceMin: d.priceMin ?? null,
    priceMax: d.priceMax ?? null,
    message: d.message,
  };
}

/** Everything the compiler needs, resolved from the database. */
export async function compileInput(db: DbOrTx, v: VersionRef): Promise<{ input: CompileInput; specs: SpecView[]; flags: EffectiveFlag[]; rules: CategoryRule[] }> {
  const [specs, flags, rules, [titleCap]] = await Promise.all([
    loadSpecs(db, v.id),
    effectiveFlags(db, v),
    db.select().from(categoryRules).where(eq(categoryRules.versionId, v.id)).orderBy(asc(categoryRules.sortOrder), asc(categoryRules.createdAt)),
    db.select().from(platformSettings).where(eq(platformSettings.key, 'product_title_max_length')),
  ]);
  return {
    specs,
    flags,
    rules,
    input: {
      category: { id: v.node.id, code: v.node.code, name: v.node.name, path: v.node.path },
      version: { id: v.id, number: v.number },
      flags: flags.map((f) => ({ key: f.key, label: f.label, valueType: f.valueType, value: f.value, source: f.source })),
      specs: specs.map(toSpecInput),
      rules: rules.map(toRuleInput),
      titleTemplate: v.titleTemplate,
      titleMaxLength: typeof titleCap?.value === 'number' ? titleCap.value : 120,
    },
  };
}

/** Compiles the current draft without saving anything (live preview, simulator). */
export async function compileDraft(db: DbOrTx, ability: AppAbility, id: string) {
  const v = await loadVersion(db, id);
  assertRead(ability, v);
  return compile((await compileInput(db, v)).input);
}

// ---------------------------------------------------------------------------
// The editor's view of a version

export async function getWorkspace(db: DbOrTx, ctx: Pick<Ctx, 'actor' | 'ability'>, id: string) {
  const v = await loadVersion(db, id);
  assertRead(ctx.ability, v);
  const { specs, flags, rules, input } = await compileInput(db, v);
  const draft = compile(input);
  const fieldMap = fieldsFor(input.specs);
  const names = await db
    .select({ id: profiles.id, name: profiles.fullName, email: profiles.email })
    .from(profiles)
    .where(inArray(profiles.id, [v.assigneeId, v.lockedBy].filter((x): x is string => !!x).concat(['00000000-0000-0000-0000-000000000000'])));
  const nameOf = (uid: string | null) => (uid ? (names.find((n) => n.id === uid)?.name || names.find((n) => n.id === uid)?.email || null) : null);
  const allProfiles = await db.select({ id: flagProfiles.id, name: flagProfiles.name, version: flagProfiles.version }).from(flagProfiles).where(eq(flagProfiles.status, 'active')).orderBy(asc(flagProfiles.name));
  const profile = v.profileId ? (await db.select().from(flagProfiles).where(eq(flagProfiles.id, v.profileId)))[0] : undefined;
  const tests = await db.select().from(contractTestCases).where(eq(contractTestCases.versionId, id)).orderBy(asc(contractTestCases.createdAt));
  const [last] = await db.select().from(categoryContracts).where(eq(categoryContracts.versionId, id)).orderBy(desc(categoryContracts.createdAt)).limit(1);
  const attrSet = await categoryAttributeSet(db, ctx.ability, v.nodeId).catch(() => []);
  const lockFresh = !!v.lockedBy && !!v.lockedAt && Date.now() - v.lockedAt.getTime() < LOCK_MINUTES * 60_000;
  return {
    version: {
      id: v.id,
      number: v.number,
      state: v.state,
      assigneeId: v.assigneeId,
      assigneeName: nameOf(v.assigneeId),
      titleTemplate: v.titleTemplate,
      lock: lockFresh ? { by: v.lockedBy!, byName: nameOf(v.lockedBy), at: v.lockedAt!, mine: v.lockedBy === ctx.actor.id } : null,
    },
    node: v.node,
    canEdit: ctx.ability.can('update', versionSubject(v)),
    canAssign: ctx.ability.can('assign', versionSubject(v)),
    profiles: allProfiles,
    profile: profile ? { id: profile.id, name: profile.name, version: profile.version, appliedVersion: v.profileVersion, outdated: (v.profileVersion ?? 0) < profile.version } : null,
    flags,
    specs,
    attributeSet: attrSet,
    rules: rules.map((r) => {
      const ri = toRuleInput(r);
      return { ...ri, text: describeRule(ri, fieldMap) };
    }),
    tests,
    draft: { ok: draft.ok, issues: draft.issues },
    contract: draft.contract,
    lastCompile: last
      ? { id: last.id, ok: last.ok, hash: last.hash, createdAt: last.createdAt, testsPassed: last.testsPassed, testsFailed: last.testsFailed, issues: last.issues }
      : null,
  };
}
export type Workspace = Awaited<ReturnType<typeof getWorkspace>>;

// ---------------------------------------------------------------------------
// Lists and history

export async function listVersions(db: DbOrTx, ctx: Pick<Ctx, 'actor' | 'ability'>, f: { mine?: boolean; state?: string } = {}) {
  if (!ctx.ability.can('read', 'CategoryVersion')) throw forbidden();
  const rows = await db
    .select({
      v: categoryVersions,
      node: { id: categoryNodes.id, code: categoryNodes.code, name: categoryNodes.name },
      assignee: profiles.fullName,
      specCount: sql<number>`(select count(*)::int from spec_definitions s where s.version_id = ${categoryVersions.id})`,
      ruleCount: sql<number>`(select count(*)::int from category_rules r where r.version_id = ${categoryVersions.id})`,
      lastOk: sql<boolean | null>`(select c.ok from category_contracts c where c.version_id = ${categoryVersions.id} order by c.created_at desc limit 1)`,
      lastHash: sql<string | null>`(select c.hash from category_contracts c where c.version_id = ${categoryVersions.id} order by c.created_at desc limit 1)`,
    })
    .from(categoryVersions)
    .innerJoin(categoryNodes, eq(categoryNodes.id, categoryVersions.nodeId))
    .leftJoin(profiles, eq(profiles.id, categoryVersions.assigneeId))
    .where(
      and(
        f.mine ? eq(categoryVersions.assigneeId, ctx.actor.id) : undefined,
        f.state ? sql`${categoryVersions.state} = ${f.state}` : undefined,
      ),
    )
    .orderBy(desc(categoryVersions.updatedAt))
    .limit(500);
  const out = [];
  for (const r of rows) {
    const ref = await loadVersion(db, r.v.id);
    if (!ctx.ability.can('read', versionSubject(ref))) continue;
    out.push({
      id: r.v.id,
      number: r.v.version,
      state: r.v.state,
      node: r.node,
      path: ref.node.path,
      assignee: r.assignee,
      assigneeId: r.v.assigneeId,
      updatedAt: r.v.updatedAt,
      specCount: r.specCount,
      ruleCount: r.ruleCount,
      compiled: r.lastOk === null ? null : r.lastOk,
      hash: r.lastHash,
      canEdit: ctx.ability.can('update', versionSubject(ref)),
    });
  }
  return out;
}

/** The version's own change history (category managers cannot read the whole audit log). */
export async function versionHistory(db: DbOrTx, ability: AppAbility, id: string) {
  const v = await loadVersion(db, id);
  assertRead(ability, v);
  return db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.subjectType, 'category_version'), eq(auditEvents.subjectId, id)))
    .orderBy(desc(auditEvents.occurredAt))
    .limit(200);
}

/** The latest successfully compiled contract, for the API and (from R3) publishing. */
export async function latestContract(db: DbOrTx, ability: AppAbility, id: string) {
  const v = await loadVersion(db, id);
  assertRead(ability, v);
  const [row] = await db
    .select()
    .from(categoryContracts)
    .where(and(eq(categoryContracts.versionId, id), eq(categoryContracts.ok, true)))
    .orderBy(desc(categoryContracts.createdAt))
    .limit(1);
  if (!row) throw notFound('Compiled contract');
  return { hash: row.hash!, compiledAt: row.createdAt, contract: row.contract };
}
