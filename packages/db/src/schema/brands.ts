import { sql } from 'drizzle-orm';
import { boolean, date, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { files, organisations } from './sellers';
import { categoryNodes } from './taxonomy';

/**
 * R4 · Vendor assessment (who makes things), brands, trademarks, brand requests and the
 * brand-category-seller approvals that decide where a seller may list (R5).
 */

// ---------------------------------------------------------------------------
// Vendor assessment: an organisation proves it manufactures, which makes it a brand owner

export const oemType = pgEnum('oem_type', ['oem', 'deemed_oem', 'oem_fabricator']);
export const caseStatus = pgEnum('case_status', ['draft', 'submitted', 'info_requested', 'escalated', 'approved', 'partially_approved', 'rejected', 'withdrawn']);

export const vendorAssessments = pgTable(
  'vendor_assessments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    oemType: oemType('oem_type').notNull(),
    /** brand names the organisation makes, as typed; each becomes (or matches) a brand on approval */
    brandNames: text('brand_names').array().notNull().default(sql`'{}'::text[]`),
    /** manufacturing addresses to approve */
    addressIds: uuid('address_ids').array().notNull().default(sql`'{}'::uuid[]`),
    /** evidence: factory licence, registration, invoices for raw material… */
    fileIds: uuid('file_ids').array().notNull().default(sql`'{}'::uuid[]`),
    description: text('description').notNull().default(''),
    status: caseStatus('status').notNull().default('draft'),
    decisionNote: text('decision_note'),
    createdBy: uuid('created_by').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('vendor_assessments_org_idx').on(t.orgId)],
);

// ---------------------------------------------------------------------------
// Brands

export const brandStatus = pgEnum('brand_status', ['proposed', 'active', 'retired']);

export const brands = pgTable(
  'brands',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    /** upper-case letters and digits only, for duplicate and prohibited-name checks */
    normalizedName: text('normalized_name').notNull(),
    status: brandStatus('status').notNull().default('proposed'),
    /** the verified owner (an organisation that passed vendor assessment for it); null = owner not on the platform */
    ownerOrgId: uuid('owner_org_id').references(() => organisations.id),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('brands_normalized_key').on(t.normalizedName)],
);

export const markType = pgEnum('mark_type', ['word', 'device', 'both']);

export const trademarks = pgTable(
  'trademarks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    markType: markType('mark_type').notNull(),
    applicationNumber: text('application_number').notNull(),
    /** Nice class, 1–45 */
    niceClass: integer('nice_class').notNull(),
    ownerName: text('owner_name').notNull(),
    validUntil: date('valid_until'),
    certificateFileId: uuid('certificate_file_id').references(() => files.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('trademarks_brand_idx').on(t.brandId)],
);

export const brandRelation = pgEnum('brand_relation', ['owner', 'manufacturer_for_owner', 'authorised_reseller', 'unbranded']);
export const brandKind = pgEnum('brand_kind', ['registered', 'unregistered', 'unbranded']);

export const brandRequests = pgTable(
  'brand_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id),
    relation: brandRelation('relation').notNull(),
    brandKind: brandKind('brand_kind').notNull(),
    trademarkId: uuid('trademark_id').references(() => trademarks.id),
    /** listing categories asked for */
    categoryNodeIds: uuid('category_node_ids').array().notNull().default(sql`'{}'::uuid[]`),
    /** the owner name on the certificate is not the seller's: authorisation, deemed OEM or merger papers */
    ownerNameMatches: boolean('owner_name_matches'),
    undertakingAccepted: boolean('undertaking_accepted').notNull().default(false),
    fileIds: uuid('file_ids').array().notNull().default(sql`'{}'::uuid[]`),
    note: text('note').notNull().default(''),
    status: caseStatus('status').notNull().default('draft'),
    decisionNote: text('decision_note'),
    createdBy: uuid('created_by').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('brand_requests_org_idx').on(t.orgId, t.status), index('brand_requests_brand_idx').on(t.brandId)],
);

export const approvalSource = pgEnum('approval_source', ['review', 'auto', 'owner_authorisation']);

/** Where a seller may list a brand (feeds catalog permissions in R5). */
export const brandCategoryApprovals = pgTable(
  'brand_category_approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id),
    categoryNodeId: uuid('category_node_id')
      .notNull()
      .references(() => categoryNodes.id),
    relation: brandRelation('relation').notNull(),
    source: approvalSource('source').notNull(),
    requestId: uuid('request_id').references(() => brandRequests.id),
    authorisationId: uuid('authorisation_id'),
    /** regions (zones) for an authorised reseller; empty = everywhere */
    regions: text('regions').array().notNull().default(sql`'{}'::text[]`),
    validUntil: date('valid_until'),
    approvedBy: uuid('approved_by'),
    approvedAt: timestamp('approved_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: uuid('revoked_by'),
  },
  (t) => [
    uniqueIndex('brand_category_approvals_active_key').on(t.orgId, t.brandId, t.categoryNodeId).where(sql`${t.revokedAt} is null`),
    index('brand_category_approvals_brand_idx').on(t.brandId, t.categoryNodeId),
  ],
);

/** A brand rejected for a category: nobody may sell it there until an approver revives it. */
export const brandBlocks = pgTable(
  'brand_blocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id),
    categoryNodeId: uuid('category_node_id')
      .notNull()
      .references(() => categoryNodes.id),
    reason: text('reason').notNull(),
    requestId: uuid('request_id').references(() => brandRequests.id),
    blockedBy: uuid('blocked_by').notNull(),
    blockedAt: timestamp('blocked_at', { withTimezone: true }).notNull().defaultNow(),
    revivedBy: uuid('revived_by'),
    revivedAt: timestamp('revived_at', { withTimezone: true }),
    reviveNote: text('revive_note'),
  },
  (t) => [uniqueIndex('brand_blocks_active_key').on(t.brandId, t.categoryNodeId).where(sql`${t.revivedAt} is null`)],
);

export const nameListKind = pgEnum('name_list_kind', ['prohibited', 'negative', 'legally_rejected']);

/** Names nobody may register as a brand (prohibited, generic/negative words, court-rejected marks). */
export const prohibitedNames = pgTable(
  'prohibited_names',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    list: nameListKind('list').notNull(),
    reason: text('reason').notNull().default(''),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('prohibited_names_key').on(t.normalizedName)],
);

export const authorisationStatus = pgEnum('authorisation_status', ['requested', 'granted', 'declined', 'revoked']);

/** A reseller asks a brand owner on the platform for permission; the owner grants scope or declines. */
export const brandAuthorisations = pgTable(
  'brand_authorisations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id),
    ownerOrgId: uuid('owner_org_id')
      .notNull()
      .references(() => organisations.id),
    resellerOrgId: uuid('reseller_org_id')
      .notNull()
      .references(() => organisations.id),
    /** what the reseller asked for */
    requestedCategoryIds: uuid('requested_category_ids').array().notNull().default(sql`'{}'::uuid[]`),
    /** what the owner granted (a subset) */
    grantedCategoryIds: uuid('granted_category_ids').array().notNull().default(sql`'{}'::uuid[]`),
    regions: text('regions').array().notNull().default(sql`'{}'::text[]`),
    validUntil: date('valid_until'),
    message: text('message').notNull().default(''),
    status: authorisationStatus('status').notNull().default('requested'),
    decisionNote: text('decision_note'),
    requestedBy: uuid('requested_by').notNull(),
    decidedBy: uuid('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('brand_authorisations_owner_idx').on(t.ownerOrgId, t.status), index('brand_authorisations_reseller_idx').on(t.resellerOrgId)],
);

export type VendorAssessment = typeof vendorAssessments.$inferSelect;
export type Brand = typeof brands.$inferSelect;
export type Trademark = typeof trademarks.$inferSelect;
export type BrandRequest = typeof brandRequests.$inferSelect;
export type BrandCategoryApproval = typeof brandCategoryApprovals.$inferSelect;
export type BrandAuthorisation = typeof brandAuthorisations.$inferSelect;
