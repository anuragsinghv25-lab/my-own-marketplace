import { sql } from 'drizzle-orm';
import { boolean, customType, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { certificateTypes } from './library';

/**
 * R4 · Seller organisations. India only for now (GSTIN and PAN required); the country column is
 * there so other countries can be added without a schema change.
 */

export const orgStatus = pgEnum('org_status', ['pending', 'verified', 'rejected', 'suspended']);
export const businessType = pgEnum('business_type', ['proprietorship', 'partnership', 'llp', 'private_limited', 'public_limited', 'other']);

export const organisations = pgTable(
  'organisations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    legalName: text('legal_name').notNull(),
    tradeName: text('trade_name').notNull().default(''),
    businessType: businessType('business_type').notNull(),
    country: text('country').notNull().default('IN'),
    /** 15 characters, checksum-validated; its characters 3–12 are the PAN */
    gstin: text('gstin').notNull(),
    pan: text('pan').notNull(),
    /** GST state code, the first two digits of the GSTIN */
    stateCode: text('state_code').notNull(),
    contactName: text('contact_name').notNull(),
    contactEmail: text('contact_email').notNull(),
    contactPhone: text('contact_phone').notNull(),
    website: text('website').notNull().default(''),
    status: orgStatus('status').notNull().default('pending'),
    statusReason: text('status_reason'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }).notNull(),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('organisations_gstin_key').on(t.gstin), index('organisations_status_idx').on(t.status)],
);

export const addressKind = pgEnum('address_kind', ['registered', 'manufacturing', 'warehouse']);

export const orgAddresses = pgTable(
  'org_addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    kind: addressKind('kind').notNull(),
    label: text('label').notNull().default(''),
    line1: text('line1').notNull(),
    line2: text('line2').notNull().default(''),
    city: text('city').notNull(),
    stateCode: text('state_code').notNull(),
    pincode: text('pincode').notNull(),
    /** manufacturing addresses become approved through vendor assessment */
    approved: boolean('approved').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('org_addresses_org_idx').on(t.orgId)],
);

/** A part of the organisation that lists in some categories only (e.g. "Laptops team"). */
export const divisions = pgTable(
  'divisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** listing (or group) categories its members may list in; empty = all the organisation may */
    categoryNodeIds: uuid('category_node_ids').array().notNull().default(sql`'{}'::uuid[]`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('divisions_org_name_key').on(t.orgId, sql`lower(${t.name})`)],
);

export const divisionMembers = pgTable(
  'division_members',
  {
    divisionId: uuid('division_id')
      .notNull()
      .references(() => divisions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('division_members_key').on(t.divisionId, t.userId)],
);

/** Self sign-up attempts, for rate limiting (per IP and per email). */
export const signupAttempts = pgTable(
  'signup_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ip: text('ip'),
    email: text('email').notNull(),
    ok: boolean('ok').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('signup_attempts_ip_idx').on(t.ip, t.createdAt), index('signup_attempts_email_idx').on(t.email, t.createdAt)],
);

/** The 6-digit code a self-registered seller enters to confirm their email (no links: nothing depends on the site address). */
export const signupCodes = pgTable(
  'signup_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    email: text('email').notNull(),
    /** sha256(id + code); the code itself is never stored */
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    sends: integer('sends').notNull().default(1),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }).notNull().defaultNow(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('signup_codes_user_key').on(t.userId), index('signup_codes_email_idx').on(t.email)],
);

// ---------------------------------------------------------------------------
// Files (evidence, certificates, trademark documents)

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

export const files = pgTable(
  'files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** the organisation that owns it; null for platform files */
    orgId: uuid('org_id').references(() => organisations.id, { onDelete: 'cascade' }),
    /** where the storage adapter keeps it */
    path: text('path').notNull(),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    sha256: text('sha256').notNull(),
    uploadedBy: uuid('uploaded_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('files_org_idx').on(t.orgId)],
);

/** Bytes for the database storage adapter (local development and tests; production uses Supabase Storage). */
export const fileBlobs = pgTable('file_blobs', {
  path: text('path').primaryKey(),
  bytes: bytea('bytes').notNull(),
});

// ---------------------------------------------------------------------------
// Certificates (types live in the attribute library, R1)

export const certificateStatus = pgEnum('certificate_status', ['pending', 'verified', 'rejected', 'expired']);

export const certificates = pgTable(
  'certificates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    typeId: uuid('type_id')
      .notNull()
      .references(() => certificateTypes.id),
    number: text('number').notNull(),
    issuer: text('issuer').notNull(),
    validFrom: text('valid_from'),
    validUntil: text('valid_until'),
    /** what it covers, in the seller's words (products, models, sites) */
    scope: text('scope').notNull().default(''),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id),
    status: certificateStatus('status').notNull().default('pending'),
    statusNote: text('status_note'),
    verifiedBy: uuid('verified_by'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('certificates_org_idx').on(t.orgId), index('certificates_status_idx').on(t.status)],
);

export type Organisation = typeof organisations.$inferSelect;
export type OrgAddress = typeof orgAddresses.$inferSelect;
export type Division = typeof divisions.$inferSelect;
export type FileRow = typeof files.$inferSelect;
export type Certificate = typeof certificates.$inferSelect;
