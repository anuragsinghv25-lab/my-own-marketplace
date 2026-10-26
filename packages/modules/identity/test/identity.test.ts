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
    async setBanned(id, b) {
      if (b) banned.add(id);
      else banned.delete(id);
    },
    async delete(id) {
      deleted.push(id);
      await db().execute(sql`delete from auth.users where id = ${id}`);
    },
  };
  return { auth, banned, deleted };
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

  it('bootstraps the first admin and one demo user per assignable role', async () => {
    const r = await bootstrapPlatform(deps, meta, {
      admin: { email: 'Admin@Example.com', fullName: 'Ada Admin', password: 'correct-horse-1' },
      demo: { password: 'demo-password-1', emailDomain: 'example.com' },
    });
    expect(r.demoUsers).toHaveLength(16); // 18 roles − platform_admin − brand_owner (derived)
    expect(r.demoUsers.map((u) => u.email)).toContain('category-checker@example.com');
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

  it('invites a category checker: profile, grant, audit and email in one go', async () => {
    const r = await inviteUser(deps, admin, {
      email: 'Checker.One@example.com',
      fullName: 'Chandra Checker',
      roles: [{ role: 'category_checker', scopeType: 'global', scopeId: null }],
    });
    expect(r.manualLink).toBeNull();
    expect(r.user.status).toBe('invited');
    expect(r.user.email).toBe('checker.one@example.com');
    expect(r.user.grants.map((g) => g.role)).toEqual(['category_checker']);

    const email = mail.sent.at(-1)!;
    expect(email.to).toBe('checker.one@example.com');
    expect(email.roleLabels).toEqual(['Category checker']);
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
      roles: [{ role: 'brand_specialist', scopeType: 'global', scopeId: null }],
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
        roles: [{ role: 'category_drafter', scopeType: 'global', scopeId: null }],
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
          { role: 'template_manager', scopeType: 'global', scopeId: null },
        ],
      }),
    ).rejects.toThrow(/separation of duties/);
  });

  it('only platform admins can invite', async () => {
    const [checker] = await listUsers(deps, admin, { q: 'category-checker@' });
    const checkerCtx = await ctxFor(checker!.id);
    await expect(
      inviteUser(deps, checkerCtx, {
        email: 'nope@example.com',
        fullName: 'Nope',
        roles: [{ role: 'category_drafter', scopeType: 'global', scopeId: null }],
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
    await grantRole(deps, admin, u!.id, { role: 'template_manager', scopeType: 'global', scopeId: null });
    let s = await loadSession(t.db, u!.id);
    expect(s!.grants.map((g) => g.role).sort()).toEqual(['category_checker', 'template_manager']);

    await expect(
      grantRole(deps, admin, u!.id, { role: 'auditor', scopeType: 'global', scopeId: null }),
    ).rejects.toThrow(/separation of duties/);
    await expect(
      grantRole(deps, admin, u!.id, { role: 'template_manager', scopeType: 'global', scopeId: null }),
    ).rejects.toThrow(/already has/);

    const tm = (await getUser(deps, admin, u!.id)).grants.find((g) => g.role === 'template_manager')!;
    await revokeRole(deps, admin, u!.id, tm.id);
    s = await loadSession(t.db, u!.id);
    expect(s!.grants.map((g) => g.role)).toEqual(['category_checker']);

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
      grantRole(deps, admin, u!.id, { role: 'category_drafter', scopeType: 'global', scopeId: null }),
    ).rejects.toThrow(/Reactivate/);
    const on = await setUserActive(deps, admin, u!.id, true);
    expect(on.status).toBe('active');
    expect(authFake.banned.has(u!.id)).toBe(false);
  });

  it('rolls back the status change if Supabase fails', async () => {
    const [u] = await listUsers(deps, admin, { q: 'brand-specialist@' });
    const failing = { ...deps, auth: { ...deps.auth, setBanned: async () => Promise.reject(new Error('supabase down')) } };
    await expect(setUserActive(failing, admin, u!.id, false)).rejects.toThrow('supabase down');
    expect((await getUser(deps, admin, u!.id)).status).toBe('active');
  });

  it('counts members per role', async () => {
    const counts = await roleMemberCounts(deps, admin);
    expect(counts.platform_admin).toBe(1);
    expect(counts.category_checker).toBe(2); // demo + Chandra
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
});
