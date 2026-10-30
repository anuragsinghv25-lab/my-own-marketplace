import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { defineAbilityFor, type Grant } from '@orbita/authz';
import { evaluate } from '@orbita/contract';
import { freshTestDb, testDatabaseUrl } from '@orbita/db/test-support';
import { isAppError } from '@orbita/domain';
import { listBooleanPairs, listDimensions, saveAttribute, saveFlagProfile, saveValueList } from '@orbita/library';
import { addCategoryAttribute, createNode } from '@orbita/taxonomy';
import {
  acquireLock,
  addSpec,
  applyProfile,
  assignVersion,
  clearFlag,
  cloneFrom,
  compileDraft,
  compileVersion,
  deleteRule,
  getWorkspace,
  latestContract,
  listVersions,
  moveSpec,
  renameGroup,
  saveRule,
  saveTestCase,
  setFlag,
  setRuleEnabled,
  setTitleTemplate,
  startFromAttributeSet,
  updateSpec,
  versionHistory,
  type Ctx,
} from '../src';

const meta = { requestId: 'req_r2' };
const code = (e: unknown) => (isAppError(e) ? e.code : String(e));

describe.skipIf(!testDatabaseUrl)('R2 · category configuration studio (Postgres)', () => {
  let t: Awaited<ReturnType<typeof freshTestDb>>;
  const users: Record<string, string> = {};
  const ctxOf = (name: string, grants: Grant[]): Ctx => ({
    actor: { id: users[name]!, email: `${name}@example.com`, fullName: name },
    ability: defineAbilityFor({ userId: users[name]!, grants }),
    meta,
  });
  let admin: Ctx, cm: Ctx, cm2: Ctx, approver: Ctx;
  const deps = () => ({ db: t.db });
  let versionId: string, otherVersionId: string, profileId: string;
  const attr: Record<string, string> = {};

  beforeAll(async () => {
    t = await freshTestDb('r2');
    for (const n of ['admin', 'cm', 'cm2', 'approver']) {
      users[n] = randomUUID();
      await t.db.execute(sql`insert into auth.users (id, email) values (${users[n]!}, ${n + '@example.com'})`);
      await t.db.execute(sql`insert into profiles (id, email, full_name, status) values (${users[n]!}, ${n + '@example.com'}, ${n}, 'active')`);
    }
    const g = (role: Grant['role']): Grant[] => [{ role, scopeType: 'global', scopeId: null }];
    admin = ctxOf('admin', g('platform_admin'));
    cm = ctxOf('cm', g('category_manager'));
    cm2 = ctxOf('cm2', g('category_manager'));
    approver = ctxOf('approver', g('approver'));
    await t.db.execute(sql`insert into role_grants (user_id, role, scope_type) values (${users.cm!}, 'category_manager', 'global'), (${users.cm2!}, 'category_manager', 'global'), (${users.approver!}, 'approver', 'global')`);

    // library: the attributes the exit demo uses
    const processors = await saveValueList(deps(), admin, {
      name: 'Processor families',
      kind: 'ordinal',
      items: [
        { value: 'Intel Core i5', weight: 50 },
        { value: 'Intel Core i7', weight: 70 },
        { value: 'AMD Ryzen 7', weight: 70 },
        { value: 'AMD Ryzen 9', weight: 90 },
      ],
    });
    const gpus = await saveValueList(deps(), admin, {
      name: 'Graphics cards',
      items: [{ value: 'NVIDIA RTX 4060' }, { value: 'NVIDIA RTX 4070' }, { value: 'AMD Radeon RX 7600M' }, { value: 'Intel Arc A370M' }],
    });
    const dims = await listDimensions(t.db, admin.ability);
    const dim = (c: string) => dims.find((d) => d.code === c)!;
    const yesNo = (await listBooleanPairs(t.db, admin.ability)).find((p) => p.code === 'yes_no')!;
    attr.processor = (await saveAttribute(deps(), admin, { name: 'Processor', dataType: 'ordinal', valueListId: processors.id })).id;
    attr.gpu = (await saveAttribute(deps(), admin, { name: 'Graphics card', dataType: 'enumerable', valueListId: gpus.id })).id;
    attr.ram = (await saveAttribute(deps(), admin, { name: 'RAM', code: 'ram_gb', dataType: 'measurable', dimensionId: dim('data_storage').id, defaultUnitId: dim('data_storage').units.find((u) => u.symbol === 'GB')!.id, validation: { min: 1, max: 512 } })).id;
    attr.refresh = (await saveAttribute(deps(), admin, { name: 'Refresh rate', dataType: 'measurable', dimensionId: dim('frequency').id, defaultUnitId: dim('frequency').units.find((u) => u.symbol === 'Hz')!.id })).id;
    attr.rgb = (await saveAttribute(deps(), admin, { name: 'RGB keyboard', dataType: 'boolean', booleanPairId: yesNo.id })).id;
    profileId = (await saveFlagProfile(deps(), admin, { name: 'Branded electronics', values: { discount_band: { min: 5, max: 40 }, allowed_sellers: 'oem_and_authorised', max_images: 8 } })).id;

    // tree: Electronics (with Processor and RAM as its attribute set) › Gaming laptops
    const electronics = await createNode(deps(), cm, { name: 'Electronics' });
    await addCategoryAttribute(deps(), cm, electronics.node.id, attr.processor!, true);
    await addCategoryAttribute(deps(), cm, electronics.node.id, attr.ram!, true);
    const gaming = await createNode(deps(), cm, { parentId: electronics.node.id, kind: 'listing', name: 'Gaming laptops', aliases: ['Gaming notebooks'] });
    await addCategoryAttribute(deps(), cm, gaming.node.id, attr.gpu!);
    versionId = gaming.draft!.id;
    otherVersionId = (await createNode(deps(), cm, { parentId: electronics.node.id, kind: 'listing', name: 'Business laptops', aliases: ['Office notebooks'] })).draft!.id;
  });
  afterAll(async () => t?.drop());

  it('exit demo 1: applying the profile leaves only the overrides to decide', async () => {
    let ws = await getWorkspace(t.db, cm, versionId);
    expect(ws.canEdit).toBe(true);
    expect(ws.flags.find((f) => f.key === 'discount_band')).toMatchObject({ source: 'default', value: { min: 5, max: 40 } });
    await applyProfile(deps(), cm, versionId, profileId);
    ws = await getWorkspace(t.db, cm, versionId);
    expect(ws.profile).toMatchObject({ name: 'Branded electronics', outdated: false });
    expect(ws.flags.filter((f) => f.source === 'profile').map((f) => f.key).sort()).toEqual(['allowed_sellers', 'discount_band', 'max_images']);
    await setFlag(deps(), cm, versionId, 'max_images', 10);
    expect((await getWorkspace(t.db, cm, versionId)).flags.find((f) => f.key === 'max_images')).toMatchObject({ source: 'version', value: 10, profileValue: 8 });
    await clearFlag(deps(), cm, versionId, 'max_images');
    expect((await getWorkspace(t.db, cm, versionId)).flags.find((f) => f.key === 'max_images')).toMatchObject({ source: 'profile', value: 8 });
    await expect(setFlag(deps(), cm, versionId, 'max_images', 99)).rejects.toThrow(/from 1 to 20/);
    await expect(setFlag(deps(), cm, versionId, 'land_border_rule', false)).rejects.toSatisfy((e) => code(e) === 'FORBIDDEN');
  });

  it('exit demo 2: specs start from the attribute set and are tuned', async () => {
    expect(await startFromAttributeSet(deps(), cm, versionId)).toEqual({ added: 3 });
    expect(await startFromAttributeSet(deps(), cm, versionId)).toEqual({ added: 0 });
    await addSpec(deps(), cm, versionId, attr.refresh!, 'Display');
    await addSpec(deps(), cm, versionId, attr.rgb!, 'Design');
    await expect(addSpec(deps(), cm, versionId, attr.rgb!)).rejects.toThrow(/already a specification/);
    const ws = await getWorkspace(t.db, cm, versionId);
    const spec = (k: string) => ws.specs.find((s) => s.key === k)!;
    expect(ws.specs.map((s) => s.key)).toEqual(['processor', 'ram_gb', 'graphics_card', 'refresh_rate', 'rgb_keyboard']);
    expect(spec('processor')).toMatchObject({ importance: 'required', filterable: true });
    await updateSpec(deps(), cm, versionId, spec('processor').id, { importance: 'key', preference: 'higher', groupName: 'Performance' });
    await updateSpec(deps(), cm, versionId, spec('ram_gb').id, { importance: 'key', preference: 'higher', groupName: 'Performance', minValue: 4, maxValue: 128, step: 4, variantOption: true });
    await updateSpec(deps(), cm, versionId, spec('graphics_card').id, { importance: 'required', groupName: 'Performance' });
    await updateSpec(deps(), cm, versionId, spec('rgb_keyboard').id, { importance: 'optional' });
    await expect(updateSpec(deps(), cm, versionId, spec('graphics_card').id, { allowedValues: ['Voodoo 2'] })).rejects.toThrow(/not in the value list/);
    await expect(updateSpec(deps(), cm, versionId, spec('ram_gb').id, { unitId: spec('refresh_rate').units[0]!.id })).rejects.toThrow(/does not measure RAM/);
    await moveSpec(deps(), cm, versionId, spec('rgb_keyboard').id, 'up');
    await renameGroup(deps(), cm, versionId, 'Design', 'Build');
    await expect(renameGroup(deps(), cm, versionId, 'General', 'More')).rejects.toThrow(/Group not found/);
    const after = await getWorkspace(t.db, cm, versionId);
    expect(after.specs.map((s) => s.key)).toEqual(['processor', 'ram_gb', 'graphics_card', 'rgb_keyboard', 'refresh_rate']);
    expect(after.specs.find((s) => s.key === 'rgb_keyboard')!.groupName).toBe('Build');
    await setTitleTemplate(deps(), cm, versionId, '{brand} {model} {processor} {ram_gb} ({graphics_card})');
    const draft = await compileDraft(t.db, cm.ability, versionId);
    expect(draft.ok).toBe(true);
    expect(draft.contract!.groups).toEqual(['Performance', 'Build', 'Display']);
  });

  it('exit demo 3: a rule limits graphics cards when the processor is AMD, and the simulator shows it', async () => {
    const amd = await saveRule(deps(), cm, versionId, {
      kind: 'restrict',
      name: 'AMD pairs with AMD or NVIDIA graphics',
      when: [{ key: 'processor', op: 'in', values: ['AMD Ryzen 7', 'AMD Ryzen 9'] }],
      target: 'graphics_card',
      values: ['NVIDIA RTX 4060', 'NVIDIA RTX 4070', 'AMD Radeon RX 7600M'],
    });
    expect(amd.issues).toEqual([]);
    await saveRule(deps(), cm, versionId, { kind: 'restrict', name: 'Gaming needs 8 GB', target: 'ram_gb', min: 8, message: 'Gaming laptops need at least 8 GB.' });
    const broken = await saveRule(deps(), cm, versionId, { kind: 'require', name: 'Weight needed', target: 'weight_kg' });
    expect(broken.issues[0]!.message).toMatch(/not a specification/);
    await setRuleEnabled(deps(), cm, versionId, broken.rule.id, false);
    expect((await compileDraft(t.db, cm.ability, versionId)).ok).toBe(true);
    await deleteRule(deps(), cm, versionId, broken.rule.id);

    const c = (await compileDraft(t.db, cm.ability, versionId)).contract!;
    const sim = evaluate(c, { values: { processor: 'AMD Ryzen 7', ram_gb: 16, graphics_card: 'Intel Arc A370M' } });
    expect(sim.fields.graphics_card!.options!.map((o) => o.value)).toEqual(['NVIDIA RTX 4060', 'NVIDIA RTX 4070', 'AMD Radeon RX 7600M']);
    expect(sim.errors[0]!.message).toMatch(/not allowed with the other values chosen/);
  });

  it('exit demo 4 and 5: discount band in the preview; RAM = 4 GB fails as the test case expects', async () => {
    const c = (await compileDraft(t.db, cm.ability, versionId)).contract!;
    const e = evaluate(c, { values: { processor: 'Intel Core i7', ram_gb: 16, graphics_card: 'NVIDIA RTX 4060' }, brand: 'Orbis', model: 'G15', price: 80000, mrp: 100000 });
    expect(e.priceBand).toMatchObject({ min: 60000, max: 95000 });
    expect(e.title).toBe('Orbis G15 Intel Core i7 16 GB (NVIDIA RTX 4060)');
    expect(e.errors).toEqual([]);

    await saveTestCase(deps(), cm, versionId, { name: 'RAM = 4 GB is rejected', expectation: 'fail', sample: { values: { processor: 'Intel Core i7', ram_gb: 4, graphics_card: 'NVIDIA RTX 4060' } } });
    await saveTestCase(deps(), cm, versionId, { name: 'A complete i7 laptop passes', expectation: 'pass', sample: { values: { processor: 'Intel Core i7', ram_gb: 16, graphics_card: 'NVIDIA RTX 4060' }, price: 80000, mrp: 100000 } });
    await saveTestCase(deps(), cm, versionId, { name: 'Wrongly expects AMD + Arc to pass', expectation: 'pass', sample: { values: { processor: 'AMD Ryzen 7', ram_gb: 16, graphics_card: 'Intel Arc A370M' } } });
    const r = await compileVersion(deps(), cm, versionId);
    expect(r.ok).toBe(true);
    expect(r.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.tests.map((x) => [x.name, x.ok])).toEqual([
      ['RAM = 4 GB is rejected', true],
      ['A complete i7 laptop passes', true],
      ['Wrongly expects AMD + Arc to pass', false],
    ]);
    expect(r.tests[0]!.message).toBe('RAM: must be at least 8 GB. Gaming laptops need at least 8 GB.');
    // same configuration → same hash
    expect((await compileVersion(deps(), cm, versionId)).hash).toBe(r.hash);
    expect((await latestContract(t.db, approver.ability, versionId)).hash).toBe(r.hash);
    await expect(t.db.execute(sql`update category_contracts set ok = false where version_id = ${versionId}`)).rejects.toThrow();
  });

  it('one editor at a time, with take-over after inactivity', async () => {
    await expect(setTitleTemplate(deps(), cm2, versionId, '{brand}')).rejects.toThrow(/cm is editing this version/);
    expect(await acquireLock(deps(), cm2, versionId)).toMatchObject({ locked: false, reason: 'held' });
    await t.db.execute(sql`update category_versions set locked_at = now() - interval '20 minutes' where id = ${versionId}`);
    expect(await acquireLock(deps(), cm2, versionId)).toEqual({ locked: true });
    await setTitleTemplate(deps(), cm2, versionId, '{brand} {model} {processor} {ram_gb} ({graphics_card})');
    await expect(setTitleTemplate(deps(), cm, versionId, '{brand}')).rejects.toThrow(/cm2 is editing/);
    await t.db.execute(sql`update category_versions set locked_at = now() - interval '20 minutes' where id = ${versionId}`);
    expect(await acquireLock(deps(), cm, versionId)).toEqual({ locked: true });
  });

  it('only category managers edit, only drafts, and every editor is remembered for separation of duties', async () => {
    await expect(setTitleTemplate(deps(), approver, versionId, '{brand}')).rejects.toSatisfy((e) => code(e) === 'FORBIDDEN');
    const ws = await getWorkspace(t.db, approver, versionId);
    expect(ws.canEdit).toBe(false);
    const [row] = await t.db.execute<{ editor_ids: string[] }>(sql`select editor_ids from category_versions where id = ${versionId}`);
    expect(row!.editor_ids).toEqual(expect.arrayContaining([users.cm, users.cm2]));
    await t.db.execute(sql`update category_versions set state = 'PUBLISHED' where id = ${otherVersionId}`);
    await expect(setTitleTemplate(deps(), cm, otherVersionId, '{brand}')).rejects.toThrow(/published and can no longer be edited/);
    await t.db.execute(sql`update category_versions set state = 'DRAFT' where id = ${otherVersionId}`);
  });

  it('clones sections from another version and reassigns work', async () => {
    await cloneFrom(deps(), cm, otherVersionId, versionId, ['specs', 'rules', 'title']);
    const ws = await getWorkspace(t.db, cm, otherVersionId);
    expect(ws.specs).toHaveLength(5);
    expect(ws.rules.map((r) => r.name)).toEqual(['AMD pairs with AMD or NVIDIA graphics', 'Gaming needs 8 GB']);
    expect(ws.rules[0]!.text).toMatch(/^When Processor is AMD Ryzen 7 or AMD Ryzen 9, Graphics card can only be/);
    await assignVersion(deps(), cm, otherVersionId, users.cm2!);
    await expect(assignVersion(deps(), cm, otherVersionId, users.approver!)).rejects.toThrow(/category manager/);
    const mine = await listVersions(t.db, cm2, { mine: true });
    expect(mine.map((v) => v.node.name)).toEqual(['Business laptops']);
    const all = await listVersions(t.db, cm);
    expect(all.find((v) => v.id === versionId)).toMatchObject({ compiled: true, specCount: 5, ruleCount: 2 });
  });

  it('keeps a readable history of every change', async () => {
    const h = await versionHistory(t.db, cm.ability, versionId);
    const actions = h.map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['config.profile.applied', 'config.flag.set', 'config.specs.seeded', 'config.spec.updated', 'config.rule.added', 'config.test.added', 'config.compiled', 'config.lock.taken_over']));
    expect(h.find((e) => e.action === 'config.compiled')!.summary).toMatch(/compiled the contract [0-9a-f]{12}; 2 of 3 test cases behaved as expected \(Gaming laptops v0\)/);
  });
});
