import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { standardSource } from './standards';

/**
 * R1 · Attribute library: the reusable building blocks every category is configured from.
 * Owned by the platform admin. Rows are never deleted once used; they are deprecated.
 */
export const libraryStatus = pgEnum('library_status', ['active', 'deprecated']);

const audit = {
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

/** e.g. length, mass, data storage. Units of one dimension convert into each other. */
export const unitDimensions = pgTable(
  'unit_dimensions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    status: libraryStatus('status').notNull().default('active'),
    ...audit,
  },
  (t) => [uniqueIndex('unit_dimensions_code_key').on(sql`lower(${t.code})`)],
);

export const units = pgTable(
  'units',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dimensionId: uuid('dimension_id')
      .notNull()
      .references(() => unitDimensions.id),
    code: text('code').notNull(),
    symbol: text('symbol').notNull(),
    name: text('name').notNull(),
    /** value in this unit × factor = value in the dimension's base unit */
    factorToBase: numeric('factor_to_base', { precision: 30, scale: 12 }).notNull(),
    isBase: boolean('is_base').notNull().default(false),
    status: libraryStatus('status').notNull().default('active'),
    ...audit,
  },
  (t) => [
    uniqueIndex('units_code_key').on(sql`lower(${t.code})`),
    uniqueIndex('units_one_base_per_dimension').on(t.dimensionId).where(sql`${t.isBase}`),
  ],
);

export const valueListKind = pgEnum('value_list_kind', ['plain', 'ordinal', 'group_ordinal']);

export const valueLists = pgTable(
  'value_lists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    kind: valueListKind('kind').notNull().default('plain'),
    source: standardSource('source').notNull().default('custom'),
    externalRef: text('external_ref'),
    status: libraryStatus('status').notNull().default('active'),
    ...audit,
  },
  (t) => [
    uniqueIndex('value_lists_code_key').on(sql`lower(${t.code})`),
    uniqueIndex('value_lists_external_key').on(t.source, t.externalRef).where(sql`${t.externalRef} is not null`),
  ],
);

export const valueListItems = pgTable(
  'value_list_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    listId: uuid('list_id')
      .notNull()
      .references(() => valueLists.id, { onDelete: 'cascade' }),
    value: text('value').notNull(),
    /** ordinal lists: higher weight = higher rank */
    weight: integer('weight'),
    /** group-ordinal lists: items are ranked within their group */
    groupName: text('group_name'),
    sortOrder: integer('sort_order').notNull().default(0),
    status: libraryStatus('status').notNull().default('active'),
  },
  (t) => [
    uniqueIndex('value_list_items_value_key').on(t.listId, sql`lower(${t.value})`),
    index('value_list_items_list_idx').on(t.listId, t.sortOrder),
  ],
);

export const booleanPairs = pgTable(
  'boolean_pairs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    trueLabel: text('true_label').notNull(),
    falseLabel: text('false_label').notNull(),
    status: libraryStatus('status').notNull().default('active'),
    ...audit,
  },
  (t) => [uniqueIndex('boolean_pairs_code_key').on(sql`lower(${t.code})`)],
);

export const attributeType = pgEnum('attribute_type', [
  'boolean',
  'enumerable',
  'multi_enumerable',
  'ordinal',
  'group_ordinal',
  'numeric',
  'numeric_range',
  'measurable',
  'measurable_range',
  'text',
  'key_value',
]);

export const attributes = pgTable(
  'attributes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    dataType: attributeType('data_type').notNull(),
    valueListId: uuid('value_list_id').references(() => valueLists.id),
    booleanPairId: uuid('boolean_pair_id').references(() => booleanPairs.id),
    dimensionId: uuid('dimension_id').references(() => unitDimensions.id),
    defaultUnitId: uuid('default_unit_id').references(() => units.id),
    /** min, max, step, decimals, regex, maxLength: only the keys that apply to the type */
    validation: jsonb('validation').$type<Record<string, number | string>>().notNull().default({}),
    synonyms: text('synonyms').array().notNull().default(sql`'{}'::text[]`),
    buyerHint: text('buyer_hint').notNull().default(''),
    sellerHint: text('seller_hint').notNull().default(''),
    /** R1.1: where it came from; Shopify attributes keep their handle so re-imports reuse them */
    source: standardSource('source').notNull().default('custom'),
    externalRef: text('external_ref'),
    status: libraryStatus('status').notNull().default('active'),
    ...audit,
  },
  (t) => [
    uniqueIndex('attributes_code_key').on(sql`lower(${t.code})`),
    uniqueIndex('attributes_name_key').on(sql`lower(${t.name})`),
    uniqueIndex('attributes_external_key').on(t.source, t.externalRef).where(sql`${t.externalRef} is not null`),
  ],
);

export const certificateLevel = pgEnum('certificate_level', ['product', 'seller', 'both']);

export const certificateTypes = pgTable(
  'certificate_types',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    issuer: text('issuer').notNull().default(''),
    level: certificateLevel('level').notNull().default('product'),
    /** fields captured when a seller uploads this certificate, e.g. ["number", "issued_on"] */
    fields: text('fields').array().notNull().default(sql`'{number}'::text[]`),
    verification: text('verification').notNull().default('manual'),
    hasExpiry: boolean('has_expiry').notNull().default(true),
    /** reminder offsets before expiry, in days */
    reminderDays: integer('reminder_days').array().notNull().default(sql`'{30,7}'::int[]`),
    status: libraryStatus('status').notNull().default('active'),
    ...audit,
  },
  (t) => [uniqueIndex('certificate_types_code_key').on(sql`lower(${t.code})`)],
);

export const flagGroup = pgEnum('flag_group', ['category', 'seller', 'buyer', 'marketplace', 'transactional']);
export const flagValueType = pgEnum('flag_value_type', [
  'boolean',
  'number',
  'text',
  'single_select',
  'multi_select',
  'range',
]);

/** A configuration flag defined as data. Categories set values for these in R2. */
export const flagDefinitions = pgTable(
  'flag_definitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    label: text('label').notNull(),
    groupName: flagGroup('group_name').notNull(),
    ownerModule: text('owner_module').notNull().default('catalog'),
    valueType: flagValueType('value_type').notNull(),
    /** allowed options for select types; unit + bounds for number/range */
    schema: jsonb('schema').$type<{ options?: string[]; unit?: string; min?: number; max?: number }>().notNull().default({}),
    defaultValue: jsonb('default_value'),
    helpText: text('help_text').notNull().default(''),
    status: libraryStatus('status').notNull().default('active'),
    ...audit,
  },
  (t) => [uniqueIndex('flag_definitions_key_key').on(sql`lower(${t.key})`)],
);

export const flagProfiles = pgTable(
  'flag_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    /** bumped on every saved change */
    version: integer('version').notNull().default(1),
    status: libraryStatus('status').notNull().default('active'),
    ...audit,
  },
  (t) => [uniqueIndex('flag_profiles_code_key').on(sql`lower(${t.code})`)],
);

export const flagProfileValues = pgTable(
  'flag_profile_values',
  {
    profileId: uuid('profile_id')
      .notNull()
      .references(() => flagProfiles.id, { onDelete: 'cascade' }),
    flagId: uuid('flag_id')
      .notNull()
      .references(() => flagDefinitions.id),
    value: jsonb('value').notNull(),
  },
  (t) => [uniqueIndex('flag_profile_values_pk').on(t.profileId, t.flagId)],
);

/** Editable platform limits (text lengths, image counts, reminder offsets…). */
export const platformSettings = pgTable('platform_settings', {
  key: text('key').primaryKey(),
  label: text('label').notNull(),
  value: jsonb('value').notNull(),
  valueType: flagValueType('value_type').notNull().default('number'),
  unit: text('unit').notNull().default(''),
  description: text('description').notNull().default(''),
  updatedBy: uuid('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type UnitDimension = typeof unitDimensions.$inferSelect;
export type Unit = typeof units.$inferSelect;
export type ValueList = typeof valueLists.$inferSelect;
export type ValueListItem = typeof valueListItems.$inferSelect;
export type BooleanPair = typeof booleanPairs.$inferSelect;
export type Attribute = typeof attributes.$inferSelect;
export type CertificateType = typeof certificateTypes.$inferSelect;
export type FlagDefinition = typeof flagDefinitions.$inferSelect;
export type FlagProfile = typeof flagProfiles.$inferSelect;
export type PlatformSetting = typeof platformSettings.$inferSelect;
