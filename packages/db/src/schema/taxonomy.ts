import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
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

/**
 * R1 · Taxonomy and workgroups.
 * L1 segment → L2 family → L3 class → L4 commodity (UNSPSC-style) → L5 listing category.
 */
export const nodeStatus = pgEnum('category_node_status', ['active', 'inactive']);

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
    level: smallint('level').notNull(),
    /** UNSPSC-style: 2 digits per level for L1–L4, then 2 characters for L5 (e.g. 43211503-01) */
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
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
  ],
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

/** R1 creates the empty v0 shell of each L5 category; R2 configures it, R3 approves it. */
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
