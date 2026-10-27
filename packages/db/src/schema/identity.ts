import { sql } from 'drizzle-orm';
import { boolean, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const userStatus = pgEnum('user_status', ['invited', 'active', 'deactivated']);
export const userKind = pgEnum('user_kind', ['staff', 'seller']);
export const scopeType = pgEnum('scope_type', ['global', 'workgroup', 'org', 'brand']);

/**
 * One row per Supabase Auth user (same id). Supabase owns credentials;
 * this table owns everything the platform needs to know about a person.
 * The foreign key to auth.users is added in a hand-written migration.
 */
export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').primaryKey(),
    email: text('email').notNull(),
    fullName: text('full_name').notNull().default(''),
    kind: userKind('kind').notNull().default('staff'),
    status: userStatus('status').notNull().default('invited'),
    /** Demo account created by setup: password can be set by an admin, and it can be rebuilt or removed. */
    isDemo: boolean('is_demo').notNull().default(false),
    invitedBy: uuid('invited_by'),
    invitedAt: timestamp('invited_at', { withTimezone: true }),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('profiles_email_key').on(sql`lower(${t.email})`)],
);

/**
 * A role held by a user within a scope. Revoking sets revoked_at (rows are never deleted,
 * so the history of who held what stays queryable).
 */
export const roleGrants = pgTable(
  'role_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    scopeType: scopeType('scope_type').notNull().default('global'),
    scopeId: uuid('scope_id'),
    grantedBy: uuid('granted_by'),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    revokedBy: uuid('revoked_by'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    index('role_grants_user_idx').on(t.userId),
    uniqueIndex('role_grants_active_key')
      .on(t.userId, t.role, t.scopeType, sql`coalesce(${t.scopeId}, '00000000-0000-0000-0000-000000000000'::uuid)`)
      .where(sql`${t.revokedAt} is null`),
  ],
);

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type RoleGrantRow = typeof roleGrants.$inferSelect;
