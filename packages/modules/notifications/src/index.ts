import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { notifications, profiles, type Database, type DbOrTx } from '@orbita/db';
import type { Actor } from '@orbita/domain';

/**
 * In-app notifications, with email as a second channel. Rows are written in the same transaction as
 * the change they report (so a rolled-back approval never notifies anyone); email goes out afterwards
 * through `deliverEmails`, which the web app calls after a successful action and the daily job sweeps.
 */
export interface NotifyInput {
  kind: string;
  title: string;
  body?: string;
  link?: string | null;
  subjectType?: string;
  subjectId?: string;
  email?: boolean;
}

/** Sends one notification to each recipient (duplicates and the person who caused it are dropped). */
export async function notify(tx: DbOrTx, recipients: (string | null | undefined)[], n: NotifyInput, opts: { except?: string } = {}) {
  const ids = [...new Set(recipients.filter((r): r is string => !!r && r !== opts.except))];
  if (!ids.length) return 0;
  const active = await tx.select({ id: profiles.id }).from(profiles).where(and(inArray(profiles.id, ids), eq(profiles.status, 'active')));
  if (!active.length) return 0;
  await tx.insert(notifications).values(
    active.map((p) => ({
      userId: p.id,
      kind: n.kind,
      title: n.title,
      body: n.body ?? '',
      link: n.link ?? null,
      subjectType: n.subjectType ?? null,
      subjectId: n.subjectId ?? null,
      emailWanted: n.email !== false,
    })),
  );
  return active.length;
}

export async function listNotifications(db: DbOrTx, actor: Pick<Actor, 'id'>, limit = 20) {
  const rows = await db.select().from(notifications).where(eq(notifications.userId, actor.id)).orderBy(desc(notifications.createdAt)).limit(limit);
  const [{ unread } = { unread: 0 }] = await db
    .select({ unread: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, actor.id), isNull(notifications.readAt)));
  return { items: rows, unread };
}

/** Marks some (or, with no ids, all) of the actor's notifications as read. */
export async function markRead(db: DbOrTx, actor: Pick<Actor, 'id'>, ids?: string[]) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, actor.id), isNull(notifications.readAt), ids?.length ? inArray(notifications.id, ids) : undefined));
}

export interface NotificationMailer {
  sendNotification(to: string, n: { title: string; body: string; url: string | null }): Promise<{ delivered: boolean }>;
}

/**
 * Emails notifications that have not been emailed yet. A row is marked as emailed before sending,
 * so two overlapping sweeps never send the same email twice; an undelivered email is not retried
 * (the in-app notification still stands).
 */
export async function deliverEmails(db: Database, mailer: NotificationMailer, opts: { appUrl: string | null; limit?: number }) {
  const claimed = await db.execute<{ id: string; title: string; body: string; link: string | null; email: string }>(sql`
    update notifications n set emailed_at = now()
    from profiles p
    where n.id in (
      select id from notifications where email_wanted and emailed_at is null order by created_at limit ${opts.limit ?? 50} for update skip locked
    ) and p.id = n.user_id
    returning n.id, n.title, n.body, n.link, p.email`);
  let delivered = 0;
  for (const r of claimed) {
    const url = r.link && opts.appUrl ? new URL(r.link, opts.appUrl).toString() : null;
    const res = await mailer.sendNotification(r.email, { title: r.title, body: r.body, url }).catch(() => ({ delivered: false }));
    if (res.delivered) delivered++;
  }
  return { claimed: claimed.length, delivered };
}
