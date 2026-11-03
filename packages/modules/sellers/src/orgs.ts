import { and, asc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { recordAudit } from '@orbita/audit';
import { ROLES } from '@orbita/authz';
import {
  brands,
  divisionMembers,
  divisions,
  organisations,
  orgAddresses,
  profiles,
  roleGrants,
  signupAttempts,
  type Database,
  type DbOrTx,
  type Organisation,
} from '@orbita/db';
import { badRequest, conflict, forbidden, notFound, preconditionFailed, type RequestMeta } from '@orbita/domain';
import { confirmUrl, type AuthDirectory, type Mailer } from '@orbita/identity';
import { activeRequestFor } from '@orbita/reviews';
import { CASE_SPECS, decideCase, respondCase, submitCase, type CaseDecisionInput, type CaseStatus } from './cases';
import type { Ctx } from './context';
import { orgSubject } from './files';
import { GST_STATES, gstinProblem, normalizeGstin, normalizePhone, panOf, PINCODE_RE } from './india';

export interface SignupMailer {
  sendSignupVerification(e: { to: string; name: string; orgName: string; url: string }): Promise<{ delivered: boolean }>;
}

export interface SellerDeps {
  db: Database;
  auth: Pick<AuthDirectory, 'invite' | 'delete'>;
  mailer: SignupMailer & Pick<Mailer, 'sendInvite'>;
  appUrl: string;
}

const phone = z.string().trim().transform((v, c) => {
  const p = normalizePhone(v);
  if (!p) c.addIssue({ code: 'custom', message: 'Enter a 10-digit Indian phone number.' });
  return p ?? '';
});
const gstin = z.string().transform((v, c) => {
  const p = gstinProblem(v);
  if (p) c.addIssue({ code: 'custom', message: p });
  return normalizeGstin(v);
});
const addressInput = z.object({
  line1: z.string().trim().min(3, 'Enter the street address.').max(200),
  line2: z.string().trim().max(200).default(''),
  city: z.string().trim().min(2, 'Enter the city.').max(80),
  pincode: z.string().trim().regex(PINCODE_RE, 'A PIN code has 6 digits and does not start with 0.'),
  stateCode: z.string().refine((s) => !!GST_STATES[s], 'Pick a state.').optional(),
});

export const BUSINESS_TYPES = ['proprietorship', 'partnership', 'llp', 'private_limited', 'public_limited', 'other'] as const;

export const signupInput = z.object({
  legalName: z.string().trim().min(2, 'Enter the legal name on the GST certificate.').max(200),
  tradeName: z.string().trim().max(200).default(''),
  businessType: z.enum(BUSINESS_TYPES),
  gstin,
  contactName: z.string().trim().min(2, 'Enter your name.').max(120),
  email: z.email('Enter a valid email address.').transform((e) => e.toLowerCase().trim()),
  phone,
  address: addressInput,
  acceptTerms: z.literal(true, { message: 'Accept the seller terms to continue.' }),
  /** a field real people never see; bots fill it */
  website2: z.string().max(0, 'Something went wrong. Please try again.').optional(),
});
export type SignupInput = z.input<typeof signupInput>;

const LIMITS = { perIpPerHour: 5, perEmailPerDay: 3 };

/**
 * Self sign-up. Creates the organisation (pending), its seller admin (invited) and sends the email
 * verification link, which leads to setting a password. Verification by a reviewer starts once the
 * email is confirmed (`startOrgVerification`). Supabase's public sign-up stays off: the server creates
 * the account through the admin API, so nothing here needs a paid plan.
 */
export async function signUpSeller(deps: SellerDeps, meta: RequestMeta, raw: SignupInput) {
  const ip = meta.ip ?? null;
  const parsed = signupInput.safeParse(raw);
  const email = typeof raw.email === 'string' ? raw.email.toLowerCase().trim() : '';
  const hourAgo = new Date(Date.now() - 3_600_000);
  const dayAgo = new Date(Date.now() - 86_400_000);
  const [{ n: byIp } = { n: 0 }] = ip ? await deps.db.select({ n: sql<number>`count(*)::int` }).from(signupAttempts).where(and(eq(signupAttempts.ip, ip), gt(signupAttempts.createdAt, hourAgo))) : [];
  const [{ n: byEmail } = { n: 0 }] = email ? await deps.db.select({ n: sql<number>`count(*)::int` }).from(signupAttempts).where(and(eq(signupAttempts.email, email), gt(signupAttempts.createdAt, dayAgo))) : [];
  if (byIp >= LIMITS.perIpPerHour || byEmail >= LIMITS.perEmailPerDay) throw preconditionFailed('Too many sign-up attempts. Please try again later.');
  if (!parsed.success) {
    await deps.db.insert(signupAttempts).values({ ip, email: email || 'invalid', ok: false });
    throw parsed.error;
  }
  const input = parsed.data;
  const stateCode = input.gstin.slice(0, 2);
  const [dupOrg] = await deps.db.select({ id: organisations.id }).from(organisations).where(eq(organisations.gstin, input.gstin));
  const [dupUser] = await deps.db.select({ id: profiles.id }).from(profiles).where(sql`lower(${profiles.email}) = ${input.email}`);
  if (dupOrg || dupUser) {
    await deps.db.insert(signupAttempts).values({ ip, email: input.email, ok: false });
    throw conflict(dupOrg ? 'This GSTIN is already registered. Ask that organisation’s admin to add you as a user.' : 'An account with this email already exists. Sign in instead.');
  }
  const { userId, link } = await deps.auth.invite(input.email, input.contactName);
  let org: Organisation;
  try {
    org = await deps.db.transaction(async (tx) => {
      const [o] = await tx
        .insert(organisations)
        .values({
          legalName: input.legalName,
          tradeName: input.tradeName,
          businessType: input.businessType,
          gstin: input.gstin,
          pan: panOf(input.gstin),
          stateCode,
          contactName: input.contactName,
          contactEmail: input.email,
          contactPhone: input.phone,
          termsAcceptedAt: new Date(),
          createdBy: userId,
        })
        .returning();
      await tx.insert(orgAddresses).values({ orgId: o!.id, kind: 'registered', label: 'Registered office', line1: input.address.line1, line2: input.address.line2, city: input.address.city, stateCode, pincode: input.address.pincode });
      await tx.insert(profiles).values({ id: userId, email: input.email, fullName: input.contactName, kind: 'seller', status: 'invited', invitedAt: new Date() });
      await tx.insert(roleGrants).values({ userId, role: 'seller_admin', scopeType: 'org', scopeId: o!.id });
      await tx.insert(signupAttempts).values({ ip, email: input.email, ok: true });
      await recordAudit(tx, { actor: { id: userId, email: input.email }, meta }, {
        action: 'seller.signed_up',
        subjectType: 'seller_org',
        subjectId: o!.id,
        summary: `${input.email} registered ${input.legalName} (GSTIN ${input.gstin})`,
        after: { legalName: input.legalName, gstin: input.gstin, businessType: input.businessType },
      });
      return o!;
    });
  } catch (err) {
    await deps.auth.delete(userId).catch(() => {});
    throw err;
  }
  const url = confirmUrl(deps.appUrl, link, '/welcome');
  const { delivered } = await deps.mailer.sendSignupVerification({ to: input.email, name: input.contactName, orgName: input.legalName, url });
  return { orgId: org.id, email: input.email, delivered, manualLink: delivered ? null : url };
}

/** After the seller admin confirms their email: open seller verification once. */
export async function startOrgVerification(db: Database, actor: { id: string; email: string; fullName: string }, meta: RequestMeta) {
  const orgIds = (await db.select({ id: roleGrants.scopeId }).from(roleGrants).where(and(eq(roleGrants.userId, actor.id), eq(roleGrants.role, 'seller_admin'), eq(roleGrants.scopeType, 'org'), isNull(roleGrants.revokedAt)))).map((r) => r.id!);
  if (!orgIds.length) return null;
  const pending = await db.select().from(organisations).where(and(inArray(organisations.id, orgIds), eq(organisations.status, 'pending')));
  for (const o of pending) {
    if (await activeRequestFor(db, 'seller_org', o.id)) continue;
    await db.transaction(async (tx) => {
      // the person who registered is a seller; only the review machinery needs their identity here
      const ctx = { actor, ability: { can: () => true } as never, meta };
      await submitCase(tx, ctx, CASE_SPECS.seller_org, { subjectId: o.id, orgId: o.id, title: o.legalName });
    });
  }
  return pending.length;
}

// ---------------------------------------------------------------------------
// Reading

/** Organisations the actor belongs to (seller roles scoped to an organisation). */
export async function myOrgIds(db: DbOrTx, userId: string) {
  const rows = await db
    .selectDistinct({ id: roleGrants.scopeId })
    .from(roleGrants)
    .where(and(eq(roleGrants.userId, userId), eq(roleGrants.scopeType, 'org'), isNull(roleGrants.revokedAt)));
  return rows.map((r) => r.id!).filter(Boolean);
}

export async function loadOrg(db: DbOrTx, orgId: string) {
  const [o] = await db.select().from(organisations).where(eq(organisations.id, orgId));
  if (!o) throw notFound('Organisation');
  return o;
}

/** For reviewers looking at a case: the organisation and its addresses (the caller has checked access to the case). */
export async function orgForCase(db: DbOrTx, orgId: string) {
  const org = await loadOrg(db, orgId);
  const addresses = await db.select().from(orgAddresses).where(eq(orgAddresses.orgId, orgId)).orderBy(asc(orgAddresses.createdAt));
  return { org, addresses };
}

export async function getOrg(db: DbOrTx, ctx: Pick<Ctx, 'ability'>, orgId: string) {
  if (!ctx.ability.can('read', orgSubject(orgId))) throw forbidden();
  const org = await loadOrg(db, orgId);
  const addresses = await db.select().from(orgAddresses).where(eq(orgAddresses.orgId, orgId)).orderBy(asc(orgAddresses.createdAt));
  return { org, addresses, stateName: GST_STATES[org.stateCode] ?? org.stateCode, canEdit: ctx.ability.can('update', orgSubject(orgId)), canManageUsers: ctx.ability.can('assign', orgSubject(orgId)) };
}

export async function listOrgs(db: DbOrTx, ctx: Pick<Ctx, 'ability'>, status?: Organisation['status']) {
  if (!ctx.ability.can('read', 'SellerOrg')) throw forbidden();
  const rows = await db.select().from(organisations).where(status ? eq(organisations.status, status) : undefined).orderBy(asc(organisations.legalName)).limit(500);
  return rows.filter((o) => ctx.ability.can('read', orgSubject(o.id)));
}

// ---------------------------------------------------------------------------
// Profile and addresses

export const orgPatch = z.object({
  tradeName: z.string().trim().max(200).optional(),
  contactName: z.string().trim().min(2).max(120).optional(),
  contactPhone: phone.optional(),
  website: z.string().trim().max(200).refine((s) => !s || /^https?:\/\/[^\s]+\.[^\s]+$/.test(s), 'Enter a web address starting with https://').optional(),
});

export async function updateOrg(deps: { db: Database }, ctx: Ctx, orgId: string, raw: z.input<typeof orgPatch>) {
  if (!ctx.ability.can('update', orgSubject(orgId))) throw forbidden();
  const p = orgPatch.parse(raw);
  return deps.db.transaction(async (tx) => {
    const before = await loadOrg(tx, orgId);
    const [row] = await tx.update(organisations).set(p).where(eq(organisations.id, orgId)).returning();
    await recordAudit(tx, ctx, { action: 'seller.profile.updated', subjectType: 'seller_org', subjectId: orgId, summary: `${ctx.actor.email} updated the profile of ${before.legalName}`, before: { tradeName: before.tradeName, contactName: before.contactName, contactPhone: before.contactPhone, website: before.website }, after: p });
    return row!;
  });
}

export const addressCreate = addressInput.extend({
  kind: z.enum(['registered', 'manufacturing', 'warehouse']),
  label: z.string().trim().max(80).default(''),
  stateCode: z.string().refine((s) => !!GST_STATES[s], 'Pick a state.'),
});

export async function addAddress(deps: { db: Database }, ctx: Ctx, orgId: string, raw: z.input<typeof addressCreate>) {
  if (!ctx.ability.can('update', orgSubject(orgId))) throw forbidden();
  const a = addressCreate.parse(raw);
  return deps.db.transaction(async (tx) => {
    const [row] = await tx.insert(orgAddresses).values({ orgId, ...a }).returning();
    await recordAudit(tx, ctx, { action: 'seller.address.added', subjectType: 'seller_org', subjectId: orgId, summary: `${ctx.actor.email} added a ${a.kind} address in ${a.city}`, after: a });
    return row!;
  });
}

export async function removeAddress(deps: { db: Database }, ctx: Ctx, orgId: string, addressId: string) {
  if (!ctx.ability.can('update', orgSubject(orgId))) throw forbidden();
  return deps.db.transaction(async (tx) => {
    const [a] = await tx.select().from(orgAddresses).where(and(eq(orgAddresses.id, addressId), eq(orgAddresses.orgId, orgId)));
    if (!a) throw notFound('Address');
    if (a.kind === 'registered') throw preconditionFailed('The registered office address cannot be removed.');
    if (a.approved) throw preconditionFailed('This manufacturing address was approved in a vendor assessment and cannot be removed.');
    await tx.delete(orgAddresses).where(eq(orgAddresses.id, addressId));
    await recordAudit(tx, ctx, { action: 'seller.address.removed', subjectType: 'seller_org', subjectId: orgId, summary: `${ctx.actor.email} removed the ${a.kind} address in ${a.city}` });
  });
}

// ---------------------------------------------------------------------------
// Users and divisions

export async function listMembers(db: DbOrTx, ctx: Pick<Ctx, 'ability'>, orgId: string) {
  if (!ctx.ability.can('read', orgSubject(orgId))) throw forbidden();
  const rows = await db
    .select({ id: profiles.id, name: profiles.fullName, email: profiles.email, status: profiles.status, role: roleGrants.role, grantId: roleGrants.id })
    .from(roleGrants)
    .innerJoin(profiles, eq(profiles.id, roleGrants.userId))
    .where(and(eq(roleGrants.scopeType, 'org'), eq(roleGrants.scopeId, orgId), isNull(roleGrants.revokedAt)))
    .orderBy(asc(profiles.fullName));
  const divs = await db.select().from(divisions).where(eq(divisions.orgId, orgId)).orderBy(asc(divisions.name));
  const members = divs.length ? await db.select().from(divisionMembers).where(inArray(divisionMembers.divisionId, divs.map((d) => d.id))) : [];
  return {
    members: rows.map((r) => ({ ...r, divisionIds: members.filter((m) => m.userId === r.id).map((m) => m.divisionId) })),
    divisions: divs.map((d) => ({ ...d, memberCount: members.filter((m) => m.divisionId === d.id).length })),
  };
}

export const memberInvite = z.object({
  email: z.email('Enter a valid email address.').transform((e) => e.toLowerCase().trim()),
  fullName: z.string().trim().min(2, 'Enter their name.').max(120),
  role: z.enum(['seller_admin', 'seller_staff']),
  divisionIds: z.array(z.uuid()).default([]),
});

/** A seller admin adds a colleague; they get an invite email and set their own password. */
export async function inviteMember(deps: SellerDeps, ctx: Ctx, orgId: string, raw: z.input<typeof memberInvite>) {
  if (!ctx.ability.can('assign', orgSubject(orgId))) throw forbidden('Only a seller admin adds users.');
  const m = memberInvite.parse(raw);
  const org = await loadOrg(deps.db, orgId);
  const [dup] = await deps.db.select({ id: profiles.id }).from(profiles).where(sql`lower(${profiles.email}) = ${m.email}`);
  if (dup) throw conflict('Someone with this email already has an account. Ask platform support to move them to your organisation.');
  if (m.divisionIds.length) {
    const own = await deps.db.select({ id: divisions.id }).from(divisions).where(and(eq(divisions.orgId, orgId), inArray(divisions.id, m.divisionIds)));
    if (own.length !== m.divisionIds.length) throw badRequest('Pick divisions of your organisation.');
  }
  const { userId, link } = await deps.auth.invite(m.email, m.fullName);
  try {
    await deps.db.transaction(async (tx) => {
      await tx.insert(profiles).values({ id: userId, email: m.email, fullName: m.fullName, kind: 'seller', status: 'invited', invitedBy: ctx.actor.id, invitedAt: new Date() });
      await tx.insert(roleGrants).values({ userId, role: m.role, scopeType: 'org', scopeId: orgId, grantedBy: ctx.actor.id });
      if (m.divisionIds.length) await tx.insert(divisionMembers).values(m.divisionIds.map((divisionId) => ({ divisionId, userId })));
      if (m.role === 'seller_admin') {
        // a new admin of a brand-owning organisation gets brand-owner powers too
        const owned = await tx.select({ id: brands.id }).from(brands).where(eq(brands.ownerOrgId, orgId));
        if (owned.length) await tx.insert(roleGrants).values(owned.map((b) => ({ userId, role: 'brand_owner' as const, scopeType: 'brand' as const, scopeId: b.id, grantedBy: ctx.actor.id })));
      }
      await recordAudit(tx, ctx, { action: 'seller.member.invited', subjectType: 'seller_org', subjectId: orgId, summary: `${ctx.actor.email} invited ${m.email} to ${org.legalName} as ${ROLES[m.role].label}`, after: { email: m.email, role: m.role, divisionIds: m.divisionIds } });
    });
  } catch (err) {
    await deps.auth.delete(userId).catch(() => {});
    throw err;
  }
  const url = confirmUrl(deps.appUrl, link, '/welcome');
  const { delivered } = await deps.mailer.sendInvite({ to: m.email, inviteeName: m.fullName, inviterName: `${ctx.actor.fullName || ctx.actor.email} (${org.legalName})`, roleLabels: [ROLES[m.role].label], url });
  return { userId, manualLink: delivered ? null : url };
}

/** Removes someone's access to the organisation (their account stays, without seller roles here). */
export async function removeMember(deps: { db: Database }, ctx: Ctx, orgId: string, userId: string) {
  if (!ctx.ability.can('assign', orgSubject(orgId))) throw forbidden();
  if (userId === ctx.actor.id) throw preconditionFailed('You cannot remove yourself. Ask another seller admin.');
  return deps.db.transaction(async (tx) => {
    const admins = await tx.select({ userId: roleGrants.userId }).from(roleGrants).where(and(eq(roleGrants.role, 'seller_admin'), eq(roleGrants.scopeType, 'org'), eq(roleGrants.scopeId, orgId), isNull(roleGrants.revokedAt)));
    const rows = await tx
      .update(roleGrants)
      .set({ revokedAt: new Date(), revokedBy: ctx.actor.id })
      .where(and(eq(roleGrants.userId, userId), eq(roleGrants.scopeType, 'org'), eq(roleGrants.scopeId, orgId), isNull(roleGrants.revokedAt)))
      .returning();
    if (!rows.length) throw notFound('Member');
    if (admins.length === 1 && admins[0]!.userId === userId) throw preconditionFailed('An organisation needs at least one seller admin.');
    const divs = await tx.select({ id: divisions.id }).from(divisions).where(eq(divisions.orgId, orgId));
    if (divs.length) await tx.delete(divisionMembers).where(and(eq(divisionMembers.userId, userId), inArray(divisionMembers.divisionId, divs.map((d) => d.id))));
    await recordAudit(tx, ctx, { action: 'seller.member.removed', subjectType: 'seller_org', subjectId: orgId, summary: `${ctx.actor.email} removed a member from the organisation`, before: { userId, roles: rows.map((r) => r.role) } });
  });
}

export const divisionInput = z.object({
  name: z.string().trim().min(2, 'Name the division.').max(80),
  categoryNodeIds: z.array(z.uuid()).default([]),
  memberIds: z.array(z.uuid()).default([]),
});

/** Creates or updates a division: its name, the categories its members list in, and who is in it. */
export async function saveDivision(deps: { db: Database }, ctx: Ctx, orgId: string, divisionId: string | null, raw: z.input<typeof divisionInput>) {
  if (!ctx.ability.can('assign', orgSubject(orgId))) throw forbidden('Only a seller admin manages divisions.');
  const d = divisionInput.parse(raw);
  return deps.db.transaction(async (tx) => {
    if (d.memberIds.length) {
      const ok = await tx.select({ userId: roleGrants.userId }).from(roleGrants).where(and(eq(roleGrants.scopeType, 'org'), eq(roleGrants.scopeId, orgId), inArray(roleGrants.userId, d.memberIds), isNull(roleGrants.revokedAt)));
      if (new Set(ok.map((x) => x.userId)).size !== new Set(d.memberIds).size) throw badRequest('Pick members of your organisation.');
    }
    let id = divisionId;
    try {
      if (id) {
        const [row] = await tx.update(divisions).set({ name: d.name, categoryNodeIds: d.categoryNodeIds }).where(and(eq(divisions.id, id), eq(divisions.orgId, orgId))).returning();
        if (!row) throw notFound('Division');
      } else {
        const [row] = await tx.insert(divisions).values({ orgId, name: d.name, categoryNodeIds: d.categoryNodeIds }).returning();
        id = row!.id;
      }
    } catch (e) {
      if (String((e as { cause?: { code?: string } }).cause?.code) === '23505') throw conflict('A division with this name already exists.');
      throw e;
    }
    await tx.delete(divisionMembers).where(eq(divisionMembers.divisionId, id!));
    if (d.memberIds.length) await tx.insert(divisionMembers).values([...new Set(d.memberIds)].map((userId) => ({ divisionId: id!, userId })));
    await recordAudit(tx, ctx, { action: divisionId ? 'seller.division.updated' : 'seller.division.created', subjectType: 'seller_org', subjectId: orgId, summary: `${ctx.actor.email} ${divisionId ? 'updated' : 'created'} division "${d.name}" (${d.memberIds.length} member${d.memberIds.length === 1 ? '' : 's'}, ${d.categoryNodeIds.length || 'all'} categor${d.categoryNodeIds.length === 1 ? 'y' : 'ies'})`, after: d });
    return id!;
  });
}

export async function deleteDivision(deps: { db: Database }, ctx: Ctx, orgId: string, divisionId: string) {
  if (!ctx.ability.can('assign', orgSubject(orgId))) throw forbidden();
  return deps.db.transaction(async (tx) => {
    const [row] = await tx.delete(divisions).where(and(eq(divisions.id, divisionId), eq(divisions.orgId, orgId))).returning();
    if (!row) throw notFound('Division');
    await recordAudit(tx, ctx, { action: 'seller.division.deleted', subjectType: 'seller_org', subjectId: orgId, summary: `${ctx.actor.email} deleted division "${row.name}"` });
  });
}

// ---------------------------------------------------------------------------
// Verification decisions (reviewer, or an approver after escalation)

const ORG_STATUS: Partial<Record<CaseStatus, Organisation['status']>> = { approved: 'verified', rejected: 'rejected' };

export async function decideOrgVerification(deps: { db: Database }, ctx: Ctx, orgId: string, input: CaseDecisionInput) {
  return deps.db.transaction(async (tx) => {
    const org = await loadOrg(tx, orgId);
    const res = await decideCase(tx, ctx, CASE_SPECS.seller_org, { subjectId: orgId, orgId, title: org.legalName }, input);
    const status = ORG_STATUS[res.status];
    if (status) await tx.update(organisations).set({ status, statusReason: status === 'rejected' ? `${res.reason?.label ?? ''}: ${input.note ?? ''}`.trim() : null, verifiedAt: status === 'verified' ? new Date() : null }).where(eq(organisations.id, orgId));
    return res.status;
  });
}

export async function respondOrgVerification(deps: { db: Database }, ctx: Ctx, orgId: string, reply: { note: string; fileIds?: string[] }) {
  return deps.db.transaction(async (tx) => {
    const org = await loadOrg(tx, orgId);
    return respondCase(tx, ctx, CASE_SPECS.seller_org, { subjectId: orgId, orgId, title: org.legalName }, reply);
  });
}

/** Seller-side gate for submitting brand requests and vendor assessments. */
export async function assertVerified(db: DbOrTx, orgId: string) {
  const org = await loadOrg(db, orgId);
  if (org.status !== 'verified') throw preconditionFailed(org.status === 'pending' ? 'Your organisation is still being verified. You can prepare this now and submit it once verification is done.' : 'Your organisation is not verified, so it cannot submit this.');
  return org;
}
