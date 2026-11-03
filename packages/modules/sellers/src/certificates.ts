import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { recordAudit } from '@orbita/audit';
import { certificates, certificateTypes, files, organisations, type Database, type DbOrTx } from '@orbita/db';
import { badRequest, conflict, forbidden, notFound } from '@orbita/domain';
import { notify } from '@orbita/notifications';
import { orgPeople } from './cases';
import type { Ctx } from './context';
import { assertOwnFiles, certificateSubject } from './files';

/** The certificate library: uploaded once per organisation, verified by a reviewer, reused by catalogs in R5. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2027-03-31.');
export const certificateInput = z.object({
  typeId: z.uuid('Pick a certificate type.'),
  number: z.string().trim().min(2, 'Enter the certificate number.').max(80),
  issuer: z.string().trim().min(2, 'Enter who issued it.').max(120),
  validFrom: isoDate.nullable().optional(),
  validUntil: isoDate.nullable().optional(),
  scope: z.string().trim().max(500).default(''),
  fileId: z.uuid('Attach the certificate.'),
});

export async function certificateTypeList(db: DbOrTx) {
  return db.select({ id: certificateTypes.id, code: certificateTypes.code, name: certificateTypes.name, issuer: certificateTypes.issuer, level: certificateTypes.level, hasExpiry: certificateTypes.hasExpiry }).from(certificateTypes).where(eq(certificateTypes.status, 'active')).orderBy(asc(certificateTypes.name));
}

export async function addCertificate(deps: { db: Database }, ctx: Ctx, orgId: string, raw: z.input<typeof certificateInput>) {
  if (!ctx.ability.can('create', certificateSubject(orgId))) throw forbidden('You cannot add certificates for this organisation.');
  const c = certificateInput.parse(raw);
  if (c.validFrom && c.validUntil && c.validUntil <= c.validFrom) throw badRequest('“Valid until” must be after “valid from”.');
  return deps.db.transaction(async (tx) => {
    await assertOwnFiles(tx, orgId, [c.fileId]);
    const [type] = await tx.select().from(certificateTypes).where(eq(certificateTypes.id, c.typeId));
    if (!type) throw notFound('Certificate type');
    if (type.hasExpiry && !c.validUntil) throw badRequest(`${type.name} expires: enter “valid until”.`);
    const [row] = await tx.insert(certificates).values({ orgId, ...c, validFrom: c.validFrom ?? null, validUntil: c.validUntil ?? null, createdBy: ctx.actor.id }).returning();
    await recordAudit(tx, ctx, { action: 'certificate.added', subjectType: 'certificate', subjectId: row!.id, summary: `${ctx.actor.email} added ${type.name} ${c.number}`, after: { type: type.code, number: c.number, validUntil: c.validUntil ?? null } });
    return row!;
  });
}

export async function listCertificates(db: DbOrTx, ctx: Pick<Ctx, 'ability'>, filter: { orgId?: string; status?: 'pending' | 'verified' | 'rejected' | 'expired' } = {}) {
  if (filter.orgId ? !ctx.ability.can('read', certificateSubject(filter.orgId)) : !ctx.ability.can('read', 'Certificate')) throw forbidden();
  return db
    .select({ c: certificates, typeName: certificateTypes.name, orgName: organisations.legalName, filename: files.filename })
    .from(certificates)
    .innerJoin(certificateTypes, eq(certificateTypes.id, certificates.typeId))
    .innerJoin(organisations, eq(organisations.id, certificates.orgId))
    .innerJoin(files, eq(files.id, certificates.fileId))
    .where(and(filter.orgId ? eq(certificates.orgId, filter.orgId) : undefined, filter.status ? eq(certificates.status, filter.status) : undefined))
    .orderBy(filter.status === 'pending' ? asc(certificates.createdAt) : desc(certificates.createdAt))
    .limit(500);
}

/** A reviewer checks the uploaded document against the issuer's records and verifies or rejects it. */
export async function verifyCertificate(deps: { db: Database }, ctx: Ctx, certificateId: string, verdict: { ok: boolean; note?: string }) {
  return deps.db.transaction(async (tx) => {
    const [c] = await tx.select().from(certificates).where(eq(certificates.id, certificateId)).for('update');
    if (!c) throw notFound('Certificate');
    if (!ctx.ability.can('approve', certificateSubject(c.orgId))) throw forbidden('Only a reviewer verifies certificates.');
    if (c.status !== 'pending') throw conflict('This certificate has already been checked.');
    const note = verdict.note?.trim() ?? '';
    if (!verdict.ok && note.length < 5) throw badRequest('Say why it cannot be verified.');
    await tx.update(certificates).set({ status: verdict.ok ? 'verified' : 'rejected', statusNote: note || null, verifiedBy: ctx.actor.id, verifiedAt: new Date() }).where(eq(certificates.id, certificateId));
    await recordAudit(tx, ctx, { action: verdict.ok ? 'certificate.verified' : 'certificate.rejected', subjectType: 'certificate', subjectId: certificateId, summary: `${ctx.actor.email} ${verdict.ok ? 'verified' : 'rejected'} certificate ${c.number}${note ? `: ${note}` : ''}` });
    await notify(tx, await orgPeople(tx, c.orgId), { kind: verdict.ok ? 'certificate.verified' : 'certificate.rejected', title: `Certificate ${c.number} was ${verdict.ok ? 'verified' : 'rejected'}`, body: note, link: '/seller/certificates' });
  });
}
