import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { defineAbilityFor, type Grant } from '@orbita/authz';
import { listAuditEvents } from '@orbita/audit';
import type { Database } from '@orbita/db';
import { freshTestDb, testDatabaseUrl } from '@orbita/db/test-support';
import { isAppError } from '@orbita/domain';
import {
  bootstrapPlatform,
  completeInvite,
  getUser,
  grantRole,
  inviteUser,
  listUsers,
  loadSession,
  needsBootstrap,
  resendInvite,
  revokeRole,
  roleMemberCounts,
  rebuildDemoTeam,
  setAllDemoPasswords,
  setDemoPassword,
  setUserActive,
  type AuthDirectory,
  type Ctx,
  type IdentityDeps,
  type InviteEmail,
  type Mailer,
} from '../src';

/** In-memory Supabase stand-in that also writes the auth.users stub row (for the FK). */
function fakeAuth(db: () => Database) {
  const banned = new Set<string>();
  const deleted: string[] = [];
  const passwords = new Map<string, string>();
  const auth: AuthDirectory = {
    async invite(email) {
      const id = randomUUID();
      await db().execute(sql`insert into auth.users (id, email) values (${id}, ${email})`);
      return { userId: id, link: { tokenHash: `hash-${id}`, type: 'invite' } };
    },
    async magicLink(email) {
      return { tokenHash: `magic-${email}`, type: 'magiclink' };
    },
    async createWithPassword(email) {
      const id = randomUUID();
      await db().execute(sql`insert into auth.users (id, email) values (${id}, ${email})`);
      return { userId: id };
    },
    async setPassword(id, pw) {
      passwords.set(id, pw);
    },
    async setBanned(id, b) {
      if (b) banned.add(id);
      else banned.delete(id);
    },
    async delete(id) {
      deleted.push(id);
      await db().execute(sql`delete from auth.users where id = ${id}`);
    },
  };
  return { auth, banned, deleted, passwords };
}

function fakeMailer(delivered: boolean) {
  const sent: InviteEmail[] = [];
  const mailer: Mailer = {
    async sendInvite(e) {
      sent.push(e);
      return { delivered };
    },
  };
  return { mailer, sent };
}

const meta = { requestId: 'req_test' };

describe.skipIf(!testDatabaseUrl)('identity module (Postgres)', () => {
  let t: Awaited<ReturnType<typeof freshTestDb>>;
  let deps: IdentityDeps;
  let authFake: ReturnType<typeof fakeAuth>;
  let mail: ReturnType<typeof fakeMailer>;
  let admin: Ctx;

  async function ctxFor(userId: string): Promise<Ctx> {
    const s = await loadSession(t.db, userId);
    if (!s) throw new Error('no session');
    return {
      actor: { id: userId, email: s.profile.email, fullName: s.profile.fullName },
      ability: defineAbilityFor({ userId, grants: s.grants }),
      meta,
    };
  }

  beforeAll(async () => {
    t = await freshTestDb('identity');
    authFake = fakeAuth(() => t.db);
    mail = fakeMailer(true);
    deps = { db: t.db, auth: authFake.auth, mailer: mail.mailer, appUrl: 'https://orbita.example.com' };
  });

  afterAll(async () => {
    await t?.drop();
  });

  it('starts empty and needs bootstrap', async () => {
    expect(await needsBootstrap(t.db)).toBe(true);
  });

  it('bootstraps the first admin and the five-person demo team', async () => {
    const r = await bootstrapPlatform(deps, meta, {
      admin: { email: 'Admin@Example.com', fullName: 'Ada Admin', password: 'correct-horse-1' },
      demo: { password: 'demo-password-1', emailDomain: 'example.com' },
    });
    expect(r.demoUsers.map((u) => u.role)).toEqual(['category_manager', 'approver', 'reviewer', 'seller_admin', 'seller_admin']);
    expect(r.demoUsers.map((u) => u.email)).toContain('category-manager@example.com');
    expect(await needsBootstrap(t.db)).toBe(false);
    admin = await ctxFor(r.adminId);
    expect(admin.actor.email).toBe('admin@example.com');
    expect(admin.ability.can('invite', 'User')).toBe(true);
  });

  it('refuses a second bootstrap', async () => {
    await expect(
      bootstrapPlatform(deps, meta, { admin: { email: 'x@example.com', fullName: 'X', password: 'correct-horse-1' } }),
    ).rejects.toThrow(/already been completed/);
  });

  it('invites a category manager: profile, grant, audit and email in one go', async () => {
    const r = await inviteUser(deps, admin, {
      email: 'Checker.One@example.com',
      fullName: 'Chandra Checker',
      roles: [{ role: 'category_manager', scopeType: 'global', scopeId: null }],
    });
    expect(r.manualLink).toBeNull();
    expect(r.user.status).toBe('invited');
    expect(r.user.email).toBe('checker.one@example.com');
    expect(r.user.grants.map((g) => g.role)).toEqual(['category_manager']);

    const email = mail.sent.at(-1)!;
    expect(email.to).toBe('checker.one@example.com');
    expect(email.roleLabels).toEqual(['Category manager']);
    expect(email.url).toMatch(/^https:\/\/orbita\.example\.com\/auth\/confirm\?token_hash=hash-.+&type=invite&next=%2Fwelcome$/);

    const audit = await listAuditEvents(t.db, admin.ability, { subjectId: r.user.id });
    expect(audit.items.map((e) => e.action).sort()).toEqual(['role.granted', 'user.invited']);
    expect(audit.items.every((e) => e.actorId === admin.actor.id && e.requestId === 'req_test')).toBe(true);
  });

  it('returns a manual link when email is not configured', async () => {
    const noMail = { ...deps, mailer: fakeMailer(false).mailer };
    const r = await inviteUser(noMail, admin, {
      email: 'no-mail@example.com',
      fullName: 'No Mail',
      roles: [{ role: 'reviewer', scopeType: 'global', scopeId: null }],
    });
    expect(r.manualLink).toMatch(/\/auth\/confirm\?/);
    const resent = await resendInvite(noMail, admin, r.user.id);
    expect(resent.manualLink).toMatch(/type=magiclink/);
  });

  it('rejects duplicate emails (case-insensitive)', async () => {
    await expect(
      inviteUser(deps, admin, {
        email: 'CHECKER.ONE@example.com',
        fullName: 'Dup',
        roles: [{ role: 'category_manager', scopeType: 'global', scopeId: null }],
      }),
    ).rejects.toThrow(/already exists/);
  });

  it('enforces separation of duties when inviting', async () => {
    await expect(
      inviteUser(deps, admin, {
        email: 'sod@example.com',
        fullName: 'Sod',
        roles: [
          { role: 'auditor', scopeType: 'global', scopeId: null },
          { role: 'approver', scopeType: 'global', scopeId: null },
        ],
      }),
    ).rejects.toThrow(/separation of duties/);
  });

  it('only platform admins can invite', async () => {
    const [checker] = await listUsers(deps, admin, { q: 'category-manager@' });
    const checkerCtx = await ctxFor(checker!.id);
    await expect(
      inviteUser(deps, checkerCtx, {
        email: 'nope@example.com',
        fullName: 'Nope',
        roles: [{ role: 'category_manager', scopeType: 'global', scopeId: null }],
      }),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'FORBIDDEN');
    await expect(listUsers(deps, checkerCtx)).rejects.toSatisfy((e) => isAppError(e) && e.code === 'FORBIDDEN');
  });

  it('activates an invited user when they accept', async () => {
    const [u] = await listUsers(deps, admin, { q: 'checker.one' });
    await completeInvite(deps, { id: u!.id, email: u!.email, fullName: '' }, meta, { fullName: 'Chandra C.' });
    const after = await getUser(deps, admin, u!.id);
    expect(after.status).toBe('active');
    expect(after.fullName).toBe('Chandra C.');
    expect(after.activatedAt).not.toBeNull();
  });

  it('grants and revokes roles; changes are visible on the next session load', async () => {
    const [u] = await listUsers(deps, admin, { q: 'checker.one' });
    await grantRole(deps, admin, u!.id, { role: 'approver', scopeType: 'global', scopeId: null });
    let s = await loadSession(t.db, u!.id);
    expect(s!.grants.map((g) => g.role).sort()).toEqual(['approver', 'category_manager']);

    await expect(
      grantRole(deps, admin, u!.id, { role: 'auditor', scopeType: 'global', scopeId: null }),
    ).rejects.toThrow(/separation of duties/);
    await expect(
      grantRole(deps, admin, u!.id, { role: 'approver', scopeType: 'global', scopeId: null }),
    ).rejects.toThrow(/already has/);

    const tm = (await getUser(deps, admin, u!.id)).grants.find((g) => g.role === 'approver')!;
    await revokeRole(deps, admin, u!.id, tm.id);
    s = await loadSession(t.db, u!.id);
    expect(s!.grants.map((g) => g.role)).toEqual(['category_manager']);

    const audit = await listAuditEvents(t.db, admin.ability, { subjectId: u!.id, action: 'role.' });
    expect(audit.items.map((e) => e.action)).toEqual(['role.revoked', 'role.granted', 'role.granted']);
  });

  it('protects the last platform admin', async () => {
    const adminGrant = (await getUser(deps, admin, admin.actor.id)).grants[0]!;
    await expect(revokeRole(deps, admin, admin.actor.id, adminGrant.id)).rejects.toThrow(/last platform admin/);
    await expect(setUserActive(deps, admin, admin.actor.id, false)).rejects.toThrow(/yourself/);
  });

  it('deactivates and reactivates, blocking sign-in at Supabase', async () => {
    const [u] = await listUsers(deps, admin, { q: 'checker.one' });
    const off = await setUserActive(deps, admin, u!.id, false);
    expect(off.status).toBe('deactivated');
    expect(authFake.banned.has(u!.id)).toBe(true);
    await expect(
      grantRole(deps, admin, u!.id, { role: 'category_manager', scopeType: 'global', scopeId: null }),
    ).rejects.toThrow(/Reactivate/);
    const on = await setUserActive(deps, admin, u!.id, true);
    expect(on.status).toBe('active');
    expect(authFake.banned.has(u!.id)).toBe(false);
  });

  it('rolls back the status change if Supabase fails', async () => {
    const [u] = await listUsers(deps, admin, { q: 'reviewer@' });
    const failing = { ...deps, auth: { ...deps.auth, setBanned: async () => Promise.reject(new Error('supabase down')) } };
    await expect(setUserActive(failing, admin, u!.id, false)).rejects.toThrow('supabase down');
    expect((await getUser(deps, admin, u!.id)).status).toBe('active');
  });

  it('counts members per role', async () => {
    const counts = await roleMemberCounts(deps, admin);
    expect(counts.platform_admin).toBe(1);
    expect(counts.category_manager).toBe(2); // demo + Chandra
    expect(counts.brand_owner).toBe(0);
  });

  it('keeps the audit trail append-only', async () => {
    // Drizzle wraps the Postgres error; the trigger's message is on the cause.
    const pgMessage = async (p: Promise<unknown>) =>
      p.then(
        () => 'no error',
        (e: Error & { cause?: Error }) => e.cause?.message ?? e.message,
      );
    expect(await pgMessage(t.db.execute(sql`update audit_events set summary = 'tampered'`))).toMatch(/append-only/);
    expect(await pgMessage(t.db.execute(sql`delete from audit_events`))).toMatch(/append-only/);
    expect(await pgMessage(t.db.execute(sql`truncate audit_events`))).toMatch(/append-only/);
  });

  it('has row level security on every app table', async () => {
    const rows = await t.db.execute<{ relname: string; relrowsecurity: boolean }>(
      sql`select relname, relrowsecurity from pg_class where relname in ('profiles','role_grants','audit_events')`,
    );
    expect(rows.length).toBe(3);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
  });

  it('filters the audit log and hides it from non-auditors', async () => {
    const page = await listAuditEvents(t.db, admin.ability, { action: 'user.', limit: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).not.toBeNull();
    const next = await listAuditEvents(t.db, admin.ability, { action: 'user.', limit: 2, before: page.nextCursor! });
    expect(next.items[0]!.id).toBeLessThan(page.items[1]!.id);

    const byActor = await listAuditEvents(t.db, admin.ability, { actor: 'admin@' });
    expect(byActor.items.length).toBeGreaterThan(0);
    expect(byActor.items.every((e) => e.actorEmail === 'admin@example.com')).toBe(true);

    const wildcard = await listAuditEvents(t.db, admin.ability, { q: '%' });
    expect(wildcard.items).toHaveLength(0); // LIKE wildcards are escaped

    const noGrants: Grant[] = [];
    const nobody = defineAbilityFor({ userId: randomUUID(), grants: noGrants });
    await expect(listAuditEvents(t.db, nobody)).rejects.toSatisfy((e) => isAppError(e) && e.code === 'FORBIDDEN');
  });

  it('marks only demo accounts as demo', async () => {
    const all = await listUsers(deps, admin);
    expect(all.filter((u) => u.isDemo).map((u) => u.email).sort()).toEqual([
      'approver@example.com',
      'category-manager@example.com',
      'oem-seller@example.com',
      'reviewer@example.com',
      'seller@example.com',
    ]);
    expect(all.find((u) => u.email === 'admin@example.com')!.isDemo).toBe(false);
  });

  it('lets an admin set a demo password, never a real user password', async () => {
    const [demo] = await listUsers(deps, admin, { q: 'reviewer@' });
    await setDemoPassword(deps, admin, demo!.id, 'NewDemoPass99');
    expect(authFake.passwords.get(demo!.id)).toBe('NewDemoPass99');
    const [real] = await listUsers(deps, admin, { q: 'checker.one' });
    await expect(setDemoPassword(deps, admin, real!.id, 'NewDemoPass99')).rejects.toThrow(/only be set for demo/);
    await expect(setDemoPassword(deps, admin, demo!.id, 'short')).rejects.toThrow();
    const audit = await listAuditEvents(t.db, admin.ability, { subjectId: demo!.id, action: 'user.password_set' });
    expect(audit.items).toHaveLength(1);
    expect(JSON.stringify(audit.items[0])).not.toContain('NewDemoPass99');
  });

  it('only platform admins manage demo accounts', async () => {
    const [cm] = await listUsers(deps, admin, { q: 'category-manager@' });
    const cmCtx = await ctxFor(cm!.id);
    await expect(setAllDemoPasswords(deps, cmCtx, 'NewDemoPass99')).rejects.toSatisfy((e) => isAppError(e) && e.code === 'FORBIDDEN');
    await expect(rebuildDemoTeam(deps, cmCtx, { password: 'NewDemoPass99' })).rejects.toSatisfy((e) => isAppError(e) && e.code === 'FORBIDDEN');
  });

  it('sets one password on every demo account', async () => {
    expect(await setAllDemoPasswords(deps, admin, 'TeamPass2026')).toBe(5);
    const demo = (await listUsers(deps, admin)).filter((u) => u.isDemo);
    expect(demo.every((u) => authFake.passwords.get(u.id) === 'TeamPass2026')).toBe(true);
  });

  it('rebuilds the demo team without touching real accounts', async () => {
    const before = await listUsers(deps, admin);
    const realBefore = before.filter((u) => !u.isDemo).map((u) => u.id).sort();
    const oldDemoIds = before.filter((u) => u.isDemo).map((u) => u.id);

    await expect(rebuildDemoTeam(deps, admin, { password: 'Rebuilt12345', emailDomain: 'example.com' })).resolves.toHaveLength(5);
    const after = await listUsers(deps, admin);
    expect(after.filter((u) => !u.isDemo).map((u) => u.id).sort()).toEqual(realBefore);
    const demo = after.filter((u) => u.isDemo);
    expect(demo).toHaveLength(5);
    expect(demo.some((u) => oldDemoIds.includes(u.id))).toBe(false);
    expect(oldDemoIds.every((id) => authFake.deleted.includes(id))).toBe(true);
    const removed = await listAuditEvents(t.db, admin.ability, { action: 'user.demo_removed' });
    expect(removed.items).toHaveLength(5); // trail of the removed accounts is kept

    // a real account on a demo address blocks the rebuild before anything is deleted
    await inviteUser(deps, admin, {
      email: 'approver@demo.test',
      fullName: 'Real Approver',
      roles: [{ role: 'approver', scopeType: 'global', scopeId: null }],
    });
    await expect(rebuildDemoTeam(deps, admin, { password: 'Rebuilt12345', emailDomain: 'demo.test' })).rejects.toThrow(/real account/);
    expect((await listUsers(deps, admin)).filter((u) => u.isDemo)).toHaveLength(5);
  });
});
