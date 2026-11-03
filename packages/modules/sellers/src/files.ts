import { createHash, randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { subject } from '@orbita/authz';
import { fileBlobs, files, type DbOrTx, type FileRow } from '@orbita/db';
import { badRequest, forbidden, notFound } from '@orbita/domain';
import type { Ctx } from './context';

/**
 * Evidence files (certificates, trademark papers, factory licences). Where the bytes live is a port:
 * Supabase Storage in production, the database in local development and tests.
 */
export interface FileStorage {
  put(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(path: string): Promise<Uint8Array>;
}

/** Keeps bytes in the file_blobs table. Fine for tests and local work; production uses Supabase Storage. */
export const databaseStorage = (db: DbOrTx): FileStorage => ({
  async put(path, bytes) {
    await db.insert(fileBlobs).values({ path, bytes: Buffer.from(bytes) });
  },
  async get(path) {
    const [row] = await db.select().from(fileBlobs).where(eq(fileBlobs.path, path));
    if (!row) throw notFound('File');
    return new Uint8Array(row.bytes);
  },
});

export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Magic numbers, so a renamed executable cannot pass as a PDF. */
function sniff(bytes: Uint8Array): string | null {
  const b = (i: number) => bytes[i];
  if (b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46) return 'application/pdf';
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'image/jpeg';
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return 'image/png';
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) return 'image/webp';
  return null;
}

export interface UploadInput {
  filename: string;
  bytes: Uint8Array;
}

/** Stores a file for an organisation the actor belongs to (as a seller admin or staff). */
export async function saveFile(deps: { db: DbOrTx; storage: FileStorage }, ctx: Ctx, orgId: string, f: UploadInput): Promise<FileRow> {
  if (!ctx.ability.can('update', orgSubject(orgId)) && !ctx.ability.can('create', certificateSubject(orgId))) throw forbidden('You cannot upload files for this organisation.');
  if (!f.bytes.length) throw badRequest('The file is empty.');
  if (f.bytes.length > MAX_FILE_BYTES) throw badRequest('Files can be up to 4 MB. Compress the PDF or upload a smaller scan.');
  const type = sniff(f.bytes);
  if (!type) throw badRequest('Upload a PDF, JPG, PNG or WebP file.');
  const name = f.filename.replace(/[^\w.\- ()]/g, '_').slice(0, 120) || `file.${ALLOWED_TYPES[type]}`;
  const sha256 = createHash('sha256').update(f.bytes).digest('hex');
  const path = `org/${orgId}/${randomUUID()}.${ALLOWED_TYPES[type]}`;
  await deps.storage.put(path, f.bytes, type);
  const [row] = await deps.db.insert(files).values({ orgId, path, filename: name, contentType: type, size: f.bytes.length, sha256, uploadedBy: ctx.actor.id }).returning();
  return row!;
}

/**
 * Reads a file. Members of the owning organisation can, and so can staff who review or audit
 * organisations; a reseller's evidence is also visible to the brand owner deciding on it (checked by the caller via `extraOrgIds`).
 */
export async function readFile(deps: { db: DbOrTx; storage: FileStorage }, ctx: Ctx, fileId: string, extraOrgIds: string[] = []) {
  const [row] = await deps.db.select().from(files).where(eq(files.id, fileId));
  if (!row) throw notFound('File');
  const allowed = !row.orgId || ctx.ability.can('read', orgSubject(row.orgId)) || extraOrgIds.some((o) => ctx.ability.can('read', orgSubject(o)));
  if (!allowed) throw forbidden('You cannot open this file.');
  return { file: row, bytes: await deps.storage.get(row.path) };
}

export async function filesById(db: DbOrTx, ids: string[]) {
  if (!ids.length) return [];
  return db.select({ id: files.id, filename: files.filename, contentType: files.contentType, size: files.size, orgId: files.orgId }).from(files).where(inArray(files.id, ids));
}

/** Files in the list must belong to the organisation (no attaching someone else's evidence). */
export async function assertOwnFiles(db: DbOrTx, orgId: string, ids: string[]) {
  const rows = await filesById(db, ids);
  if (rows.length !== new Set(ids).size || rows.some((r) => r.orgId !== orgId)) throw badRequest('One of the files does not belong to this organisation.');
}

// subjects, kept here so every seller module tags them the same way
export const orgSubject = (orgId: string) => subject('SellerOrg', { orgId });
export const certificateSubject = (orgId: string) => subject('Certificate', { orgId });
