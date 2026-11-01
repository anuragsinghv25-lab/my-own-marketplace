import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { defineAbilityFor } from '@orbita/authz';
import { reviewDefinitions } from '@orbita/db';
import { freshTestDb, testDatabaseUrl } from '@orbita/db/test-support';
import { decide, definitionFor, listRequests, openAttempt, requestDetail, slaDue, updateDefinition, type Ctx } from '../src';

describe.skipIf(!testDatabaseUrl)('review engine (Postgres)', () => {
  let t: Awaited<ReturnType<typeof freshTestDb>>;
  let admin: Ctx;
  const maker = randomUUID();
  const checker = randomUUID();

  beforeAll(async () => {
    t = await freshTestDb('reviews');
    const id = randomUUID();
    await t.db.execute(sql`insert into auth.users (id, email) values (${id}, 'admin@example.com')`);
    await t.db.execute(sql`insert into profiles (id, email, full_name, status) values (${id}, 'admin@example.com', 'Admin', 'active')`);
    admin = { actor: { id, email: 'admin@example.com', fullName: 'Admin' }, ability: defineAbilityFor({ userId: id, grants: [{ role: 'platform_admin', scopeType: 'global', scopeId: null }] }), meta: { requestId: 'r' } };
    // a two-stage definition, as brands will have in R4
    await t.db.insert(reviewDefinitions).values({
      subjectType: 'test_subject',
      name: 'Test review',
      stages: [
        { key: 'check', label: 'Check', role: 'reviewer' },
        { key: 'approve', label: 'Approve', role: 'approver' },
      ],
      reasonCodes: [{ code: 'other', label: 'Other', for: ['send_back', 'discard'] }],
      slaHours: 10,
      reminderHours: 4,
      maxAttempts: 2,
    });
  });
  afterAll(async () => t?.drop());

  it('ships with the category version definition', async () => {
    const d = await definitionFor(t.db, 'category_version');
    expect(d.stages.map((s) => s.role)).toEqual(['approver']);
    expect(d.reasonCodes.some((r) => r.for.includes('discard'))).toBe(true);
  });

  it('runs stages in order, counts attempts and enforces the attempt limit', async () => {
    const subjectId = randomUUID();
    const input = { subjectType: 'test_subject', subjectId, title: 'Thing', workgroupId: null, submittedBy: maker };
    const first = await t.db.transaction((tx) => openAttempt(tx, input));
    expect(first.task.stage).toBe('check');
    await expect(t.db.transaction((tx) => openAttempt(tx, input))).rejects.toThrow(/already waiting/);
    expect((await t.db.transaction((tx) => decide(tx, { requestId: first.request.id, decision: 'approve', by: checker }))).final).toBe(false);
    expect((await requestDetail(t.db, first.request.id)).openTask!.stage).toBe('approve');
    await t.db.transaction((tx) => decide(tx, { requestId: first.request.id, decision: 'send_back', reasonCode: 'other', note: 'Needs work', by: checker }));
    const second = await t.db.transaction((tx) => openAttempt(tx, input));
    expect(second.request).toMatchObject({ id: first.request.id, attempt: 2, state: 'open' });
    expect(second.task.stage).toBe('check');
    await t.db.transaction((tx) => decide(tx, { requestId: first.request.id, decision: 'send_back', reasonCode: 'other', note: 'Still not right', by: checker }));
    await expect(t.db.transaction((tx) => openAttempt(tx, input))).rejects.toThrow(/submitted 2 times/);
    expect(await listRequests(t.db, { view: 'all', actorId: checker, subjectType: 'test_subject' })).toHaveLength(1);
  });

  it('decisions are append-only', async () => {
    await expect(t.db.execute(sql`delete from review_decisions`)).rejects.toSatisfy((e: unknown) => /append-only/.test(String((e as { cause?: Error }).cause?.message)));
  });

  it('finds tasks to remind and to escalate', async () => {
    const r = await t.db.transaction((tx) => openAttempt(tx, { subjectType: 'test_subject', subjectId: randomUUID(), title: 'Waiting', workgroupId: null, submittedBy: maker }));
    const later = (h: number) => new Date(Date.now() + h * 3_600_000);
    expect((await slaDue(t.db, later(1))).remind.some((x) => x.t.id === r.task.id)).toBe(false);
    expect((await slaDue(t.db, later(5))).remind.some((x) => x.t.id === r.task.id)).toBe(true);
    expect((await slaDue(t.db, later(11))).escalate.some((x) => x.t.id === r.task.id)).toBe(true);
  });

  it('admins edit the rules within sane bounds', async () => {
    const d = await definitionFor(t.db, 'category_version');
    const base = { name: d.name, slaHours: 72, reminderHours: 24, maxAttempts: 4, reasonCodes: d.reasonCodes };
    await expect(updateDefinition({ db: t.db }, admin, d.id, { ...base, reminderHours: 72 })).rejects.toThrow(/less than the SLA/);
    await expect(updateDefinition({ db: t.db }, admin, d.id, { ...base, reasonCodes: d.reasonCodes.filter((r) => !r.for.includes('discard')) })).rejects.toThrow(/reason for discarding/);
    await updateDefinition({ db: t.db }, admin, d.id, { ...base, stageLabels: { approval: 'Final approval' } });
    const [row] = await t.db.select().from(reviewDefinitions).where(eq(reviewDefinitions.id, d.id));
    expect(row).toMatchObject({ slaHours: 72, maxAttempts: 4 });
    expect(row!.stages[0]!.label).toBe('Final approval');
  });
});
