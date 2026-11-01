import { sql } from 'drizzle-orm';
import { boolean, date, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { categoryContracts } from './config';
import { categoryNodes, categoryVersions } from './taxonomy';

/**
 * R3 · Review engine (generic) and category publishing.
 *
 * One review request per thing being reviewed (a category version now; brand requests and catalogs
 * in R4 and R5). Each submission is an *attempt*; each attempt opens one task per stage. Decisions,
 * comments and SLA timers hang off the request. How a subject type is reviewed (stages, reason codes,
 * SLA, attempt limit) is data in review_definitions, not code.
 */

export interface ReviewStage {
  key: string;
  label: string;
  /** the role that acts at this stage */
  role: string;
}

export interface ReasonCode {
  code: string;
  label: string;
  /** which decisions may use it */
  for: ('send_back' | 'discard')[];
}

export const reviewDefinitions = pgTable('review_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** e.g. category_version, brand_request, catalog */
  subjectType: text('subject_type').notNull().unique(),
  name: text('name').notNull(),
  stages: jsonb('stages').$type<ReviewStage[]>().notNull(),
  reasonCodes: jsonb('reason_codes').$type<ReasonCode[]>().notNull().default(sql`'[]'::jsonb`),
  /** hours an open task may wait before it is overdue */
  slaHours: integer('sla_hours').notNull().default(48),
  /** hours after which the assignee gets a reminder */
  reminderHours: integer('reminder_hours').notNull().default(24),
  /** submissions allowed before the request must be approved or discarded */
  maxAttempts: integer('max_attempts').notNull().default(5),
  updatedBy: uuid('updated_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const reviewState = pgEnum('review_state', ['open', 'sent_back', 'approved', 'withdrawn', 'discarded']);

export const reviewRequests = pgTable(
  'review_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    definitionId: uuid('definition_id')
      .notNull()
      .references(() => reviewDefinitions.id),
    subjectType: text('subject_type').notNull(),
    subjectId: uuid('subject_id').notNull(),
    /** shown in queues, e.g. "Electronics › Laptops · v2" */
    title: text('title').notNull(),
    /** scope of the subject, so queues can be filtered by workgroup */
    workgroupId: uuid('workgroup_id'),
    state: reviewState('state').notNull().default('open'),
    attempt: integer('attempt').notNull().default(1),
    submittedBy: uuid('submitted_by').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('review_requests_one_active').on(t.subjectType, t.subjectId).where(sql`${t.state} in ('open', 'sent_back')`),
    index('review_requests_state_idx').on(t.state, t.subjectType),
  ],
);

export const reviewTaskState = pgEnum('review_task_state', ['open', 'done', 'cancelled']);

export const reviewTasks = pgTable(
  'review_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => reviewRequests.id, { onDelete: 'cascade' }),
    attempt: integer('attempt').notNull(),
    stage: text('stage').notNull(),
    assigneeId: uuid('assignee_id'),
    state: reviewTaskState('state').notNull().default('open'),
    /** what was submitted, frozen: for a category version, the compiled contract */
    snapshotId: uuid('snapshot_id'),
    snapshotHash: text('snapshot_hash'),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    remindedAt: timestamp('reminded_at', { withTimezone: true }),
    escalatedAt: timestamp('escalated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [index('review_tasks_open_idx').on(t.state, t.assigneeId, t.dueAt), index('review_tasks_request_idx').on(t.requestId, t.attempt)],
);

export const reviewDecisionKind = pgEnum('review_decision_kind', ['approve', 'send_back', 'discard', 'withdraw']);

export const reviewDecisions = pgTable(
  'review_decisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => reviewRequests.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => reviewTasks.id),
    attempt: integer('attempt').notNull(),
    decision: reviewDecisionKind('decision').notNull(),
    reasonCode: text('reason_code'),
    note: text('note').notNull().default(''),
    decidedBy: uuid('decided_by').notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('review_decisions_request_idx').on(t.requestId, t.decidedAt)],
);

export const reviewComments = pgTable(
  'review_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => reviewRequests.id, { onDelete: 'cascade' }),
    attempt: integer('attempt').notNull(),
    /** a spec key, rule id or section ("flags", "title"); null = about the whole request */
    fieldKey: text('field_key'),
    fieldLabel: text('field_label'),
    body: text('body').notNull(),
    authorId: uuid('author_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedBy: uuid('resolved_by'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [index('review_comments_request_idx').on(t.requestId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Category publishing

/** When an approved version goes live: sellers first, buyers on or after that date. */
export const categorySchedules = pgTable('category_schedules', {
  versionId: uuid('version_id')
    .primaryKey()
    .references(() => categoryVersions.id),
  sellerGoLive: date('seller_go_live').notNull(),
  buyerGoLive: date('buyer_go_live').notNull(),
  /** buyers wait until this many catalogs exist (counted from R5) */
  minCatalogs: integer('min_catalogs').notNull().default(0),
  /** before go-live, only designated test sellers and buyers see the category */
  testMode: boolean('test_mode').notNull().default(false),
  setBy: uuid('set_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const categoryOpStatus = pgEnum('category_op_status', ['active', 'deactivated', 'down_for_buyers', 'down_for_sellers', 'maintenance']);

/** Operational status of a category over time; the latest row in force wins. "active" ends an earlier override. */
export const categoryStatusHistory = pgTable(
  'category_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nodeId: uuid('node_id')
      .notNull()
      .references(() => categoryNodes.id),
    status: categoryOpStatus('status').notNull(),
    reason: text('reason').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    /** null = until changed */
    endsAt: timestamp('ends_at', { withTimezone: true }),
    setBy: uuid('set_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledBy: uuid('cancelled_by'),
  },
  (t) => [index('category_status_history_node_idx').on(t.nodeId, t.startsAt)],
);

/** The contract a published version serves, frozen at approval. */
export const categoryVersionContracts = pgTable('category_version_contracts', {
  versionId: uuid('version_id')
    .primaryKey()
    .references(() => categoryVersions.id),
  contractId: uuid('contract_id')
    .notNull()
    .references(() => categoryContracts.id),
  approvedBy: uuid('approved_by').notNull(),
  approvedAt: timestamp('approved_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Notifications (in-app, and by email when Resend is configured)

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    /** e.g. review.submitted, review.sent_back, category.live */
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    /** app path to open, e.g. /reviews/<id> */
    link: text('link'),
    subjectType: text('subject_type'),
    subjectId: uuid('subject_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
    /** null = email not sent yet (or not wanted: see emailWanted) */
    emailedAt: timestamp('emailed_at', { withTimezone: true }),
    emailWanted: boolean('email_wanted').notNull().default(true),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.createdAt), index('notifications_email_idx').on(t.emailWanted, t.emailedAt)],
);

export type ReviewDefinition = typeof reviewDefinitions.$inferSelect;
export type ReviewRequest = typeof reviewRequests.$inferSelect;
export type ReviewTask = typeof reviewTasks.$inferSelect;
export type ReviewDecision = typeof reviewDecisions.$inferSelect;
export type ReviewComment = typeof reviewComments.$inferSelect;
export type CategorySchedule = typeof categorySchedules.$inferSelect;
export type CategoryStatusRow = typeof categoryStatusHistory.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
