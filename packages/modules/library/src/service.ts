import { and, asc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { likeEscape, recordAudit } from '@orbita/audit';
import {
  attributes,
  booleanPairs,
  certificateTypes,
  flagDefinitions,
  flagProfiles,
  flagProfileValues,
  platformSettings,
  unitDimensions,
  units,
  valueListItems,
  valueLists,
  type Attribute,
  type Database,
  type DbOrTx,
  type FlagDefinition,
} from '@orbita/db';
import { badRequest, conflict, notFound } from '@orbita/domain';
import type { AppAbility } from '@orbita/authz';
import {
  LIST_TYPES,
  NUMBER_TYPES,
  UNIT_TYPES,
  attributeInput,
  booleanPairInput,
  certificateTypeInput,
  dimensionInput,
  flagDefinitionInput,
  flagProfileInput,
  slugify,
  unitInput,
  valueListInput,
  type AttributeInput,
  type BooleanPairInput,
  type CertificateTypeInput,
  type DimensionInput,
  type FlagDefinitionInput,
  type FlagProfileInput,
  type UnitInput,
  type ValueListInput,
} from './schemas';
import { isUniqueViolation, must, snapshot, type Ctx } from './shared';

export interface LibraryDeps {
  db: Database;
}

const readLib = (a: AppAbility) => must({ ability: a }, 'read', 'AttributeLibrary', 'You cannot view the attribute library.');
const writeLib = (ctx: Ctx, isNew: boolean) =>
  must(ctx, isNew ? 'create' : 'update', 'AttributeLibrary', 'Only a platform admin can change the attribute library.');
const readFlags = (a: AppAbility) => must({ ability: a }, 'read', 'FlagProfile', 'You cannot view flags.');
const writeFlags = (ctx: Ctx, isNew: boolean) =>
  must(ctx, isNew ? 'create' : 'update', 'FlagProfile', 'Only a platform admin can change flags and profiles.');

/** Runs a save; turns unique violations into a 409 with a readable message. */
async function saving<T>(what: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict(`A ${what} with that code or name already exists.`);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Units and dimensions

export async function listDimensions(db: DbOrTx, ability: AppAbility) {
  readLib(ability);
  const dims = await db.select().from(unitDimensions).orderBy(asc(unitDimensions.name));
  const all = await db.select().from(units).orderBy(asc(units.factorToBase));
  return dims.map((d) => ({ ...d, units: all.filter((u) => u.dimensionId === d.id) }));
}

export async function saveDimension(deps: LibraryDeps, ctx: Ctx, raw: DimensionInput) {
  writeLib(ctx, !raw.id);
  const v = dimensionInput.parse(raw);
  return saving('dimension', () =>
    deps.db.transaction(async (tx) => {
      const before = v.id ? (await tx.select().from(unitDimensions).where(eq(unitDimensions.id, v.id)))[0] : undefined;
      if (v.id && !before) throw notFound('Dimension');
      const [row] = v.id
        ? await tx.update(unitDimensions).set({ code: v.code, name: v.name, status: v.status }).where(eq(unitDimensions.id, v.id)).returning()
        : await tx.insert(unitDimensions).values({ code: v.code, name: v.name, status: v.status, createdBy: ctx.actor.id }).returning();
      await recordAudit(tx, ctx, {
        action: v.id ? 'library.dimension.updated' : 'library.dimension.created',
        subjectType: 'unit_dimension',
        subjectId: row!.id,
        summary: `${ctx.actor.email} ${v.id ? 'updated' : 'created'} dimension ${row!.name}`,
        before: before ? snapshot(before) : undefined,
        after: snapshot(row!),
      });
      return row!;
    }),
  );
}

export async function saveUnit(deps: LibraryDeps, ctx: Ctx, raw: UnitInput) {
  writeLib(ctx, !raw.id);
  const v = unitInput.parse(raw);
  if (v.isBase && v.factorToBase !== 1) throw badRequest('The base unit must have a conversion factor of 1.');
  return saving('unit', () =>
    deps.db.transaction(async (tx) => {
      const [dim] = await tx.select().from(unitDimensions).where(eq(unitDimensions.id, v.dimensionId));
      if (!dim) throw notFound('Dimension');
      const before = v.id ? (await tx.select().from(units).where(eq(units.id, v.id)))[0] : undefined;
      if (v.id && !before) throw notFound('Unit');
      if (v.isBase) await tx.update(units).set({ isBase: false }).where(and(eq(units.dimensionId, v.dimensionId), eq(units.isBase, true)));
      const values = {
        dimensionId: v.dimensionId,
        code: v.code,
        symbol: v.symbol,
        name: v.name,
        factorToBase: String(v.factorToBase),
        isBase: v.isBase,
        status: v.status,
      };
      const [row] = v.id
        ? await tx.update(units).set(values).where(eq(units.id, v.id)).returning()
        : await tx.insert(units).values({ ...values, createdBy: ctx.actor.id }).returning();
      await recordAudit(tx, ctx, {
        action: v.id ? 'library.unit.updated' : 'library.unit.created',
        subjectType: 'unit',
        subjectId: row!.id,
        summary: `${ctx.actor.email} ${v.id ? 'updated' : 'created'} unit ${row!.name} (${row!.symbol}) in ${dim.name}`,
        before: before ? snapshot(before) : undefined,
        after: snapshot(row!),
      });
      return row!;
    }),
  );
}

// ---------------------------------------------------------------------------
// Value lists

export async function listValueLists(db: DbOrTx, ability: AppAbility, q?: string) {
  readLib(ability);
  const where = q ? or(ilike(valueLists.name, `%${likeEscape(q)}%`), ilike(valueLists.code, `%${likeEscape(q)}%`)) : undefined;
  return db
    .select({
      id: valueLists.id,
      code: valueLists.code,
      name: valueLists.name,
      description: valueLists.description,
      kind: valueLists.kind,
      status: valueLists.status,
      updatedAt: valueLists.updatedAt,
      itemCount: sql<number>`(select count(*)::int from ${valueListItems} i where i.list_id = ${valueLists.id} and i.status = 'active')`,
    })
    .from(valueLists)
    .where(where)
    .orderBy(asc(valueLists.name));
}

export async function getValueList(db: DbOrTx, ability: AppAbility, id: string) {
  readLib(ability);
  const [list] = await db.select().from(valueLists).where(eq(valueLists.id, id));
  if (!list) throw notFound('Value list');
  const items = await db
    .select()
    .from(valueListItems)
    .where(eq(valueListItems.listId, id))
    .orderBy(asc(valueListItems.sortOrder));
  return { ...list, items };
}

export async function saveValueList(deps: LibraryDeps, ctx: Ctx, raw: ValueListInput) {
  writeLib(ctx, !raw.id);
  const v = valueListInput.parse(raw);
  const active = v.items.filter((i) => i.status === 'active');
  const seen = new Set<string>();
  for (const i of v.items) {
    const k = i.value.toLowerCase();
    if (seen.has(k)) throw badRequest(`"${i.value}" appears twice in the list.`);
    seen.add(k);
  }
  if (v.kind !== 'plain' && active.some((i) => i.weight === null || i.weight === undefined))
    throw badRequest('Every value in a ranked list needs a weight (higher = better).');
  if (v.kind === 'group_ordinal' && active.some((i) => !i.groupName))
    throw badRequest('Every value in a group-ranked list needs a group.');

  return saving('value list', () =>
    deps.db.transaction(async (tx) => {
      const before = v.id ? await getValueList(tx, ctx.ability, v.id) : undefined;
      const meta = { code: v.code, name: v.name, description: v.description, kind: v.kind, status: v.status };
      const [list] = v.id
        ? await tx.update(valueLists).set(meta).where(eq(valueLists.id, v.id)).returning()
        : await tx.insert(valueLists).values({ ...meta, createdBy: ctx.actor.id }).returning();

      // Items are never deleted (categories will reference them from R2): removed ones are deprecated.
      const keepIds = new Set(v.items.filter((i) => i.id).map((i) => i.id!));
      const dropped = (before?.items ?? []).filter((i) => !keepIds.has(i.id)).map((i) => i.id);
      if (dropped.length)
        await tx.update(valueListItems).set({ status: 'deprecated' }).where(inArray(valueListItems.id, dropped));
      // Two passes avoid transient unique clashes when values are swapped or renamed.
      for (const i of v.items) if (i.id) await tx.update(valueListItems).set({ value: `__tmp__${i.id}` }).where(eq(valueListItems.id, i.id));
      for (const [n, i] of v.items.entries()) {
        const values = {
          value: i.value,
          weight: v.kind === 'plain' ? null : (i.weight ?? null),
          groupName: v.kind === 'group_ordinal' ? (i.groupName ?? null) : null,
          sortOrder: n,
          status: i.status,
        };
        if (i.id && before?.items.some((b) => b.id === i.id))
          await tx.update(valueListItems).set(values).where(eq(valueListItems.id, i.id));
        else await tx.insert(valueListItems).values({ ...values, listId: list!.id });
      }
      const after = await getValueList(tx, ctx.ability, list!.id);
      await recordAudit(tx, ctx, {
        action: v.id ? 'library.value_list.updated' : 'library.value_list.created',
        subjectType: 'value_list',
        subjectId: list!.id,
        summary: `${ctx.actor.email} ${v.id ? 'updated' : 'created'} value list ${list!.name} (${after.items.filter((i) => i.status === 'active').length} values)`,
        before: before ? snapshot(before) : undefined,
        after: snapshot(after),
      });
      return after;
    }),
  );
}

// ---------------------------------------------------------------------------
// Boolean pairs

export async function listBooleanPairs(db: DbOrTx, ability: AppAbility) {
  readLib(ability);
  return db.select().from(booleanPairs).orderBy(asc(booleanPairs.code));
}

export async function saveBooleanPair(deps: LibraryDeps, ctx: Ctx, raw: BooleanPairInput) {
  writeLib(ctx, !raw.id);
  const v = booleanPairInput.parse(raw);
  const codeValue = v.code && v.code.length ? v.code.toLowerCase() : slugify(`${v.trueLabel}_${v.falseLabel}`);
  return saving('pair', () =>
    deps.db.transaction(async (tx) => {
      const before = v.id ? (await tx.select().from(booleanPairs).where(eq(booleanPairs.id, v.id)))[0] : undefined;
      const values = { code: codeValue, trueLabel: v.trueLabel, falseLabel: v.falseLabel, status: v.status };
      const [row] = v.id
        ? await tx.update(booleanPairs).set(values).where(eq(booleanPairs.id, v.id)).returning()
        : await tx.insert(booleanPairs).values({ ...values, createdBy: ctx.actor.id }).returning();
      if (!row) throw notFound('Pair');
      await recordAudit(tx, ctx, {
        action: v.id ? 'library.boolean_pair.updated' : 'library.boolean_pair.created',
        subjectType: 'boolean_pair',
        subjectId: row.id,
        summary: `${ctx.actor.email} ${v.id ? 'updated' : 'created'} pair ${row.trueLabel} / ${row.falseLabel}`,
        before: before ? snapshot(before) : undefined,
        after: snapshot(row),
      });
      return row;
    }),
  );
}

// ---------------------------------------------------------------------------
// Attributes

export interface AttributeFilter {
  q?: string;
  dataType?: string;
  status?: 'active' | 'deprecated';
}

export async function listAttributes(db: DbOrTx, ability: AppAbility, f: AttributeFilter = {}) {
  readLib(ability);
  const where: SQL[] = [];
  if (f.q) {
    const q = `%${likeEscape(f.q)}%`;
    where.push(
      or(ilike(attributes.name, q), ilike(attributes.code, q), sql`exists (select 1 from unnest(${attributes.synonyms}) s where s ilike ${q})`)!,
    );
  }
  if (f.dataType) where.push(sql`${attributes.dataType} = ${f.dataType}`);
  if (f.status) where.push(eq(attributes.status, f.status));
  return db
    .select({
      attribute: attributes,
      valueListName: valueLists.name,
      unitSymbol: units.symbol,
      dimensionName: unitDimensions.name,
    })
    .from(attributes)
    .leftJoin(valueLists, eq(valueLists.id, attributes.valueListId))
    .leftJoin(units, eq(units.id, attributes.defaultUnitId))
    .leftJoin(unitDimensions, eq(unitDimensions.id, attributes.dimensionId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(asc(attributes.name))
    .limit(1000);
}

/** Checks the references and validation rules that apply to the attribute's type, and clears the rest. */
async function normaliseAttribute(tx: DbOrTx, v: ReturnType<typeof attributeInput.parse>) {
  const t = v.dataType;
  const out = {
    valueListId: null as string | null,
    booleanPairId: null as string | null,
    dimensionId: null as string | null,
    defaultUnitId: null as string | null,
    validation: {} as Record<string, number | string>,
  };
  if (LIST_TYPES.includes(t)) {
    if (!v.valueListId) throw badRequest('Pick the value list this attribute uses.');
    const [list] = await tx.select().from(valueLists).where(eq(valueLists.id, v.valueListId));
    if (!list) throw notFound('Value list');
    if (t === 'ordinal' && list.kind !== 'ordinal') throw badRequest('A ranked attribute needs a ranked (ordinal) value list.');
    if (t === 'group_ordinal' && list.kind !== 'group_ordinal')
      throw badRequest('A group-ranked attribute needs a group-ranked value list.');
    out.valueListId = list.id;
  }
  if (t === 'boolean') {
    if (!v.booleanPairId) throw badRequest('Pick the labels (e.g. Yes / No) for this attribute.');
    out.booleanPairId = v.booleanPairId;
  }
  if (UNIT_TYPES.includes(t)) {
    if (!v.dimensionId || !v.defaultUnitId) throw badRequest('Pick the dimension and default unit.');
    const [u] = await tx.select().from(units).where(eq(units.id, v.defaultUnitId));
    if (!u || u.dimensionId !== v.dimensionId) throw badRequest('The default unit must belong to the chosen dimension.');
    out.dimensionId = v.dimensionId;
    out.defaultUnitId = v.defaultUnitId;
  }
  const val = v.validation;
  if (NUMBER_TYPES.includes(t)) {
    for (const k of ['min', 'max', 'step', 'decimals'] as const) if (val[k] !== undefined) out.validation[k] = val[k]!;
    if (val.min !== undefined && val.max !== undefined && val.min > val.max) throw badRequest('Minimum is larger than maximum.');
    if (val.decimals !== undefined && (val.decimals < 0 || val.decimals > 6 || !Number.isInteger(val.decimals)))
      throw badRequest('Decimals must be a whole number from 0 to 6.');
  }
  if (t === 'text') {
    if (val.maxLength !== undefined) out.validation.maxLength = val.maxLength;
    if (val.regex) {
      try {
        new RegExp(val.regex);
      } catch {
        throw badRequest('The pattern is not a valid regular expression.');
      }
      out.validation.regex = val.regex;
    }
  }
  return out;
}

export async function saveAttribute(deps: LibraryDeps, ctx: Ctx, raw: AttributeInput): Promise<Attribute> {
  writeLib(ctx, !raw.id);
  const v = attributeInput.parse(raw);
  return saving('attribute', () =>
    deps.db.transaction(async (tx) => {
      const before = v.id ? (await tx.select().from(attributes).where(eq(attributes.id, v.id)))[0] : undefined;
      if (v.id && !before) throw notFound('Attribute');
      // R2 adds "where used": from then on, changing the type of an attribute in use is blocked.
      const refs = await normaliseAttribute(tx, v);
      const values = {
        code: v.code,
        name: v.name,
        description: v.description,
        dataType: v.dataType,
        ...refs,
        synonyms: [...new Set(v.synonyms)],
        buyerHint: v.buyerHint,
        sellerHint: v.sellerHint,
        status: v.status,
      };
      const [row] = v.id
        ? await tx.update(attributes).set(values).where(eq(attributes.id, v.id)).returning()
        : await tx.insert(attributes).values({ ...values, createdBy: ctx.actor.id }).returning();
      await recordAudit(tx, ctx, {
        action: v.id ? 'library.attribute.updated' : 'library.attribute.created',
        subjectType: 'attribute',
        subjectId: row!.id,
        summary: `${ctx.actor.email} ${v.id ? 'updated' : 'created'} attribute ${row!.name}`,
        before: before ? snapshot(before) : undefined,
        after: snapshot(row!),
      });
      return row!;
    }),
  );
}

/** Finds attributes with a similar name, so admins reuse instead of duplicating. */
export async function similarAttributes(db: DbOrTx, ability: AppAbility, name: string, excludeId?: string) {
  readLib(ability);
  const n = name.trim().toLowerCase();
  if (n.length < 3) return [];
  return db
    .select({ id: attributes.id, name: attributes.name, code: attributes.code, dataType: attributes.dataType })
    .from(attributes)
    .where(
      and(
        sql`extensions.similarity(lower(${attributes.name}), ${n}) > 0.4`,
        excludeId ? sql`${attributes.id} <> ${excludeId}` : undefined,
      ),
    )
    .orderBy(sql`extensions.similarity(lower(${attributes.name}), ${n}) desc`)
    .limit(5);
}

// ---------------------------------------------------------------------------
// Certificate types

export async function listCertificateTypes(db: DbOrTx, ability: AppAbility) {
  readLib(ability);
  return db.select().from(certificateTypes).orderBy(asc(certificateTypes.name));
}

export async function saveCertificateType(deps: LibraryDeps, ctx: Ctx, raw: CertificateTypeInput) {
  writeLib(ctx, !raw.id);
  const v = certificateTypeInput.parse(raw);
  return saving('certificate type', () =>
    deps.db.transaction(async (tx) => {
      const before = v.id ? (await tx.select().from(certificateTypes).where(eq(certificateTypes.id, v.id)))[0] : undefined;
      if (v.id && !before) throw notFound('Certificate type');
      const values = {
        code: v.code,
        name: v.name,
        issuer: v.issuer,
        level: v.level,
        fields: v.fields,
        verification: v.verification,
        hasExpiry: v.hasExpiry,
        reminderDays: v.hasExpiry ? [...new Set(v.reminderDays)].sort((a, b) => b - a) : [],
        status: v.status,
      };
      const [row] = v.id
        ? await tx.update(certificateTypes).set(values).where(eq(certificateTypes.id, v.id)).returning()
        : await tx.insert(certificateTypes).values({ ...values, createdBy: ctx.actor.id }).returning();
      await recordAudit(tx, ctx, {
        action: v.id ? 'library.certificate_type.updated' : 'library.certificate_type.created',
        subjectType: 'certificate_type',
        subjectId: row!.id,
        summary: `${ctx.actor.email} ${v.id ? 'updated' : 'created'} certificate type ${row!.name}`,
        before: before ? snapshot(before) : undefined,
        after: snapshot(row!),
      });
      return row!;
    }),
  );
}

// ---------------------------------------------------------------------------
// Flags

/** Checks a value against a flag definition. Returns a reason when invalid, null when fine. R2 reuses this. */
export function flagValueProblem(def: Pick<FlagDefinition, 'valueType' | 'schema' | 'label'>, value: unknown): string | null {
  const s = def.schema ?? {};
  const inRange = (n: number) =>
    (s.min === undefined || n >= s.min) && (s.max === undefined || n <= s.max);
  switch (def.valueType) {
    case 'boolean':
      return typeof value === 'boolean' ? null : `${def.label} must be yes or no.`;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) && inRange(value)
        ? null
        : `${def.label} must be a number${s.min !== undefined ? ` from ${s.min}` : ''}${s.max !== undefined ? ` to ${s.max}` : ''}.`;
    case 'text':
      return typeof value === 'string' && value.trim().length > 0 ? null : `${def.label} needs text.`;
    case 'single_select':
      return typeof value === 'string' && (s.options ?? []).includes(value) ? null : `${def.label} must be one of: ${(s.options ?? []).join(', ')}.`;
    case 'multi_select':
      return Array.isArray(value) && value.length > 0 && value.every((x) => (s.options ?? []).includes(x))
        ? null
        : `${def.label} must be one or more of: ${(s.options ?? []).join(', ')}.`;
    case 'range': {
      const r = value as { min?: unknown; max?: unknown };
      return r && typeof r.min === 'number' && typeof r.max === 'number' && r.min <= r.max && inRange(r.min) && inRange(r.max)
        ? null
        : `${def.label} must be a range with min ≤ max${s.min !== undefined ? `, within ${s.min}–${s.max}` : ''}.`;
    }
  }
}

export async function listFlagDefinitions(db: DbOrTx, ability: AppAbility) {
  readFlags(ability);
  return db.select().from(flagDefinitions).orderBy(asc(flagDefinitions.groupName), asc(flagDefinitions.label));
}

export async function saveFlagDefinition(deps: LibraryDeps, ctx: Ctx, raw: FlagDefinitionInput) {
  writeFlags(ctx, !raw.id);
  const v = flagDefinitionInput.parse(raw);
  const key = v.key && v.key.length ? v.key.toLowerCase() : slugify(v.label);
  if (!/^[a-z][a-z0-9_]{1,62}$/.test(key)) throw badRequest('Key: use lowercase letters, digits and _.');
  if ((v.valueType === 'single_select' || v.valueType === 'multi_select') && !(v.schema.options ?? []).length)
    throw badRequest('A select flag needs at least one option.');
  const schema = {
    ...(v.schema.options?.length ? { options: [...new Set(v.schema.options)] } : {}),
    ...(v.schema.unit ? { unit: v.schema.unit } : {}),
    ...(v.schema.min !== undefined ? { min: v.schema.min } : {}),
    ...(v.schema.max !== undefined ? { max: v.schema.max } : {}),
  };
  if (v.defaultValue !== undefined && v.defaultValue !== null) {
    const p = flagValueProblem({ valueType: v.valueType, schema, label: 'The default' }, v.defaultValue);
    if (p) throw badRequest(p);
  }
  return saving('flag', () =>
    deps.db.transaction(async (tx) => {
      const before = v.id ? (await tx.select().from(flagDefinitions).where(eq(flagDefinitions.id, v.id)))[0] : undefined;
      if (v.id && !before) throw notFound('Flag');
      const values = {
        key,
        label: v.label,
        groupName: v.groupName,
        ownerModule: v.ownerModule,
        valueType: v.valueType,
        schema,
        defaultValue: v.defaultValue ?? null,
        helpText: v.helpText,
        status: v.status,
      };
      const [row] = v.id
        ? await tx.update(flagDefinitions).set(values).where(eq(flagDefinitions.id, v.id)).returning()
        : await tx.insert(flagDefinitions).values({ ...values, createdBy: ctx.actor.id }).returning();
      await recordAudit(tx, ctx, {
        action: v.id ? 'library.flag.updated' : 'library.flag.created',
        subjectType: 'flag_definition',
        subjectId: row!.id,
        summary: `${ctx.actor.email} ${v.id ? 'updated' : 'created'} flag ${row!.label}`,
        before: before ? snapshot(before) : undefined,
        after: snapshot(row!),
      });
      return row!;
    }),
  );
}

export async function listFlagProfiles(db: DbOrTx, ability: AppAbility) {
  readFlags(ability);
  return db
    .select({
      id: flagProfiles.id,
      code: flagProfiles.code,
      name: flagProfiles.name,
      description: flagProfiles.description,
      version: flagProfiles.version,
      status: flagProfiles.status,
      updatedAt: flagProfiles.updatedAt,
      flagCount: sql<number>`(select count(*)::int from ${flagProfileValues} v where v.profile_id = ${flagProfiles.id})`,
    })
    .from(flagProfiles)
    .orderBy(asc(flagProfiles.name));
}

export async function getFlagProfile(db: DbOrTx, ability: AppAbility, id: string) {
  readFlags(ability);
  const [p] = await db.select().from(flagProfiles).where(eq(flagProfiles.id, id));
  if (!p) throw notFound('Flag profile');
  const rows = await db
    .select({ key: flagDefinitions.key, value: flagProfileValues.value })
    .from(flagProfileValues)
    .innerJoin(flagDefinitions, eq(flagDefinitions.id, flagProfileValues.flagId))
    .where(eq(flagProfileValues.profileId, id));
  return { ...p, values: Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, unknown> };
}

export async function saveFlagProfile(deps: LibraryDeps, ctx: Ctx, raw: FlagProfileInput) {
  writeFlags(ctx, !raw.id);
  const v = flagProfileInput.parse(raw);
  const defs = await deps.db.select().from(flagDefinitions);
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const problems: string[] = [];
  for (const [key, value] of Object.entries(v.values)) {
    const def = byKey.get(key);
    if (!def) problems.push(`Unknown flag "${key}".`);
    else if (def.status !== 'active') problems.push(`${def.label} is deprecated.`);
    else {
      const p = flagValueProblem(def, value);
      if (p) problems.push(p);
    }
  }
  if (problems.length) throw badRequest(problems[0]!, { problems });

  return saving('flag profile', () =>
    deps.db.transaction(async (tx) => {
      const before = v.id ? await getFlagProfile(tx, ctx.ability, v.id) : undefined;
      const meta = { code: v.code, name: v.name, description: v.description, status: v.status };
      const [p] = v.id
        ? await tx
            .update(flagProfiles)
            .set({ ...meta, version: sql`${flagProfiles.version} + 1` })
            .where(eq(flagProfiles.id, v.id))
            .returning()
        : await tx.insert(flagProfiles).values({ ...meta, createdBy: ctx.actor.id }).returning();
      await tx.delete(flagProfileValues).where(eq(flagProfileValues.profileId, p!.id));
      const entries = Object.entries(v.values);
      if (entries.length)
        await tx
          .insert(flagProfileValues)
          .values(entries.map(([key, value]) => ({ profileId: p!.id, flagId: byKey.get(key)!.id, value })));
      const after = await getFlagProfile(tx, ctx.ability, p!.id);
      await recordAudit(tx, ctx, {
        action: v.id ? 'library.flag_profile.updated' : 'library.flag_profile.created',
        subjectType: 'flag_profile',
        subjectId: p!.id,
        summary: `${ctx.actor.email} ${v.id ? `updated flag profile ${p!.name} to v${p!.version}` : `created flag profile ${p!.name}`} (${entries.length} flags)`,
        before: before ? snapshot(before) : undefined,
        after: snapshot(after),
      });
      return after;
    }),
  );
}

// ---------------------------------------------------------------------------
// Platform limits

export async function listSettings(db: DbOrTx, ability: AppAbility) {
  readLib(ability);
  return db.select().from(platformSettings).orderBy(asc(platformSettings.label));
}

export async function updateSetting(deps: LibraryDeps, ctx: Ctx, key: string, value: unknown) {
  writeLib(ctx, false); // permission first, before looking at the input
  return deps.db.transaction(async (tx) => {
    const [before] = await tx.select().from(platformSettings).where(eq(platformSettings.key, key));
    if (!before) throw notFound('Setting');
    const n = typeof value === 'string' ? Number(value) : value;
    if (before.valueType === 'number' && (typeof n !== 'number' || !Number.isFinite(n) || n < 0))
      throw badRequest(`${before.label} must be a number of 0 or more.`);
    const [row] = await tx
      .update(platformSettings)
      .set({ value: n, updatedBy: ctx.actor.id, updatedAt: new Date() })
      .where(eq(platformSettings.key, key))
      .returning();
    await recordAudit(tx, ctx, {
      action: 'library.setting.updated',
      subjectType: 'platform_setting',
      subjectId: key,
      summary: `${ctx.actor.email} changed ${before.label} from ${JSON.stringify(before.value)} to ${JSON.stringify(n)}`,
      before: { value: before.value },
      after: { value: n },
    });
    return row!;
  });
}
