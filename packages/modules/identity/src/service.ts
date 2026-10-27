import { and, asc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  ROLES,
  ROLE_KEYS,
  grantProblem,
  isRoleKey,
  type AppAbility,
  type Grant,
  type RoleKey,
} from '@orbita/authz';
import { likeEscape, recordAudit } from '@orbita/audit';
import { profiles, roleGrants, type Database, type DbOrTx, type Profile } from '@orbita/db';
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  preconditionFailed,
  type Actor,
  type RequestMeta,
} from '@orbita/domain';
import type { AuthDirectory, EmailLink, Mailer } from './ports';

export interface IdentityDeps {
  db: Database;
  auth: AuthDirectory;
  mailer: Mailer;
  /** e.g. https://orbita.inscapio.in, used to build email links */
  appUrl: string;
}

export interface Ctx {
  actor: Actor;
  ability: AppAbility;
  meta: RequestMeta;
}

// ---------------------------------------------------------------------------
// Schemas (shared with the API layer for validation and OpenAPI)

export const roleKeySchema = z.enum(ROLE_KEYS);
export const grantInputSchema = z.object({
  role: roleKeySchema,
  scopeType: z.enum(['global', 'workgroup', 'org', 'brand']).default('global'),
  scopeId: z.uuid().nullable().default(null),
});
export type GrantInput = z.infer<typeof grantInputSchema>;

export const inviteInputSchema = z.object({
  email: z.email().transform((e) => e.trim().toLowerCase()),
  fullName: z.string().trim().min(1, 'Name is required').max(120),
  kind: z.enum(['staff', 'seller']).default('staff'),
  roles: z.array(grantInputSchema).min(1, 'Pick at least one role').max(10),
});
export type InviteInput = z.input<typeof inviteInputSchema>;

export const userFilterSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['invited', 'active', 'deactivated']).optional(),
  role: roleKeySchema.optional(),
});
export type UserFilter = z.infer<typeof userFilterSchema>;

export interface GrantView {
  id: string;
  role: RoleKey;
  roleLabel: string;
  scopeType: Grant['scopeType'];
  scopeId: string | null;
  grantedAt: Date;
}

export interface UserView {
  id: string;
  email: string;
  fullName: string;
  kind: Profile['kind'];
  status: Profile['status'];
  isDemo: boolean;
  invitedAt: Date | null;
  activatedAt: Date | null;
  lastSeenAt: Date | null;
  createdAt: Date;
  grants: GrantView[];
}

// ---------------------------------------------------------------------------
// Session

export interface SessionData {
  profile: Profile;
  grants: Grant[];
}

/** Profile + active grants for the signed-in user. Null when there is no profile row. */
export async function loadSession(db: DbOrTx, userId: string): Promise<SessionData | null> {
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
  if (!profile) return null;
  const rows = await db
    .select()
    .from(roleGrants)
    .where(and(eq(roleGrants.userId, userId), isNull(roleGrants.revokedAt)));
  return {
    profile,
    grants: rows
      .filter((r) => isRoleKey(r.role))
      .map((r) => ({ role: r.role as RoleKey, scopeType: r.scopeType, scopeId: r.scopeId })),
  };
}

// ---------------------------------------------------------------------------
// Queries

async function grantsFor(db: DbOrTx, userIds: string[]): Promise<Map<string, GrantView[]>> {
  const map = new Map<string, GrantView[]>();
  if (userIds.length === 0) return map;
  const rows = await db
    .select()
    .from(roleGrants)
    .where(and(inArray(roleGrants.userId, userIds), isNull(roleGrants.revokedAt)))
    .orderBy(asc(roleGrants.grantedAt));
  for (const r of rows) {
    if (!isRoleKey(r.role)) continue;
    const list = map.get(r.userId) ?? [];
    list.push({
      id: r.id,
      role: r.role,
      roleLabel: ROLES[r.role].label,
      scopeType: r.scopeType,
      scopeId: r.scopeId,
      grantedAt: r.grantedAt,
    });
    map.set(r.userId, list);
  }
  return map;
}

const toView = (p: Profile, grants: GrantView[]): UserView => ({
  id: p.id,
  email: p.email,
  fullName: p.fullName,
  kind: p.kind,
  status: p.status,
  isDemo: p.isDemo,
  invitedAt: p.invitedAt,
  activatedAt: p.activatedAt,
  lastSeenAt: p.lastSeenAt,
  createdAt: p.createdAt,
  grants,
});

export async function listUsers(deps: Pick<IdentityDeps, 'db'>, ctx: Ctx, filter: UserFilter = {}) {
  if (!ctx.ability.can('read', 'User') || !ctx.ability.can('read', 'RoleGrant'))
    throw forbidden('You cannot view users.');
  const where = [];
  if (filter.q) {
    const q = `%${likeEscape(filter.q)}%`;
    where.push(or(ilike(profiles.email, q), ilike(profiles.fullName, q)));
  }
  if (filter.status) where.push(eq(profiles.status, filter.status));
  if (filter.role) {
    where.push(
      inArray(
        profiles.id,
        deps.db
          .select({ id: roleGrants.userId })
          .from(roleGrants)
          .where(and(eq(roleGrants.role, filter.role), isNull(roleGrants.revokedAt))),
      ),
    );
  }
  const rows = await deps.db
    .select()
    .from(profiles)
    .where(where.length ? and(...where) : undefined)
    .orderBy(asc(profiles.fullName), asc(profiles.email))
    .limit(500);
  const grants = await grantsFor(deps.db, rows.map((r) => r.id));
  return rows.map((p) => toView(p, grants.get(p.id) ?? []));
}

export async function getUser(deps: Pick<IdentityDeps, 'db'>, ctx: Ctx, userId: string) {
  if (!ctx.ability.can('read', 'User')) throw forbidden('You cannot view users.');
  const [p] = await deps.db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
  if (!p) throw notFound('User');
  const grants = await grantsFor(deps.db, [p.id]);
  return toView(p, grants.get(p.id) ?? []);
}

/** Active member count per role, for the Roles page. */
export async function roleMemberCounts(deps: Pick<IdentityDeps, 'db'>, ctx: Ctx) {
  if (!ctx.ability.can('read', 'RoleGrant')) throw forbidden('You cannot view roles.');
  const rows = await deps.db
    .select({ role: roleGrants.role, count: sql<number>`count(*)::int` })
    .from(roleGrants)
    .innerJoin(profiles, eq(profiles.id, roleGrants.userId))
    .where(and(isNull(roleGrants.revokedAt), sql`${profiles.status} <> 'deactivated'`))
    .groupBy(roleGrants.role);
  const counts = Object.fromEntries(ROLE_KEYS.map((k) => [k, 0])) as Record<RoleKey, number>;
  for (const r of rows) if (isRoleKey(r.role)) counts[r.role] = r.count;
  return counts;
}

// ---------------------------------------------------------------------------
// Commands

export function confirmUrl(appUrl: string, link: EmailLink, next: string): string {
  const u = new URL('/auth/confirm', appUrl);
  u.searchParams.set('token_hash', link.tokenHash);
  u.searchParams.set('type', link.type);
  u.searchParams.set('next', next);
  return u.toString();
}

export interface InviteResult {
  user: UserView;
  /** Present only when the email could not be sent, so the admin can share it another way. */
  manualLink: string | null;
}

export async function inviteUser(deps: IdentityDeps, ctx: Ctx, raw: InviteInput): Promise<InviteResult> {
  if (!ctx.ability.can('invite', 'User') || !ctx.ability.can('grant', 'RoleGrant'))
    throw forbidden('You cannot invite users.');
  const input = inviteInputSchema.parse(raw);

  // Validate the whole role set up front (including conflicts between the requested roles).
  const accepted: Grant[] = [];
  for (const g of input.roles) {
    const problem = grantProblem(g.role, g.scopeType, g.scopeId, accepted);
    if (problem) throw badRequest(problem);
    accepted.push(g);
  }

  const [existing] = await deps.db
    .select({ id: profiles.id })
    .from(profiles)
    .where(sql`lower(${profiles.email}) = ${input.email}`)
    .limit(1);
  if (existing) throw conflict('A user with this email already exists.');

  const { userId, link } = await deps.auth.invite(input.email, input.fullName);
  try {
    await deps.db.transaction(async (tx) => {
      const now = new Date();
      await tx.insert(profiles).values({
        id: userId,
        email: input.email,
        fullName: input.fullName,
        kind: input.kind,
        status: 'invited',
        invitedBy: ctx.actor.id,
        invitedAt: now,
      });
      await recordAudit(tx, ctx, {
        action: 'user.invited',
        subjectType: 'user',
        subjectId: userId,
        summary: `${ctx.actor.email} invited ${input.email}`,
        after: { email: input.email, fullName: input.fullName, kind: input.kind },
      });
      for (const g of accepted) {
        const [row] = await tx
          .insert(roleGrants)
          .values({ userId, role: g.role, scopeType: g.scopeType, scopeId: g.scopeId, grantedBy: ctx.actor.id })
          .returning();
        await recordAudit(tx, ctx, {
          action: 'role.granted',
          subjectType: 'user',
          subjectId: userId,
          summary: `${ctx.actor.email} granted ${ROLES[g.role].label} to ${input.email}`,
          after: { grantId: row!.id, role: g.role, scopeType: g.scopeType, scopeId: g.scopeId },
        });
      }
    });
  } catch (err) {
    await deps.auth.delete(userId).catch(() => {});
    throw err;
  }

  const url = confirmUrl(deps.appUrl, link, '/welcome');
  const { delivered } = await deps.mailer.sendInvite({
    to: input.email,
    inviteeName: input.fullName,
    inviterName: ctx.actor.fullName || ctx.actor.email,
    roleLabels: accepted.map((g) => ROLES[g.role].label),
    url,
  });
  return { user: await getUser(deps, ctx, userId), manualLink: delivered ? null : url };
}

export async function resendInvite(deps: IdentityDeps, ctx: Ctx, userId: string): Promise<InviteResult> {
  if (!ctx.ability.can('invite', 'User')) throw forbidden('You cannot invite users.');
  const user = await getUser(deps, ctx, userId);
  if (user.status !== 'invited') throw preconditionFailed('This user has already accepted their invite.');
  const link = await deps.auth.magicLink(user.email);
  const url = confirmUrl(deps.appUrl, link, '/welcome');
  const { delivered } = await deps.mailer.sendInvite({
    to: user.email,
    inviteeName: user.fullName,
    inviterName: ctx.actor.fullName || ctx.actor.email,
    roleLabels: user.grants.map((g) => g.roleLabel),
    url,
  });
  await recordAudit(deps.db, ctx, {
    action: 'user.invite_resent',
    subjectType: 'user',
    subjectId: userId,
    summary: `${ctx.actor.email} re-sent the invite to ${user.email}`,
  });
  return { user, manualLink: delivered ? null : url };
}

async function activePlatformAdminIds(db: DbOrTx): Promise<string[]> {
  const rows = await db
    .select({ id: roleGrants.userId })
    .from(roleGrants)
    .innerJoin(profiles, eq(profiles.id, roleGrants.userId))
    .where(
      and(
        eq(roleGrants.role, 'platform_admin'),
        isNull(roleGrants.revokedAt),
        sql`${profiles.status} <> 'deactivated'`,
      ),
    );
  return [...new Set(rows.map((r) => r.id))];
}

export async function grantRole(deps: Pick<IdentityDeps, 'db'>, ctx: Ctx, userId: string, raw: GrantInput) {
  if (!ctx.ability.can('grant', 'RoleGrant')) throw forbidden('You cannot grant roles.');
  const g = grantInputSchema.parse(raw);
  return deps.db.transaction(async (tx) => {
    const [p] = await tx.select().from(profiles).where(eq(profiles.id, userId)).for('update').limit(1);
    if (!p) throw notFound('User');
    if (p.status === 'deactivated') throw preconditionFailed('Reactivate the user before granting roles.');
    const held = await tx
      .select()
      .from(roleGrants)
      .where(and(eq(roleGrants.userId, userId), isNull(roleGrants.revokedAt)));
    const problem = grantProblem(
      g.role,
      g.scopeType,
      g.scopeId,
      held.filter((h) => isRoleKey(h.role)).map((h) => ({ role: h.role as RoleKey, scopeType: h.scopeType, scopeId: h.scopeId })),
    );
    if (problem) throw badRequest(problem);
    const [row] = await tx
      .insert(roleGrants)
      .values({ userId, role: g.role, scopeType: g.scopeType, scopeId: g.scopeId, grantedBy: ctx.actor.id })
      .returning();
    await recordAudit(tx, ctx, {
      action: 'role.granted',
      subjectType: 'user',
      subjectId: userId,
      summary: `${ctx.actor.email} granted ${ROLES[g.role].label} to ${p.email}`,
      after: { grantId: row!.id, role: g.role, scopeType: g.scopeType, scopeId: g.scopeId },
    });
    return row!;
  });
}

export async function revokeRole(deps: Pick<IdentityDeps, 'db'>, ctx: Ctx, userId: string, grantId: string) {
  if (!ctx.ability.can('revoke', 'RoleGrant')) throw forbidden('You cannot revoke roles.');
  return deps.db.transaction(async (tx) => {
    // Serialise admin changes so two admins cannot remove each other at the same time.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('orbita.platform_admins'))`);
    const [row] = await tx
      .select()
      .from(roleGrants)
      .where(and(eq(roleGrants.id, grantId), eq(roleGrants.userId, userId), isNull(roleGrants.revokedAt)))
      .limit(1);
    if (!row) throw notFound('Role grant');
    if (row.role === 'platform_admin') {
      const admins = await activePlatformAdminIds(tx);
      if (admins.length <= 1) throw preconditionFailed('You cannot remove the last platform admin.');
      if (userId === ctx.actor.id) throw preconditionFailed('Ask another platform admin to remove your admin role.');
    }
    const [p] = await tx.select({ email: profiles.email }).from(profiles).where(eq(profiles.id, userId));
    await tx
      .update(roleGrants)
      .set({ revokedAt: new Date(), revokedBy: ctx.actor.id })
      .where(eq(roleGrants.id, grantId));
    const label = isRoleKey(row.role) ? ROLES[row.role].label : row.role;
    await recordAudit(tx, ctx, {
      action: 'role.revoked',
      subjectType: 'user',
      subjectId: userId,
      summary: `${ctx.actor.email} revoked ${label} from ${p?.email ?? userId}`,
      before: { grantId, role: row.role, scopeType: row.scopeType, scopeId: row.scopeId },
    });
  });
}

export async function setUserActive(deps: IdentityDeps, ctx: Ctx, userId: string, active: boolean) {
  if (!ctx.ability.can('deactivate', 'User')) throw forbidden('You cannot change user status.');
  if (!active && userId === ctx.actor.id) throw preconditionFailed('You cannot deactivate yourself.');
  const before = await getUser(deps, ctx, userId);
  if (active && before.status !== 'deactivated') return before;
  if (!active && before.status === 'deactivated') return before;

  await deps.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('orbita.platform_admins'))`);
    if (!active && before.grants.some((g) => g.role === 'platform_admin')) {
      const admins = await activePlatformAdminIds(tx);
      if (admins.length <= 1) throw preconditionFailed('You cannot deactivate the last platform admin.');
    }
    const now = new Date();
    await tx
      .update(profiles)
      .set(
        active
          ? { status: before.activatedAt ? 'active' : 'invited', deactivatedAt: null, updatedAt: now }
          : { status: 'deactivated', deactivatedAt: now, updatedAt: now },
      )
      .where(eq(profiles.id, userId));
    await recordAudit(tx, ctx, {
      action: active ? 'user.reactivated' : 'user.deactivated',
      subjectType: 'user',
      subjectId: userId,
      summary: `${ctx.actor.email} ${active ? 'reactivated' : 'deactivated'} ${before.email}`,
      before: { status: before.status },
      after: { status: active ? (before.activatedAt ? 'active' : 'invited') : 'deactivated' },
    });
    // Block or unblock sign-in inside the transaction: if Supabase fails, the status change rolls back.
    await deps.auth.setBanned(userId, !active);
  });
  return getUser(deps, ctx, userId);
}

/** Called when an invited user sets their password for the first time. */
export async function completeInvite(
  deps: Pick<IdentityDeps, 'db'>,
  actor: Actor,
  meta: RequestMeta,
  input: { fullName: string },
) {
  const fullName = z.string().trim().min(1).max(120).parse(input.fullName);
  await deps.db.transaction(async (tx) => {
    const [p] = await tx.select().from(profiles).where(eq(profiles.id, actor.id)).limit(1);
    if (!p) throw notFound('Profile');
    if (p.status === 'deactivated') throw forbidden('This account is deactivated.');
    const now = new Date();
    await tx
      .update(profiles)
      .set({ fullName, status: 'active', activatedAt: p.activatedAt ?? now, lastSeenAt: now, updatedAt: now })
      .where(eq(profiles.id, actor.id));
    if (p.status === 'invited') {
      await recordAudit(tx, { actor, meta }, {
        action: 'user.activated',
        subjectType: 'user',
        subjectId: actor.id,
        summary: `${actor.email} accepted their invite`,
        before: { status: 'invited', fullName: p.fullName },
        after: { status: 'active', fullName },
      });
    }
  });
}

export async function recordSignIn(deps: Pick<IdentityDeps, 'db'>, actor: Actor, meta: RequestMeta, method: string) {
  await deps.db.transaction(async (tx) => {
    await tx.update(profiles).set({ lastSeenAt: new Date() }).where(eq(profiles.id, actor.id));
    await recordAudit(tx, { actor, meta }, {
      action: 'auth.signed_in',
      subjectType: 'user',
      subjectId: actor.id,
      summary: `${actor.email} signed in (${method})`,
      meta: { method },
    });
  });
}

// ---------------------------------------------------------------------------
// First-run setup

export const bootstrapInputSchema = z.object({
  admin: z.object({
    email: z.email().transform((e) => e.trim().toLowerCase()),
    fullName: z.string().trim().min(1).max(120),
    password: z.string().min(10, 'Use at least 10 characters'),
  }),
  demo: z
    .object({ password: z.string(), emailDomain: z.string().optional() })
    .nullable()
    .default(null),
});
export type BootstrapInput = z.input<typeof bootstrapInputSchema>;

export async function needsBootstrap(db: DbOrTx): Promise<boolean> {
  return (await activePlatformAdminIds(db)).length === 0;
}

/** Demo seller organisation ids, used as the scope of seller roles until R4 adds real organisations. */
export const DEMO_ORG_ID = '00000000-0000-4000-8000-0000000000d1';
export const DEMO_OEM_ORG_ID = '00000000-0000-4000-8000-0000000000d2';

export interface DemoAccount {
  /** email local part */
  slug: string;
  name: string;
  kind: 'staff' | 'seller';
  grant: Grant;
  purpose: string;
}

/**
 * The smallest team that can walk every flow end to end (the platform admin is the person
 * who ran setup). Auditor and seller staff exist as roles but are not seeded.
 */
export const DEMO_TEAM: readonly DemoAccount[] = [
  {
    slug: 'category-manager',
    name: 'Demo Category Manager',
    kind: 'staff',
    grant: { role: 'category_manager', scopeType: 'global', scopeId: null },
    purpose: 'Builds categories and submits versions for approval',
  },
  {
    slug: 'approver',
    name: 'Demo Approver',
    kind: 'staff',
    grant: { role: 'approver', scopeType: 'global', scopeId: null },
    purpose: 'Approves category versions and decides escalated cases',
  },
  {
    slug: 'reviewer',
    name: 'Demo Reviewer',
    kind: 'staff',
    grant: { role: 'reviewer', scopeType: 'global', scopeId: null },
    purpose: 'Reviews vendor assessments, brand requests and catalogs',
  },
  {
    slug: 'seller',
    name: 'Demo Seller (reseller)',
    kind: 'seller',
    grant: { role: 'seller_admin', scopeType: 'org', scopeId: DEMO_ORG_ID },
    purpose: 'Requests brands and lists catalogs as a reseller',
  },
  {
    slug: 'oem-seller',
    name: 'Demo OEM Seller',
    kind: 'seller',
    grant: { role: 'seller_admin', scopeType: 'org', scopeId: DEMO_OEM_ORG_ID },
    purpose: 'Owns a brand: lists its own catalogs and approves resellers (brand ownership arrives in R4)',
  },
];

export const demoPasswordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128)
  .regex(/[a-zA-Z]/, 'Include at least one letter')
  .regex(/[0-9]/, 'Include at least one number');

export const demoTeamInputSchema = z.object({
  password: demoPasswordSchema,
  emailDomain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'Enter a domain like example.com')
    .default('example.com'),
});
export type DemoTeamInput = z.input<typeof demoTeamInputSchema>;

/** Creates an active user with a password and one grant, audited, in one transaction. */
async function createActiveUser(
  deps: Pick<IdentityDeps, 'db' | 'auth'>,
  who: { actor: Actor | null; meta: RequestMeta },
  u: { email: string; password: string; fullName: string; kind: 'staff' | 'seller'; grant: Grant; isDemo: boolean },
): Promise<string> {
  const { userId } = await deps.auth.createWithPassword(u.email, u.password, u.fullName);
  try {
    await deps.db.transaction(async (tx) => {
      const now = new Date();
      await tx.insert(profiles).values({
        id: userId,
        email: u.email,
        fullName: u.fullName,
        kind: u.kind,
        status: 'active',
        isDemo: u.isDemo,
        invitedBy: who.actor?.id ?? null,
        invitedAt: now,
        activatedAt: now,
      });
      await tx.insert(roleGrants).values({ userId, ...u.grant, grantedBy: who.actor?.id ?? null });
      await recordAudit(tx, who, {
        action: 'user.seeded',
        subjectType: 'user',
        subjectId: userId,
        summary: `${who.actor ? who.actor.email : 'Setup'} created ${u.isDemo ? 'demo account ' : ''}${u.email} as ${ROLES[u.grant.role].label}`,
        after: { email: u.email, role: u.grant.role, scopeType: u.grant.scopeType, isDemo: u.isDemo },
      });
    });
  } catch (err) {
    await deps.auth.delete(userId).catch(() => {});
    throw err;
  }
  return userId;
}

async function createDemoTeam(
  deps: Pick<IdentityDeps, 'db' | 'auth'>,
  who: { actor: Actor | null; meta: RequestMeta },
  input: z.output<typeof demoTeamInputSchema>,
) {
  const created: { id: string; email: string; role: RoleKey; purpose: string }[] = [];
  try {
    for (const d of DEMO_TEAM) {
      const email = `${d.slug}@${input.emailDomain}`;
      const id = await createActiveUser(deps, who, {
        email,
        password: input.password,
        fullName: d.name,
        kind: d.kind,
        grant: d.grant,
        isDemo: true,
      });
      created.push({ id, email, role: d.grant.role, purpose: d.purpose });
    }
  } catch (err) {
    for (const c of created.reverse()) await deps.auth.delete(c.id).catch(() => {});
    throw err;
  }
  return created.map(({ email, role, purpose }) => ({ email, role, purpose }));
}

/**
 * Creates the first platform admin (and optionally the demo team).
 * Refuses to run once any platform admin exists.
 */
export async function bootstrapPlatform(
  deps: Pick<IdentityDeps, 'db' | 'auth'>,
  meta: RequestMeta,
  raw: BootstrapInput,
): Promise<{ adminId: string; demoUsers: { email: string; role: RoleKey; purpose: string }[] }> {
  const input = bootstrapInputSchema.parse(raw);
  if (!(await needsBootstrap(deps.db))) throw preconditionFailed('Setup has already been completed.');
  const who = { actor: null, meta };
  const adminId = await createActiveUser(deps, who, {
    email: input.admin.email,
    password: input.admin.password,
    fullName: input.admin.fullName,
    kind: 'staff',
    grant: { role: 'platform_admin', scopeType: 'global', scopeId: null },
    isDemo: false,
  });
  if (!input.demo) return { adminId, demoUsers: [] };
  try {
    const demo = demoTeamInputSchema.parse(input.demo);
    return { adminId, demoUsers: await createDemoTeam(deps, who, demo) };
  } catch (err) {
    await deps.auth.delete(adminId).catch(() => {});
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Demo accounts (admin tools)

async function requireDemoUser(db: DbOrTx, userId: string) {
  const [p] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
  if (!p) throw notFound('User');
  if (!p.isDemo) throw forbidden('Passwords can only be set for demo accounts. Real users reset their own.');
  return p;
}

/** Sets the password of one demo account. Real accounts are never touched. */
export async function setDemoPassword(deps: IdentityDeps, ctx: Ctx, userId: string, password: string) {
  if (!ctx.ability.can('update', 'User')) throw forbidden('You cannot manage users.');
  const pw = demoPasswordSchema.parse(password);
  const p = await requireDemoUser(deps.db, userId);
  await deps.auth.setPassword(userId, pw);
  await recordAudit(deps.db, ctx, {
    action: 'user.password_set',
    subjectType: 'user',
    subjectId: userId,
    summary: `${ctx.actor.email} set a new password for demo account ${p.email}`,
  });
}

/** Sets one password on every demo account. Returns how many were changed. */
export async function setAllDemoPasswords(deps: IdentityDeps, ctx: Ctx, password: string): Promise<number> {
  if (!ctx.ability.can('update', 'User')) throw forbidden('You cannot manage users.');
  const pw = demoPasswordSchema.parse(password);
  const demo = await deps.db.select().from(profiles).where(eq(profiles.isDemo, true));
  for (const p of demo) {
    await deps.auth.setPassword(p.id, pw);
    await recordAudit(deps.db, ctx, {
      action: 'user.password_set',
      subjectType: 'user',
      subjectId: p.id,
      summary: `${ctx.actor.email} set a new password for demo account ${p.email}`,
    });
  }
  return demo.length;
}

/**
 * Removes every demo account and creates the current demo team. Real accounts are untouched;
 * the audit trail of removed accounts is kept.
 */
export async function rebuildDemoTeam(deps: IdentityDeps, ctx: Ctx, raw: DemoTeamInput) {
  if (!ctx.ability.can('invite', 'User') || !ctx.ability.can('deactivate', 'User') || !ctx.ability.can('grant', 'RoleGrant'))
    throw forbidden('You cannot manage demo accounts.');
  const input = demoTeamInputSchema.parse(raw);

  const wanted = DEMO_TEAM.map((d) => `${d.slug}@${input.emailDomain}`);
  const clash = await deps.db
    .select({ email: profiles.email })
    .from(profiles)
    .where(and(inArray(sql`lower(${profiles.email})`, wanted), eq(profiles.isDemo, false)));
  if (clash.length) throw conflict(`A real account already uses ${clash[0]!.email}. Pick another demo email domain.`);

  const old = await deps.db.select().from(profiles).where(eq(profiles.isDemo, true));
  for (const p of old) {
    await recordAudit(deps.db, ctx, {
      action: 'user.demo_removed',
      subjectType: 'user',
      subjectId: p.id,
      summary: `${ctx.actor.email} removed demo account ${p.email}`,
      before: { email: p.email, fullName: p.fullName },
    });
    await deps.auth.delete(p.id); // cascades to the profile and its grants
  }
  return createDemoTeam(deps, ctx, input);
}
