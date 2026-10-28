import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { attributes } from './library';
import { standardSource } from './standards';

/**
 * R1 · Taxonomy and workgroups. R1.1 · variable depth (Shopify-style).
 * A tree of up to 8 levels. "group" nodes organise; "listing" nodes are the leaves products are listed in.
 * Nodes are either custom or adopted from a standard (Shopify / UNSPSC) and keep the link to it.
 */
export const nodeStatus = pgEnum('category_node_status', ['active', 'inactive']);
export const categoryKind = pgEnum('category_kind', ['group', 'listing']);

export const workgroups = pgTable(
  'workgroups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    status: nodeStatus('status').notNull().default('active'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('workgroups_code_key').on(sql`lower(${t.code})`),
    uniqueIndex('workgroups_name_key').on(sql`lower(${t.name})`),
  ],
);

export const categoryNodes = pgTable(
  'category_nodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parentId: uuid('parent_id').references((): AnyPgColumn => categoryNodes.id),
    /** depth, 1 = top level */
    level: smallint('level').notNull(),
    kind: categoryKind('kind').notNull().default('group'),
    /** Custom: C12.03.01 (parent code + two characters). Adopted: the standard's own id (el-6-11-2, 43211503). */
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    source: standardSource('source').notNull().default('custom'),
    /** id in the standard it was adopted from; null for custom nodes */
    externalId: text('external_id'),
    /** optional UNSPSC commodity this category maps to (for procurement reporting); children inherit it */
    unspscCode: text('unspsc_code'),
    /** explicit owner; children inherit it unless they set their own */
    workgroupId: uuid('workgroup_id').references(() => workgroups.id),
    status: nodeStatus('status').notNull().default('active'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('category_nodes_code_key').on(t.code),
    uniqueIndex('category_nodes_sibling_name_key').on(
      sql`coalesce(${t.parentId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      sql`lower(${t.name})`,
    ),
    index('category_nodes_parent_idx').on(t.parentId),
    uniqueIndex('category_nodes_external_key').on(t.source, t.externalId).where(sql`${t.externalId} is not null`),
  ],
);

export const categoryAttributeOrigin = pgEnum('category_attribute_origin', ['manual', 'shopify', 'unspsc']);

/**
 * R1.1 · The attributes that describe products in a category. Children inherit their ancestors' set,
 * so "Color" set on Apparel applies to every apparel listing category. R2 starts the spec sheet from it.
 */
export const categoryAttributes = pgTable(
  'category_attributes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nodeId: uuid('node_id')
      .notNull()
      .references(() => categoryNodes.id, { onDelete: 'cascade' }),
    attributeId: uuid('attribute_id')
      .notNull()
      .references(() => attributes.id),
    required: boolean('required').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    origin: categoryAttributeOrigin('origin').notNull().default('manual'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('category_attributes_node_attribute_key').on(t.nodeId, t.attributeId)],
);

/** Alternative names. Unique across the whole tree, case-insensitive. */
export const categoryAliases = pgTable(
  'category_aliases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nodeId: uuid('node_id')
      .notNull()
      .references(() => categoryNodes.id, { onDelete: 'cascade' }),
    alias: text('alias').notNull(),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('category_aliases_alias_key').on(sql`lower(${t.alias})`)],
);

export const categoryVersionState = pgEnum('category_version_state', [
  'DRAFT',
  'IN_REVIEW',
  'SENT_BACK',
  'APPROVED',
  'SCHEDULED',
  'PUBLISHED',
  'SUPERSEDED',
  'DISCARDED',
]);

/** R1 creates the empty v0 shell of each listing category; R2 configures it, R3 approves it. */
export const categoryVersions = pgTable(
  'category_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nodeId: uuid('node_id')
      .notNull()
      .references(() => categoryNodes.id),
    version: integer('version').notNull(),
    state: categoryVersionState('state').notNull().default('DRAFT'),
    assigneeId: uuid('assignee_id'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('category_versions_node_version_key').on(t.nodeId, t.version),
    uniqueIndex('category_versions_one_open_draft')
      .on(t.nodeId)
      .where(sql`${t.state} in ('DRAFT', 'IN_REVIEW', 'SENT_BACK')`),
    index('category_versions_assignee_idx').on(t.assigneeId, t.state),
  ],
);

export type Workgroup = typeof workgroups.$inferSelect;
export type CategoryNode = typeof categoryNodes.$inferSelect;
export type CategoryAlias = typeof categoryAliases.$inferSelect;
export type CategoryVersion = typeof categoryVersions.$inferSelect;
export type CategoryAttribute = typeof categoryAttributes.$inferSelect;
