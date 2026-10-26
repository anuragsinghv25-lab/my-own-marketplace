import { bigserial, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Append-only audit trail. A trigger (hand-written migration) rejects UPDATE and DELETE.
 * Written in the same transaction as the change it describes.
 */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    actorId: uuid('actor_id'),
    actorEmail: text('actor_email'),
    /** dotted verb, e.g. user.invited, role.granted */
    action: text('action').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectId: text('subject_id'),
    summary: text('summary').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    meta: jsonb('meta'),
    requestId: text('request_id'),
  },
  (t) => [
    index('audit_events_occurred_idx').on(t.occurredAt.desc()),
    index('audit_events_actor_idx').on(t.actorId, t.occurredAt.desc()),
    index('audit_events_subject_idx').on(t.subjectType, t.subjectId),
    index('audit_events_action_idx').on(t.action),
  ],
);

export type AuditEventRow = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;
