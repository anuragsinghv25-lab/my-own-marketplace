import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { defineAbilityFor, type Grant } from '@orbita/authz';
import { addSpec, compileVersion, getWorkspace, setTitleTemplate, startFromAttributeSet, updateSpec, type Ctx } from '@orbita/category-config';
import { freshTestDb, testDatabaseUrl } from '@orbita/db/test-support';
import { isAppError } from '@orbita/domain';
import { listDimensions, saveAttribute, saveValueList } from '@orbita/library';
import { listNotifications } from '@orbita/notifications';
import { addCategoryAttribute, createNode } from '@orbita/taxonomy';
import {
  assignReviews,
  categoryStatusList,
  commentOnReview,
  createNextVersion,
  decideVersion,
  discardDraft,
  liveCategory,
  rescheduleVersion,
  reviewQueue,
  reviewWorkspace,
  runDaily,
  setCategoryStatus,
  submitVersion,
  todayIn,
  versionReview,
  withdrawVersion,
} from '../src';

const meta = { requestId: 'req_r3' };
const code = (e: unknown) => (isAppError(e) ? e.code : String(e));
/** drizzle wraps Postgres errors; the trigger's message is on the cause */
const pgError = (re: RegExp) => (e: unknown) => re.test(String((e as { cause?: { message?: string } })?.cause?.message ?? e));
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const at = (iso: string) => new Date(`${iso}T06:00:00Z`); // 11:30 in India

describe.skipIf(!testDatabaseUrl)('R3 · category approval and publishing (Postgres)', () => {
  let t: Awaited<ReturnType<typeof freshTestDb>>;
  const users: Record<string, string> = {};
  const ctxOf = (name: string, grants: Grant[]): Ctx => ({
    actor: { id: users[name]!, email: `${name}@example.com`, fullName: name },
    ability: defineAbilityFor({ userId: users[name]!, grants }),
    meta,
  });
  const g = (...roles: Grant['role'][]): Grant[] => roles.map((role) => ({ role, scopeType: 'global', scopeId: null }));
  let admin: Ctx, cm: Ctx, approver: Ctx, approver2: Ctx, both: Ctx, auditor: Ctx;
  const deps = () => ({ db: t.db });
  let versionId: string, ramSpecId: string, nodeId: string, requestId: string, otherVersionId: string;
  const today = todayIn();

  beforeAll(async () => {
    t = await freshTestDb('r3');
    for (const n of ['admin', 'cm', 'approver', 'approver2', 'both', 'auditor']) {
      users[n] = randomUUID();
      await t.db.execute(sql`insert into auth.users (id, email) values (${users[n]!}, ${n + '@example.com'})`);
      await t.db.execute(sql`insert into profiles (id, email, full_name, status) values (${users[n]!}, ${n + '@example.com'}, ${n}, 'active')`);
    }
    admin = ctxOf('admin', g('platform_admin'));
    cm = ctxOf('cm', g('category_manager'));
    approver = ctxOf('approver', g('approver'));
    approver2 = ctxOf('approver2', g('approver'));
    both = ctxOf('both', g('category_manager', 'approver'));
    auditor = ctxOf('auditor', g('auditor'));
    await t.db.execute(sql`insert into role_grants (user_id, role, scope_type) values
      (${users.cm!}, 'category_manager', 'global'), (${users.approver!}, 'approver', 'global'), (${users.approver2!}, 'approver', 'global'),
      (${users.both!}, 'category_manager', 'global'), (${users.both!}, 'approver', 'global'), (${users.auditor!}, 'auditor', 'global')`);

    const processors = await saveValueList(deps(), admin, { name: 'Processor families', kind: 'ordinal', items: [{ value: 'Intel Core i7', weight: 70 }, { value: 'AMD Ryzen 7', weight: 70 }] });
    const dims = await listDimensions(t.db, admin.ability);
    const storage = dims.find((d) => d.code === 'data_storage')!;
    const processor = (await saveAttribute(deps(), admin, { name: 'Processor', dataType: 'ordinal', valueListId: processors.id })).id;
    const ram = (await saveAttribute(deps(), admin, { name: 'RAM', code: 'ram_gb', dataType: 'measurable', dimensionId: storage.id, defaultUnitId: storage.units.find((u) => u.symbol === 'GB')!.id })).id;
    const electronics = await createNode(deps(), cm, { name: 'Electronics' });
    await addCategoryAttribute(deps(), cm, electronics.node.id, processor, true);
    const gaming = await createNode(deps(), cm, { parentId: electronics.node.id, kind: 'listing', name: 'Gaming laptops', aliases: ['Gaming notebooks'] });
    nodeId = gaming.node.id;
    versionId = gaming.draft!.id;
    await startFromAttributeSet(deps(), cm, versionId);
    await addSpec(deps(), cm, versionId, ram, 'Performance');
    ramSpecId = (await getWorkspace(t.db, cm, versionId)).specs.find((s) => s.key === 'ram_gb')!.id;
    await updateSpec(deps(), cm, versionId, ramSpecId, { importance: 'key', minValue: 4, maxValue: 128 });
    await setTitleTemplate(deps(), cm, versionId, '{brand} {model} {processor} {ram_gb}');
    otherVersionId = (await createNode(deps(), cm, { parentId: electronics.node.id, kind: 'listing', name: 'Business laptops', aliases: ['Office notebooks'] })).draft!.id;
  });
  afterAll(async () => t?.drop());

  it('a version must compile cleanly before it can be submitted', async () => {
    await expect(submitVersion(deps(), cm, versionId)).rejects.toThrow(/Compile the contract before submitting/);
    await compileVersion(deps(), cm, versionId);
    await setTitleTemplate(deps(), cm, versionId, '{brand} {model} {ram_gb} {processor}');
    await expect(submitVersion(deps(), cm, versionId)).rejects.toThrow(/changes since the last compile/);
    await compileVersion(deps(), cm, versionId);
    const r = await versionReview(t.db, cm, versionId);
    expect(r.readiness).toMatchObject({ ready: true, problems: [] });
  });

  it('exit demo 1: the checker submits and it reaches the approvers', async () => {
    const res = await submitVersion(deps(), cm, versionId, 'Ready for a look.');
    requestId = res.requestId;
    expect(res.attempt).toBe(1);
    await expect(setTitleTemplate(deps(), cm, versionId, '{brand}')).rejects.toThrow(/in review.*Withdraw it from review first/);
    // the database refuses too, whoever asks
    await expect(t.db.execute(sql`update spec_definitions set max_value = 64 where id = ${ramSpecId}`)).rejects.toSatisfy(pgError(/frozen/));
    const queue = await reviewQueue(t.db, approver, 'queue');
    expect(queue.map((q) => q.title)).toEqual(['Electronics › Gaming laptops · v0']);
    expect(queue[0]).toMatchObject({ canDecide: true, assigneeId: null, attempt: 1 });
    expect((await listNotifications(t.db, approver.actor)).items[0]).toMatchObject({ kind: 'review.submitted', link: `/reviews/${requestId}` });
    // the submitter cannot see it as something to pick up
    expect(await reviewQueue(t.db, both, 'queue')).toHaveLength(1);
  });

  it('withdrawal is possible until the approver acts', async () => {
    await withdrawVersion(deps(), cm, versionId);
    expect((await getWorkspace(t.db, cm, versionId)).version.state).toBe('DRAFT');
    requestId = (await submitVersion(deps(), cm, versionId)).requestId;
    await assignReviews(deps(), approver, [requestId], approver.actor.id);
    await commentOnReview(deps(), approver, requestId, { fieldKey: 'ram_gb', fieldLabel: 'RAM', body: 'Gaming laptops top out at 64 GB; 128 invites typos.' });
    await expect(withdrawVersion(deps(), cm, versionId)).rejects.toThrow(/started reviewing/);
  });

  it('exit demo 2: comment on RAM, send back, fix, resubmit; the compare view shows the change', async () => {
    await expect(decideVersion(deps(), approver, versionId, { decision: 'send_back', reasonCode: 'values_wrong', note: '' })).rejects.toThrow(/Add a note/);
    await expect(decideVersion(deps(), approver, versionId, { decision: 'send_back', reasonCode: 'duplicate', note: 'Fix RAM max' })).rejects.toThrow(/Pick a reason/);
    await decideVersion(deps(), approver, versionId, { decision: 'send_back', reasonCode: 'values_wrong', note: 'Please cap RAM at 64 GB.' });
    expect((await getWorkspace(t.db, cm, versionId)).version.state).toBe('SENT_BACK');
    expect((await listNotifications(t.db, cm.actor)).items[0]).toMatchObject({ kind: 'review.send_back', title: 'Gaming laptops v0 was sent back' });

    await updateSpec(deps(), cm, versionId, ramSpecId, { maxValue: 64 });
    await compileVersion(deps(), cm, versionId);
    const again = await submitVersion(deps(), cm, versionId);
    expect(again).toEqual({ requestId, attempt: 2 });
    // it goes back to the approver who sent it back
    expect((await reviewQueue(t.db, approver, 'mine')).map((r) => r.id)).toEqual([requestId]);
    const ws = await reviewWorkspace(t.db, approver, requestId);
    expect(ws.changes.previousAttempt).toBe(1);
    expect(ws.changes.sincePrevious).toEqual([{ area: 'spec', key: 'ram_gb', label: 'RAM', kind: 'modified', details: ['Maximum: 128 → 64'] }]);
    expect(ws.changes.sinceLive!.every((c) => c.kind === 'added')).toBe(true);
    expect(ws.comments.find((c) => c.fieldKey === 'ram_gb')).toMatchObject({ attempt: 1, authorName: 'approver' });
    // the withdrawn attempt closed its own request; this one holds the real review
    expect(ws.decisions.map((d) => d.decision)).toEqual(['send_back']);
  });

  it('exit demo 3: nobody approves their own work', async () => {
    await expect(decideVersion(deps(), cm, versionId, { decision: 'approve', schedule: { sellerGoLive: today, buyerGoLive: today } })).rejects.toSatisfy((e) => code(e) === 'FORBIDDEN');
    // someone with both roles who touched the version is still a maker for it
    await t.db.execute(sql`update category_versions set editor_ids = array_append(editor_ids, ${users.both!}::uuid) where id = ${versionId}`);
    await expect(decideVersion(deps(), both, versionId, { decision: 'approve', schedule: { sellerGoLive: today, buyerGoLive: today } })).rejects.toThrow(/You edited this version/);
    expect((await reviewWorkspace(t.db, both, requestId)).whyNot).toMatch(/You edited this version/);
    await expect(assignReviews(deps(), admin, [requestId], users.both!)).rejects.toThrow(/edited or submitted it/);
    // a platform admin can transfer it, but never decide
    await assignReviews(deps(), admin, [requestId], users.approver2!);
    await expect(decideVersion(deps(), admin, versionId, { decision: 'approve', schedule: { sellerGoLive: today, buyerGoLive: today } })).rejects.toSatisfy((e) => code(e) === 'FORBIDDEN');
    await assignReviews(deps(), admin, [requestId], users.approver!);
    await expect(decideVersion(deps(), auditor, versionId, { decision: 'approve', schedule: { sellerGoLive: today, buyerGoLive: today } })).rejects.toSatisfy((e) => code(e) === 'FORBIDDEN');
  });

  it('exit demo 4: approved with sellers today and buyers next week, the category is live for sellers', async () => {
    const nextWeek = addDays(today, 7);
    await expect(decideVersion(deps(), approver, versionId, { decision: 'approve', schedule: { sellerGoLive: today, buyerGoLive: addDays(today, -1) } })).rejects.toThrow(/Buyers cannot go live before sellers/);
    const res = await decideVersion(deps(), approver, versionId, { decision: 'approve', schedule: { sellerGoLive: today, buyerGoLive: nextWeek } });
    expect(res.state).toBe('PUBLISHED');
    const status = (await categoryStatusList(t.db, cm)).find((s) => s.nodeId === nodeId)!;
    expect(status.status).toMatchObject({ key: 'live_for_sellers', label: 'Live for sellers', sellers: true, buyers: false });
    const live = await liveCategory(t.db, cm, nodeId);
    expect(live.contract!.fields.find((f) => f.key === 'ram_gb')!.max).toBe(64);
    // frozen for good: published history only moves forward
    await expect(t.db.execute(sql`update category_versions set state = 'DRAFT' where id = ${versionId}`)).rejects.toSatisfy(pgError(/cannot go from PUBLISHED to DRAFT/));
    // a week later buyers have it too
    expect((await categoryStatusList(t.db, cm, at(nextWeek))).find((s) => s.nodeId === nodeId)!.status.key).toBe('live');
  });

  it('exit demo 5: the audit trail shows every step', async () => {
    const rows = await t.db.execute<{ action: string }>(sql`select action from audit_events where subject_id in (${versionId}, ${requestId}) order by id`);
    const actions = rows.map((r) => r.action).filter((a) => a.startsWith('category.version') || a.startsWith('review.'));
    expect(actions).toEqual([
      'category.version.submitted',
      'category.version.withdrawn',
      'category.version.submitted',
      'review.claimed',
      'review.commented',
      'category.version.sent_back',
      'category.version.submitted',
      'review.transferred',
      'review.transferred',
      'category.version.approved',
      'category.version.published',
    ]);
  });

  it('the next version clones the live one, is scheduled, and goes live on its date', async () => {
    await expect(createNextVersion(deps(), approver, nodeId)).rejects.toSatisfy((e) => code(e) === 'FORBIDDEN');
    const next = await createNextVersion(deps(), cm, nodeId);
    expect(next).toMatchObject({ number: 1, from: 0 });
    await expect(createNextVersion(deps(), cm, nodeId)).rejects.toThrow(/still being worked on/);
    const ws = await getWorkspace(t.db, cm, next.id);
    expect(ws.specs.map((s) => s.key)).toEqual(['processor', 'ram_gb']);
    await updateSpec(deps(), cm, next.id, ws.specs.find((s) => s.key === 'ram_gb')!.id, { maxValue: 96 });
    await compileVersion(deps(), cm, next.id);
    const { requestId: r2 } = await submitVersion(deps(), cm, next.id);
    const review = await reviewWorkspace(t.db, approver2, r2);
    expect(review.changes.liveNumber).toBe(0);
    expect(review.changes.sinceLive).toEqual([{ area: 'spec', key: 'ram_gb', label: 'RAM', kind: 'modified', details: ['Maximum: 64 → 96'] }]);

    const in3 = addDays(today, 3);
    expect((await decideVersion(deps(), approver2, next.id, { decision: 'approve', schedule: { sellerGoLive: in3, buyerGoLive: in3, testMode: true } })).state).toBe('SCHEDULED');
    let status = (await categoryStatusList(t.db, cm)).find((s) => s.nodeId === nodeId)!;
    expect(status.scheduled).toMatchObject({ number: 1 });
    expect(status.status.testMode).toBe(true);
    expect(status.status.note).toMatch(/v1 replaces it on/);

    const in2 = addDays(today, 2);
    await rescheduleVersion(deps(), approver2, next.id, { sellerGoLive: in2, buyerGoLive: in2 });
    await expect(rescheduleVersion(deps(), cm, next.id, { sellerGoLive: in3, buyerGoLive: in3 })).rejects.toSatisfy((e) => code(e) === 'FORBIDDEN');
    expect(await runDaily(t.db, at(addDays(today, 1)))).toMatchObject({ published: 0 });
    expect(await runDaily(t.db, at(in2))).toMatchObject({ published: 1 });
    status = (await categoryStatusList(t.db, cm, at(in2))).find((s) => s.nodeId === nodeId)!;
    expect(status.live).toMatchObject({ number: 1 });
    expect(status.status.key).toBe('live');
    const states = await t.db.execute<{ version: number; state: string }>(sql`select version, state from category_versions where node_id = ${nodeId} order by version`);
    expect(states.map((s) => `${s.version}:${s.state}`)).toEqual(['0:SUPERSEDED', '1:PUBLISHED']);
  });

  it('downtime and maintenance windows override what is live', async () => {
    await expect(setCategoryStatus(deps(), cm, nodeId, { status: 'deactivated', reason: 'Recall of all models' })).rejects.toThrow(/Only an approver/);
    await setCategoryStatus(deps(), cm, nodeId, { status: 'maintenance', reason: 'Spec clean-up' });
    const later = new Date(Date.now() + 60_000);
    const s = (await categoryStatusList(t.db, cm, later)).find((x) => x.nodeId === nodeId)!;
    expect(s.status).toMatchObject({ key: 'maintenance', sellers: false, buyers: false });
    await setCategoryStatus(deps(), cm, nodeId, { status: 'active', reason: 'Clean-up finished' }, later);
    expect((await categoryStatusList(t.db, cm, new Date(later.getTime() + 1000))).find((x) => x.nodeId === nodeId)!.status.key).toBe('live_for_sellers');
  });

  it('discarding a draft needs a reason; SLA reminders and escalations go out', async () => {
    await expect(discardDraft(deps(), cm, otherVersionId, '')).rejects.toThrow(/Say why/);
    // business laptops: compile, submit, then let it wait
    const ws = await getWorkspace(t.db, cm, otherVersionId);
    expect(ws.version.state).toBe('DRAFT');
    const ram = (await getWorkspace(t.db, cm, versionId)).specs.find((x) => x.key === 'ram_gb')!.attributeId;
    await addSpec(deps(), cm, otherVersionId, ram);
    await compileVersion(deps(), cm, otherVersionId);
    const { requestId: r3 } = await submitVersion(deps(), cm, otherVersionId);
    const res = await runDaily(t.db, new Date(Date.now() + 25 * 3_600_000));
    expect(res.reminded).toBe(1);
    expect((await listNotifications(t.db, approver2.actor)).items[0]).toMatchObject({ kind: 'review.reminder' });
    expect((await runDaily(t.db, new Date(Date.now() + 49 * 3_600_000))).escalated).toBe(1);
    expect((await reviewQueue(t.db, approver, 'queue', { overdueOnly: false })).find((q) => q.id === r3)).toBeTruthy();
    await decideVersion(deps(), approver, otherVersionId, { decision: 'discard', reasonCode: 'duplicate', note: 'Same as Gaming laptops for now.' });
    const after = await getWorkspace(t.db, cm, otherVersionId);
    expect(after.version.state).toBe('DISCARDED');
    // a new draft can start again from scratch
    const fresh = await createNextVersion(deps(), cm, (await t.db.execute<{ node_id: string }>(sql`select node_id from category_versions where id = ${otherVersionId}`))[0]!.node_id);
    expect(fresh).toMatchObject({ number: 1, from: null });
    await discardDraft(deps(), cm, fresh.id, 'Not needed this quarter.');
  });
});
