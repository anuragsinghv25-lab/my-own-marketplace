import { sql } from 'drizzle-orm';
import { boolean, doublePrecision, index, integer, jsonb, pgEnum, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { attributes, flagDefinitions, units } from './library';
import { categoryVersions } from './taxonomy';

/**
 * R2 · Category configuration: what a listing category's version asks of sellers.
 * Flags override the profile; specs come from the library; typed rules connect them.
 * Compiling turns all of it into an immutable Category Contract.
 */

/** A flag value set on this version, overriding the profile and the platform default. */
export const versionFlagValues = pgTable(
  'version_flag_values',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    versionId: uuid('version_id')
      .notNull()
      .references(() => categoryVersions.id, { onDelete: 'cascade' }),
    flagId: uuid('flag_id')
      .notNull()
      .references(() => flagDefinitions.id),
    value: jsonb('value').notNull(),
  },
  (t) => [uniqueIndex('version_flag_values_key').on(t.versionId, t.flagId)],
);

export const specImportance = pgEnum('spec_importance', ['key', 'required', 'recommended', 'optional']);
export const specPreference = pgEnum('spec_preference', ['none', 'higher', 'lower']);

export const specDefinitions = pgTable(
  'spec_definitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    versionId: uuid('version_id')
      .notNull()
      .references(() => categoryVersions.id, { onDelete: 'cascade' }),
    attributeId: uuid('attribute_id')
      .notNull()
      .references(() => attributes.id),
    groupName: text('group_name').notNull().default('General'),
    sortOrder: integer('sort_order').notNull().default(0),
    importance: specImportance('importance').notNull().default('optional'),
    filterable: boolean('filterable').notNull().default(false),
    comparable: boolean('comparable').notNull().default(false),
    variantOption: boolean('variant_option').notNull().default(false),
    preference: specPreference('preference').notNull().default('none'),
    /** list attributes: force one value (false) or several (true); null keeps the attribute's type */
    multiple: boolean('multiple'),
    /** a subset of the value list; null = all values */
    allowedValues: text('allowed_values').array(),
    minValue: doublePrecision('min_value'),
    maxValue: doublePrecision('max_value'),
    step: doublePrecision('step'),
    decimals: smallint('decimals'),
    unitId: uuid('unit_id').references(() => units.id),
    sellerHint: text('seller_hint').notNull().default(''),
    buyerHint: text('buyer_hint').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('spec_definitions_version_attribute_key').on(t.versionId, t.attributeId), index('spec_definitions_version_idx').on(t.versionId, t.sortOrder)],
);

export const ruleKind = pgEnum('category_rule_kind', ['restrict', 'require', 'hide', 'price']);

/** Typed rules; `definition` holds { when: Condition[], target?, values?, min?, max?, priceMin?, priceMax?, message? } (see @orbita/contract). */
export const categoryRules = pgTable(
  'category_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    versionId: uuid('version_id')
      .notNull()
      .references(() => categoryVersions.id, { onDelete: 'cascade' }),
    kind: ruleKind('kind').notNull(),
    name: text('name').notNull().default(''),
    enabled: boolean('enabled').notNull().default(true),
    definition: jsonb('definition').$type<Record<string, unknown>>().notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('category_rules_version_idx').on(t.versionId, t.sortOrder)],
);

/** Every compile is kept: the hash identifies exactly the rules a product was checked against. */
export const categoryContracts = pgTable(
  'category_contracts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    versionId: uuid('version_id')
      .notNull()
      .references(() => categoryVersions.id, { onDelete: 'cascade' }),
    ok: boolean('ok').notNull(),
    hash: text('hash'),
    contract: jsonb('contract'),
    issues: jsonb('issues').$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    testsPassed: integer('tests_passed').notNull().default(0),
    testsFailed: integer('tests_failed').notNull().default(0),
    compiledBy: uuid('compiled_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('category_contracts_version_idx').on(t.versionId, t.createdAt)],
);

export const testExpectation = pgEnum('contract_test_expectation', ['pass', 'fail']);

/** Sample products that must pass (or must fail) every compile. */
export const contractTestCases = pgTable(
  'contract_test_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    versionId: uuid('version_id')
      .notNull()
      .references(() => categoryVersions.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    expectation: testExpectation('expectation').notNull(),
    /** { values, brand?, model?, price?, mrp? } */
    sample: jsonb('sample').$type<Record<string, unknown>>().notNull(),
    lastResult: text('last_result'),
    lastMessage: text('last_message'),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('contract_test_cases_version_idx').on(t.versionId)],
);

export type VersionFlagValue = typeof versionFlagValues.$inferSelect;
export type SpecDefinition = typeof specDefinitions.$inferSelect;
export type CategoryRule = typeof categoryRules.$inferSelect;
export type CategoryContractRow = typeof categoryContracts.$inferSelect;
export type ContractTestCase = typeof contractTestCases.$inferSelect;
