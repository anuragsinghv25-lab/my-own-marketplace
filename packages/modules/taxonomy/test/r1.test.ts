import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { defineAbilityFor, type Grant } from '@orbita/authz';
import { listAuditEvents } from '@orbita/audit';
import { freshTestDb, testDatabaseUrl } from '@orbita/db/test-support';
import { isAppError } from '@orbita/domain';
import {
  getFlagProfile,
  listAttributes,
  listDimensions,
  listFlagDefinitions,
  listSettings,
  saveAttribute,
  saveCertificateType,
  saveFlagProfile,
  saveUnit,
  saveValueList,
  similarAttributes,
  updateSetting,
  flagValueProblem,
  listBooleanPairs,
} from '@orbita/library';
import {
  addAlias,
  assignWorkgroup,
  createNode,
  findSimilarCategories,
  loadTree,
  moveNode,
  myOpenDrafts,
  removeAlias,
  renameNode,
  saveWorkgroup,
  setNodeStatus,
  type Ctx,
} from '../src';

const meta = { requestId: 'req_r1' };
const code = (e: unknown) => (isAppError(e) ? e.code : String(e));

describe.skipIf(!testDatabaseUrl)('R1 · library and taxonomy (Postgres)', () => {
  let t: Awaited<ReturnType<typeof freshTestDb>>;
  const users: Record<string, string> = {};
  const ctxOf = (name: string, grants: Grant[]): Ctx => ({
    actor: { id: users[name]!, email: `${name}@example.com`, fullName: name },
    ability: defineAbilityFor({ userId: users[name]!, grants }),
    meta,
  });
  let admin: Ctx, globalCm: Ctx, reviewer: Ctx;
  const deps = () => ({ db: t.db });

  beforeAll(async () => {
    t = await freshTestDb('r1');
    for (const n of ['admin', 'cm', 'wgcm', 'approver', 'reviewer']) {
      users[n] = randomUUID();
      await t.db.execute(sql`insert into auth.users (id, email) values (${users[n]!}, ${n + '@example.com'})`);
      await t.db.execute(sql`insert into profiles (id, email, full_name, status) values (${users[n]!}, ${n + '@example.com'}, ${n}, 'active')`);
    }
    admin = ctxOf('admin', [{ role: 'platform_admin', scopeType: 'global', scopeId: null }]);
    globalCm = ctxOf('cm', [{ role: 'category_manager', scopeType: 'global', scopeId: null }]);
    reviewer = ctxOf('reviewer', [{ role: 'reviewer', scopeType: 'global', scopeId: null }]);
  });
  afterAll(async () => t?.drop());

  // ------------------------------------------------------------- library

  it('ships starter units, pairs, flags and limits', async () => {
    const dims = await listDimensions(t.db, admin.ability);
    expect(dims.map((d) => d.code)).toEqual(expect.arrayContaining(['length', 'data_storage', 'frequency']));
    expect(dims.find((d) => d.code === 'data_storage')!.units.map((u) => u.symbol)).toEqual(['MB', 'GB', 'TB']);
    expect((await listBooleanPairs(t.db, admin.ability)).map((p) => p.code)).toContain('yes_no');
    expect((await listFlagDefinitions(t.db, admin.ability)).length).toBeGreaterThanOrEqual(15);
    expect((await listSettings(t.db, admin.ability)).find((s) => s.key === 'product_title_max_length')!.value).toBe(120);
  });

  it('exit demo 1: admin creates Processor, RAM, Display size, Refresh rate and a flag profile', async () => {
    const list = await saveValueList(deps(), admin, {
      name: 'Processor families',
      kind: 'ordinal',
      items: [
        { value: 'Intel Core i5', weight: 50 },
        { value: 'Intel Core i7', weight: 70 },
        { value: 'AMD Ryzen 7', weight: 70 },
      ],
    });
    expect(list.code).toBe('processor_families');
    const dims = await listDimensions(t.db, admin.ability);
    const unit = (dim: string, sym: string) => dims.find((d) => d.code === dim)!.units.find((u) => u.symbol === sym)!;
    const dimId = (dim: string) => dims.find((d) => d.code === dim)!.id;

    await saveAttribute(deps(), admin, { name: 'Processor', dataType: 'ordinal', valueListId: list.id });
    await saveAttribute(deps(), admin, {
      name: 'RAM (GB)',
      dataType: 'measurable',
      dimensionId: dimId('data_storage'),
      defaultUnitId: unit('data_storage', 'GB').id,
      validation: { min: 1, max: 512 },
    });
    await saveAttribute(deps(), admin, {
      name: 'Display size (inch)',
      dataType: 'measurable',
      dimensionId: dimId('length'),
      defaultUnitId: unit('length', 'in').id,
      validation: { min: 5, max: 100, decimals: 1 },
      synonyms: ['Screen size'],
    });
    await saveAttribute(deps(), admin, {
      name: 'Refresh rate (Hz)',
      dataType: 'measurable',
      dimensionId: dimId('frequency'),
      defaultUnitId: unit('frequency', 'Hz').id,
    });
    const attrs = await listAttributes(t.db, admin.ability);
    expect(attrs.map((a) => a.attribute.code)).toEqual(['display_size_inch', 'processor', 'ram_gb', 'refresh_rate_hz']);
    expect((await listAttributes(t.db, admin.ability, { q: 'screen' })).map((a) => a.attribute.name)).toEqual(['Display size (inch)']);

    const profile = await saveFlagProfile(deps(), admin, {
      name: 'Branded electronics',
      values: {
        price_label: 'offer_price_with_mrp',
        discount_band: { min: 5, max: 40 },
        allowed_sellers: 'oem_and_authorised',
        certificates_required: true,
      },
    });
    expect(profile.version).toBe(1);
    expect(Object.keys(profile.values)).toHaveLength(4);
    const updated = await saveFlagProfile(deps(), admin, { id: profile.id, name: 'Branded electronics', values: { ...profile.values, max_images: 8 } });
    expect(updated.version).toBe(2);
    expect((await getFlagProfile(t.db, admin.ability, profile.id)).values.max_images).toBe(8);
  });

  it('validates attribute types, ranked lists and flag values', async () => {
    const dims = await listDimensions(t.db, admin.ability);
    const length = dims.find((d) => d.code === 'length')!;
    const kg = dims.find((d) => d.code === 'mass')!.units[0]!;
    await expect(saveAttribute(deps(), admin, { name: 'Width', dataType: 'measurable', dimensionId: length.id, defaultUnitId: kg.id })).rejects.toThrow(/belong to the chosen dimension/);
    await expect(saveAttribute(deps(), admin, { name: 'Colour', dataType: 'enumerable' })).rejects.toThrow(/value list/);
    await expect(saveAttribute(deps(), admin, { name: 'Pattern', dataType: 'text', validation: { regex: '([' } })).rejects.toThrow(/regular expression/);
    await expect(saveAttribute(deps(), admin, { name: 'processor', dataType: 'text' })).rejects.toThrow(/already exists/);
    await expect(saveValueList(deps(), admin, { name: 'Bad ranks', kind: 'ordinal', items: [{ value: 'A' }] })).rejects.toThrow(/weight/);
    await expect(saveValueList(deps(), admin, { name: 'Dupes', items: [{ value: 'A' }, { value: 'a' }] })).rejects.toThrow(/twice/);
    await expect(saveFlagProfile(deps(), admin, { name: 'Bad', values: { discount_band: { min: 50, max: 10 } } })).rejects.toThrow(/range/);
    await expect(saveFlagProfile(deps(), admin, { name: 'Bad2', values: { price_label: 'cheap' } })).rejects.toThrow(/one of/);
    expect(flagValueProblem({ valueType: 'number', schema: { min: 1, max: 20 }, label: 'Images' }, 25)).toMatch(/from 1 to 20/);
    expect((await similarAttributes(t.db, admin.ability, 'Processer')).map((a) => a.name)).toContain('Processor');
  });

  it('keeps removed list values as deprecated and allows renames in place', async () => {
    const [processor] = await listAttributes(t.db, admin.ability, { q: 'processor' });
    const listId = processor!.attribute.valueListId!;
    const { getValueList } = await import('@orbita/library');
    const before = await getValueList(t.db, admin.ability, listId);
    const keep = before.items.filter((i) => i.value !== 'AMD Ryzen 7');
    const after = await saveValueList(deps(), admin, {
      id: listId,
      name: before.name,
      kind: 'ordinal',
      items: keep.map((i) => ({ id: i.id, value: i.value === 'Intel Core i5' ? 'Intel Core i5 (12th gen+)' : i.value, weight: i.weight })),
    });
    expect(after.items.find((i) => i.value === 'AMD Ryzen 7')!.status).toBe('deprecated');
    expect(after.items.find((i) => i.value.startsWith('Intel Core i5'))!.id).toBe(before.items.find((i) => i.value === 'Intel Core i5')!.id);
  });

  it('only the platform admin changes the library; others may read where allowed', async () => {
    await expect(saveAttribute(deps(), globalCm, { name: 'Weight', dataType: 'text' })).rejects.toSatisfy((e) => code(e) === 'FORBIDDEN');
    await expect(saveCertificateType(deps(), reviewer, { name: 'X' })).rejects.toSatisfy((e) => code(e) === 'FORBIDDEN');
    await expect(updateSetting(deps(), globalCm, 'max_selling_units', 3)).rejects.toSatisfy((e) => code(e) === 'FORBIDDEN');
    await expect(listAttributes(t.db, globalCm.ability)).resolves.toBeTruthy();
    await expect(listAttributes(t.db, reviewer.ability)).rejects.toSatisfy((e) => code(e) === 'FORBIDDEN');
    const s = await updateSetting(deps(), admin, 'max_selling_units', '4');
    expect(s.value).toBe(4);
    await expect(updateSetting(deps(), admin, 'max_selling_units', 'lots')).rejects.toThrow(/number/);
    await expect(saveUnit(deps(), admin, { dimensionId: (await listDimensions(t.db, admin.ability))[0]!.id, name: 'Base2', symbol: 'b2', factorToBase: 2, isBase: true })).rejects.toThrow(/factor of 1/);
  });

  // ------------------------------------------------------------- taxonomy

  let it_e: string, laptops: string, notebooks: string, wg: string;

  it('exit demo 2: admin creates the IT Hardware workgroup covering IT & Electronics', async () => {
    const root = await createNode(deps(), globalCm, { name: 'IT & Electronics' });
    it_e = root.node.id;
    expect(root.node.code).toBe('10');
    const w = await saveWorkgroup(deps(), admin, { name: 'IT Hardware', description: 'Computers and peripherals' });
    wg = w.id;
    await assignWorkgroup(deps(), admin, it_e, wg);
    // members are role grants scoped to the workgroup (granted through the identity module in the app)
    await t.db.execute(sql`insert into role_grants (user_id, role, scope_type, scope_id) values (${users.wgcm!}, 'category_manager', 'workgroup', ${wg}), (${users.approver!}, 'approver', 'workgroup', ${wg})`);
    await expect(saveWorkgroup(deps(), globalCm, { name: 'Nope' })).rejects.toSatisfy((e) => code(e) === 'FORBIDDEN');
    await expect(saveWorkgroup(deps(), admin, { name: 'it hardware' })).rejects.toThrow(/already exists/);
  });

  it('exit demo 3: the workgroup manager builds down to Gaming laptops (L5) with an alias', async () => {
    const wgcm = ctxOf('wgcm', [{ role: 'category_manager', scopeType: 'workgroup', scopeId: wg }]);
    laptops = (await createNode(deps(), wgcm, { parentId: it_e, name: 'Portable computers' })).node.id;
    notebooks = (await createNode(deps(), wgcm, { parentId: laptops, name: 'Notebooks', code: '101015' })).node.id;
    const l4 = await createNode(deps(), wgcm, { parentId: notebooks, name: 'Notebook computers' });
    expect(l4.node.code).toBe('10101510');
    await expect(createNode(deps(), wgcm, { parentId: l4.node.id, name: 'Gaming laptops' })).rejects.toThrow(/at least one unique alias/);
    const l5 = await createNode(deps(), wgcm, { parentId: l4.node.id, name: 'Gaming laptops', aliases: ['High Performance Gaming Laptops'] });
    expect(l5.node.level).toBe(5);
    expect(l5.node.code).toBe('10101510-01');
    expect(l5.draft).toMatchObject({ version: 0, state: 'DRAFT', assigneeId: users.wgcm });

    // a duplicate alias is blocked, case-insensitively, wherever it is
    await expect(
      createNode(deps(), wgcm, { parentId: l4.node.id, name: 'Esports laptops', aliases: ['high performance gaming laptops'] }),
    ).rejects.toThrow(/already used by the category "Gaming laptops"/);
    // an alias may not equal another category's name either
    await expect(addAlias(deps(), wgcm, l5.node.id, 'Notebooks')).rejects.toThrow(/already used/);
    // sibling names are unique
    await expect(createNode(deps(), wgcm, { parentId: it_e, name: 'portable COMPUTERS' })).rejects.toThrow(/already exists/);
    await expect(createNode(deps(), wgcm, { parentId: l5.node.id, name: 'Too deep', aliases: ['x1'] })).rejects.toThrow(/cannot have children/);
    await expect(createNode(deps(), wgcm, { parentId: it_e, name: 'Bad code', code: '99' })).rejects.toThrow(/10 followed by two digits/);
  });

  it('exit demo 4: the workgroup category manager sees the empty draft assigned to them', async () => {
    const wgcm = ctxOf('wgcm', [{ role: 'category_manager', scopeType: 'workgroup', scopeId: wg }]);
    const drafts = await myOpenDrafts(t.db, wgcm);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ version: 0, state: 'DRAFT', code: '10101510-01' });
    expect(drafts[0]!.path).toBe('IT & Electronics › Portable computers › Notebooks › Notebook computers › Gaming laptops');
  });

  it('scopes category managers to their workgroup', async () => {
    const wgcm = ctxOf('wgcm', [{ role: 'category_manager', scopeType: 'workgroup', scopeId: wg }]);
    const other = await createNode(deps(), globalCm, { name: 'Office supplies' });
    await expect(createNode(deps(), wgcm, { parentId: other.node.id, name: 'Paper' })).rejects.toSatisfy((e) => code(e) === 'FORBIDDEN');
    await expect(createNode(deps(), wgcm, { name: 'New segment' })).rejects.toThrow(/top-level/);
    await expect(renameNode(deps(), wgcm, other.node.id, { name: 'Office' })).rejects.toSatisfy((e) => code(e) === 'FORBIDDEN');
    // moving out of the workgroup is not allowed either
    await expect(moveNode(deps(), wgcm, laptops, other.node.id)).rejects.toSatisfy((e) => code(e) === 'FORBIDDEN');
    const approver = ctxOf('approver', [{ role: 'approver', scopeType: 'workgroup', scopeId: wg }]);
    await expect(createNode(deps(), approver, { parentId: it_e, name: 'Printers' })).rejects.toSatisfy((e) => code(e) === 'FORBIDDEN');
    await expect(loadTree(t.db, approver.ability)).resolves.toBeTruthy();
  });

  it('finds similar categories while typing', async () => {
    const m = await findSimilarCategories(t.db, globalCm.ability, 'gaming laptop');
    expect(m[0]).toMatchObject({ name: 'Gaming laptops' });
    const exact = await findSimilarCategories(t.db, globalCm.ability, 'High Performance Gaming Laptops');
    expect(exact.some((x) => x.exact && x.matchedOn === 'alias')).toBe(true);
  });

  it('renames, moves, deactivates and tracks inheritance', async () => {
    const tree = await loadTree(t.db, globalCm.ability);
    const gl = tree.nodes.find((n) => n.name === 'Gaming laptops')!;
    expect(gl.effectiveWorkgroupId).toBe(wg);
    expect(gl.aliases.map((a) => a.alias)).toEqual(['High Performance Gaming Laptops']);
    await expect(removeAlias(deps(), globalCm, gl.id, gl.aliases[0]!.id)).rejects.toThrow(/at least one alias/);

    await renameNode(deps(), globalCm, notebooks, { name: 'Notebooks & laptops' });
    await expect(setNodeStatus(deps(), globalCm, notebooks, 'inactive')).rejects.toThrow(/child categories first/);

    // a family must sit under a segment
    await expect(moveNode(deps(), globalCm, laptops, notebooks)).rejects.toThrow(/inside itself|must sit under/);
    const office = tree.nodes.find((n) => n.name === 'Office supplies')!;
    await moveNode(deps(), globalCm, laptops, office.id);
    const after = await loadTree(t.db, globalCm.ability);
    expect(after.nodes.find((n) => n.id === laptops)!.parentId).toBe(office.id);
    expect(after.nodes.find((n) => n.name === 'Gaming laptops')!.effectiveWorkgroupId).toBeNull(); // left IT Hardware's subtree
    await moveNode(deps(), globalCm, laptops, it_e);

    const audit = await listAuditEvents(t.db, admin.ability, { action: 'taxonomy.' });
    expect(audit.items.map((e) => e.action)).toEqual(
      expect.arrayContaining(['taxonomy.node.created', 'taxonomy.version.created', 'taxonomy.workgroup.assigned', 'taxonomy.node.renamed', 'taxonomy.node.moved']),
    );
  });

  it('has row level security on every new table', async () => {
    const rows = await t.db.execute<{ relname: string; relrowsecurity: boolean }>(sql`
      select relname, relrowsecurity from pg_class where relkind = 'r' and relnamespace = 'public'::regnamespace`);
    const off = rows.filter((r) => !r.relrowsecurity).map((r) => r.relname);
    expect(off).toEqual([]);
  });
});
