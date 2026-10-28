import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { defineAbilityFor, type Grant } from '@orbita/authz';
import { listAuditEvents } from '@orbita/audit';
import { freshTestDb, testDatabaseUrl } from '@orbita/db/test-support';
import { isAppError } from '@orbita/domain';
import { listAttributes, saveAttribute } from '@orbita/library';
import {
  browseStandard,
  getStandardCategory,
  importUnspscChunk,
  loadShopifyPart,
  parseCsv,
  parseUnspscRows,
  searchStandard,
  standardsStatus,
} from '@orbita/standards';
import {
  addCategoryAttribute,
  adoptStandardCategory,
  categoryAttributeSet,
  createNode,
  loadTree,
  moveNode,
  removeCategoryAttribute,
  setNodeKind,
  setUnspscCode,
  updateCategoryAttribute,
  type Ctx,
} from '../src';

const meta = { requestId: 'req_r11' };
const code = (e: unknown) => (isAppError(e) ? e.code : String(e));

const UNSPSC_CSV = [
  'Segment,Segment Title,Family,Family Title,Class,Class Title,Commodity,Commodity Title',
  '43000000,Information Technology Broadcasting and Telecommunications,43210000,Computer Equipment and Accessories,43211500,Computers,43211503,Notebook computers',
  '43000000,Information Technology Broadcasting and Telecommunications,43210000,Computer Equipment and Accessories,43211500,Computers,43211507,Desktop computers',
  '43000000,Information Technology Broadcasting and Telecommunications,43210000,Computer Equipment and Accessories,43211600,Computer accessories,43211602,Docking stations',
  '44000000,"Office Equipment and Accessories and Supplies",44100000,Office machines and their supplies and accessories,44101500,Duplicating machines,44101501,Photocopiers',
].join('\n');

describe.skipIf(!testDatabaseUrl)('R1.1 · standard taxonomies (Postgres)', () => {
  let t: Awaited<ReturnType<typeof freshTestDb>>;
  const users: Record<string, string> = {};
  const ctxOf = (name: string, grants: Grant[]): Ctx => ({
    actor: { id: users[name]!, email: `${name}@example.com`, fullName: name },
    ability: defineAbilityFor({ userId: users[name]!, grants }),
    meta,
  });
  let admin: Ctx, cm: Ctx;
  const deps = () => ({ db: t.db });

  beforeAll(async () => {
    t = await freshTestDb('r11');
    for (const n of ['admin', 'cm']) {
      users[n] = randomUUID();
      await t.db.execute(sql`insert into auth.users (id, email) values (${users[n]!}, ${n + '@example.com'})`);
      await t.db.execute(sql`insert into profiles (id, email, full_name, status) values (${users[n]!}, ${n + '@example.com'}, ${n}, 'active')`);
    }
    admin = ctxOf('admin', [{ role: 'platform_admin', scopeType: 'global', scopeId: null }]);
    cm = ctxOf('cm', [{ role: 'category_manager', scopeType: 'global', scopeId: null }]);
  });
  afterAll(async () => t?.drop());

  it('migrates R1 codes into the custom C-prefixed scheme', async () => {
    const rows = await t.db.execute<{ c: string }>(sql`
      select 'C' || regexp_replace(split_part(code, '-', 1), '(\\d\\d)(?=\\d)', '\\1.', 'g')
        || case when split_part(code, '-', 2) <> '' then '.' || split_part(code, '-', 2) else '' end as c
      from (values ('10'), ('1010'), ('10101510'), ('10101510-01'), ('10101510-A1')) v(code)`);
    expect(rows.map((r) => r.c)).toEqual(['C10', 'C10.10', 'C10.10.15.10', 'C10.10.15.10.01', 'C10.10.15.10.A1']);
  });

  it('only the platform admin loads a standard; it loads one Shopify vertical per call', async () => {
    await expect(loadShopifyPart(deps(), cm, 'el')).rejects.toSatisfy((e) => code(e) === 'FORBIDDEN');
    const r = await loadShopifyPart(deps(), admin, 'el');
    expect(r).toMatchObject({ name: 'Electronics', complete: false, loadedParts: ['el'] });
    const [shopify] = await standardsStatus(t.db, cm.ability);
    expect(shopify).toMatchObject({ source: 'shopify', version: shopify!.bundledVersion, complete: false });
    expect(shopify!.categoryCount).toBe(r.categories);
    // reloading the same vertical is idempotent
    await loadShopifyPart(deps(), admin, 'el');
    expect((await standardsStatus(t.db, cm.ability))[0]!.categoryCount).toBe(r.categories);
  });

  it('browses and searches the standard with full paths and attributes', async () => {
    const top = await browseStandard(t.db, cm.ability, 'shopify', null);
    expect(top.map((x) => x.name)).toEqual(['Electronics']);
    const hits = await searchStandard(t.db, cm.ability, 'shopify', 'gaming laptop');
    expect(hits[0]).toMatchObject({ externalId: 'el-6-11-2', fullPath: 'Electronics > Computers > Gaming Computers > Gaming Laptops', isLeaf: true });
    const d = await getStandardCategory(t.db, cm.ability, 'shopify', 'el-6-11-2');
    expect(d.ancestors.map((a) => a.externalId)).toEqual(['el', 'el-6', 'el-6-11']);
    const color = d.attributes.find((a) => a.handle === 'color')!;
    expect(color.values).toContain('Black');
  });

  it('adopts a Shopify category along its path, with its attributes, and starts its draft', async () => {
    // the admin already has an "Operating system" attribute: it is reused, not duplicated
    await saveAttribute(deps(), admin, { name: 'Operating system', dataType: 'text' });
    await expect(adoptStandardCategory(deps(), cm, { source: 'shopify', externalId: 'el-6-11-2', kind: 'listing' })).rejects.toThrow(/alias/);
    const r = await adoptStandardCategory(deps(), cm, { source: 'shopify', externalId: 'el-6-11-2', kind: 'listing', aliases: ['Gaming notebooks'] });
    expect(r.createdAncestors).toEqual(['Electronics', 'Computers', 'Gaming Computers']);
    expect(r.node).toMatchObject({ code: 'el-6-11-2', kind: 'listing', level: 4, source: 'shopify', externalId: 'el-6-11-2' });
    expect(r.attributesAttached).toBe(17);

    const tree = await loadTree(t.db, cm.ability);
    expect(tree.nodes.find((n) => n.code === 'el')).toMatchObject({ kind: 'group', source: 'shopify', level: 1 });
    expect(tree.nodes.find((n) => n.id === r.node.id)!.draft).toMatchObject({ version: 0, state: 'DRAFT' });

    const set = await categoryAttributeSet(t.db, cm.ability, r.node.id);
    expect(set).toHaveLength(17);
    const attrs = await listAttributes(t.db, admin.ability);
    expect(attrs.filter((a) => a.attribute.name === 'Operating system')).toHaveLength(1);
    const color = attrs.find((a) => a.attribute.name === 'Color')!.attribute;
    expect(color).toMatchObject({ dataType: 'multi_enumerable', source: 'shopify', externalRef: 'color' });

    await expect(adoptStandardCategory(deps(), cm, { source: 'shopify', externalId: 'el-6-11-2', kind: 'listing', aliases: ['x2'] })).rejects.toThrow(/already in your tree/);
    // the next adoption under the same path reuses the groups and the library attributes
    const desk = await adoptStandardCategory(deps(), cm, { source: 'shopify', externalId: 'el-6-11-1', kind: 'listing', aliases: ['Gaming PCs'] });
    expect(desk.createdAncestors).toEqual([]);
    expect((await listAttributes(t.db, admin.ability)).length).toBeLessThan(attrs.length + 5);
  });

  it('adopts a whole branch: groups stay groups and leaves become listing categories with aliases', async () => {
    const r = await adoptStandardCategory(deps(), cm, { source: 'shopify', externalId: 'el-12-5', kind: 'group', withChildren: true });
    expect(r).toMatchObject({ adopted: 4, listings: 3 });
    const tree = await loadTree(t.db, cm.ability);
    const modems = tree.nodes.filter((n) => n.parentId === r.node.id);
    expect(modems.map((n) => n.kind)).toEqual(['listing', 'listing', 'listing']);
    expect(modems.every((n) => n.aliases.length === 1 && n.draft)).toBe(true);
  });

  it('adopts under a group of your own and skips attributes the group already passes down', async () => {
    const mine = await createNode(deps(), cm, { name: 'Gaming' });
    const color = (await listAttributes(t.db, admin.ability, { q: 'color' })).find((a) => a.attribute.externalRef === 'color')!.attribute;
    await addCategoryAttribute(deps(), cm, mine.node.id, color.id, true);
    const r = await adoptStandardCategory(deps(), cm, { source: 'shopify', externalId: 'el-6-11', kind: 'group', parentId: mine.node.id }).catch((e) => e);
    // el-6-11 was adopted in the earlier test as a mirrored ancestor
    expect(String(r)).toMatch(/already in your tree/);
    const box = await adoptStandardCategory(deps(), cm, { source: 'shopify', externalId: 'el-18-3', kind: 'group', parentId: mine.node.id });
    expect(box.createdAncestors).toEqual([]);
    const set = await categoryAttributeSet(t.db, cm.ability, box.node.id);
    const inherited = set.find((a) => a.attributeId === color.id)!;
    expect(inherited).toMatchObject({ inheritedFrom: 'Gaming', required: true });
  });

  it('edits a category attribute set and blocks duplicates', async () => {
    const g = await createNode(deps(), cm, { name: 'Stationery' });
    const os = (await listAttributes(t.db, admin.ability, { q: 'operating system' }))[0]!.attribute;
    await addCategoryAttribute(deps(), cm, g.node.id, os.id);
    await expect(addCategoryAttribute(deps(), cm, g.node.id, os.id)).rejects.toThrow(/already in this category/);
    const child = await createNode(deps(), cm, { parentId: g.node.id, name: 'Pens' });
    await expect(addCategoryAttribute(deps(), cm, child.node.id, os.id)).rejects.toThrow(/already in this category/);
    const [row] = await categoryAttributeSet(t.db, cm.ability, g.node.id);
    await updateCategoryAttribute(deps(), cm, g.node.id, row!.id, true);
    expect((await categoryAttributeSet(t.db, cm.ability, child.node.id))[0]).toMatchObject({ required: true, inheritedFrom: 'Stationery' });
    await removeCategoryAttribute(deps(), cm, g.node.id, row!.id);
    expect(await categoryAttributeSet(t.db, cm.ability, child.node.id)).toEqual([]);
  });

  it('turns a childless group into a listing category and back', async () => {
    const home = await createNode(deps(), cm, { name: 'Home & office' });
    const g = await createNode(deps(), cm, { parentId: home.node.id, name: 'Furniture' });
    const chair = await createNode(deps(), cm, { parentId: g.node.id, name: 'Chairs' });
    await expect(setNodeKind(deps(), cm, g.node.id, 'listing', ['Office furniture'])).rejects.toThrow(/without children/);
    await expect(setNodeKind(deps(), cm, chair.node.id, 'listing')).rejects.toThrow(/alias/);
    await setNodeKind(deps(), cm, chair.node.id, 'listing', ['Office chairs']);
    let n = (await loadTree(t.db, cm.ability)).nodes.find((x) => x.id === chair.node.id)!;
    expect(n).toMatchObject({ kind: 'listing' });
    expect(n.draft).toMatchObject({ version: 0 });
    await setNodeKind(deps(), cm, chair.node.id, 'group');
    n = (await loadTree(t.db, cm.ability)).nodes.find((x) => x.id === chair.node.id)!;
    expect(n).toMatchObject({ kind: 'group', draft: null });
  });

  it('moves a subtree to another depth and recomputes levels', async () => {
    const a = await createNode(deps(), cm, { name: 'Level test' });
    const b = await createNode(deps(), cm, { parentId: a.node.id, name: 'Level B' });
    const c = await createNode(deps(), cm, { parentId: b.node.id, kind: 'listing', name: 'Level C', aliases: ['level test c'] });
    await moveNode(deps(), cm, b.node.id, null);
    const nodes = (await loadTree(t.db, cm.ability)).nodes;
    expect(nodes.find((x) => x.id === b.node.id)!.level).toBe(1);
    expect(nodes.find((x) => x.id === c.node.id)!.level).toBe(2);
    await expect(moveNode(deps(), cm, c.node.id, null)).rejects.toThrow(/parent group/);
  });

  it('reads any UNSPSC spreadsheet layout and imports it in chunks', async () => {
    const { entries, skippedRows } = parseUnspscRows(parseCsv(UNSPSC_CSV));
    expect(skippedRows).toBe(1); // the header
    expect(entries.map((e) => e.code)).toEqual(['43000000', '43210000', '43211500', '43211503', '43211507', '43211600', '43211602', '44000000', '44100000', '44101500', '44101501']);
    await expect(importUnspscChunk(deps(), cm, { version: 'v26', first: true, last: false, rows: [] })).rejects.toSatisfy((e) => code(e) === 'FORBIDDEN');
    await importUnspscChunk(deps(), admin, { version: 'v26', first: true, last: false, rows: entries.slice(0, 5) });
    await expect(importUnspscChunk(deps(), admin, { version: 'v27', first: false, last: true, rows: entries.slice(5) })).rejects.toThrow(/again/);
    await importUnspscChunk(deps(), admin, { version: 'v26', first: false, last: true, rows: entries.slice(5) });
    const status = (await standardsStatus(t.db, cm.ability)).find((s) => s.source === 'unspsc')!;
    expect(status).toMatchObject({ version: 'v26', categoryCount: 11, complete: true });
    const d = await getStandardCategory(t.db, cm.ability, 'unspsc', '43211602');
    expect(d.fullPath).toBe('Information Technology Broadcasting and Telecommunications > Computer Equipment and Accessories > Computer accessories > Docking stations');
    expect(d.levelName).toBe('Commodity');
    expect((await searchStandard(t.db, cm.ability, 'unspsc', '432115')).map((x) => x.externalId)).toEqual(['43211500', '43211503', '43211507']);
    expect((await browseStandard(t.db, cm.ability, 'unspsc', '43211500')).every((x) => x.isLeaf)).toBe(true);
  });

  it('adopts a UNSPSC commodity and maps categories to UNSPSC codes', async () => {
    const r = await adoptStandardCategory(deps(), cm, { source: 'unspsc', externalId: '43211503', kind: 'listing', aliases: ['Laptop computers'] });
    expect(r.createdAncestors).toHaveLength(3);
    expect(r.node).toMatchObject({ code: '43211503', unspscCode: '43211503', level: 4 });
    const tree = await loadTree(t.db, cm.ability);
    const laptops = tree.nodes.find((n) => n.code === 'el-6-11-2')!;
    await expect(setUnspscCode(deps(), cm, laptops.id, '1234')).rejects.toThrow(/8 digits/);
    await expect(setUnspscCode(deps(), cm, laptops.id, '43219999')).rejects.toThrow(/not in the loaded/);
    await setUnspscCode(deps(), cm, laptops.id, '43211503');
    expect((await loadTree(t.db, cm.ability)).nodes.find((n) => n.id === laptops.id)!.unspscCode).toBe('43211503');

    const audit = await listAuditEvents(t.db, admin.ability, {});
    expect(audit.items.map((e) => e.action)).toEqual(
      expect.arrayContaining(['standards.loaded', 'standards.load_started', 'taxonomy.node.adopted', 'library.attributes.imported', 'taxonomy.node.unspsc_mapped']),
    );
  });
});
