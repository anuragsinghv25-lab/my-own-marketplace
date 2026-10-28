import { sql } from 'drizzle-orm';
import { boolean, index, integer, pgEnum, pgTable, primaryKey, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/**
 * R1.1 · Standard taxonomies (Shopify Standard Product Taxonomy, UNSPSC) kept as read-only
 * reference data. Nothing here is live: a category manager adopts a reference category into
 * the real tree (category_nodes) when the marketplace needs it.
 */
export const standardSource = pgEnum('standard_source', ['custom', 'shopify', 'unspsc']);

/** One row per loaded standard: which release, how much of it, who loaded it. */
export const referenceTaxonomies = pgTable(
  'reference_taxonomies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source: standardSource('source').notNull(),
    version: text('version').notNull(),
    /** Shopify verticals already loaded (it is loaded one vertical per request) */
    loadedParts: text('loaded_parts').array().notNull().default(sql`'{}'::text[]`),
    categoryCount: integer('category_count').notNull().default(0),
    attributeCount: integer('attribute_count').notNull().default(0),
    complete: boolean('complete').notNull().default(false),
    loadedBy: uuid('loaded_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('reference_taxonomies_source_key').on(t.source)],
);

export const referenceCategories = pgTable(
  'reference_categories',
  {
    source: standardSource('source').notNull(),
    /** Shopify: "el-6-11-2". UNSPSC: the 8-digit code. */
    externalId: text('external_id').notNull(),
    parentExternalId: text('parent_external_id'),
    /** 1 = top level */
    level: smallint('level').notNull(),
    name: text('name').notNull(),
    /** "Electronics > Computers > Gaming Computers > Gaming Laptops" */
    fullPath: text('full_path').notNull(),
    /** Shopify attribute handles that describe products in this category */
    attributeHandles: text('attribute_handles').array().notNull().default(sql`'{}'::text[]`),
    isLeaf: boolean('is_leaf').notNull().default(true),
  },
  (t) => [
    primaryKey({ columns: [t.source, t.externalId] }),
    index('reference_categories_parent_idx').on(t.source, t.parentExternalId),
  ],
);

export const referenceAttributes = pgTable(
  'reference_attributes',
  {
    source: standardSource('source').notNull(),
    handle: text('handle').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    /** extended attributes ("Lens color") share the values of their base ("color") */
    baseHandle: text('base_handle'),
    values: text('values').array().notNull().default(sql`'{}'::text[]`),
  },
  (t) => [primaryKey({ columns: [t.source, t.handle] })],
);

export type ReferenceTaxonomy = typeof referenceTaxonomies.$inferSelect;
export type ReferenceCategory = typeof referenceCategories.$inferSelect;
export type ReferenceAttribute = typeof referenceAttributes.$inferSelect;
export type StandardSource = (typeof standardSource.enumValues)[number];
