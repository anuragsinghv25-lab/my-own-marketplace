import { and, desc, eq, gte, ilike, lt, lte, or, type SQL } from 'drizzle-orm';
import type { AppAbility } from '@orbita/authz';
import { auditEvents, type AuditEventRow, type DbOrTx } from '@orbita/db';
import { forbidden, type Actor, type RequestMeta } from '@orbita/domain';

export interface AuditInput {
  /** dotted verb, e.g. `user.invited` */
  action: string;
  subjectType: string;
  subjectId?: string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
  meta?: Record<string, unknown>;
}

/**
 * Record an audit event. Pass the transaction handle of the change being audited so both
 * commit or roll back together.
 */
export async function recordAudit(
  tx: DbOrTx,
  who: { actor: Pick<Actor, 'id' | 'email'> | null; meta?: RequestMeta },
  input: AuditInput,
): Promise<void> {
  await tx.insert(auditEvents).values({
    actorId: who.actor?.id ?? null,
    actorEmail: who.actor?.email ?? null,
    action: input.action,
    subjectType: input.subjectType,
    subjectId: input.subjectId ?? null,
    summary: input.summary,
    before: input.before ?? null,
    after: input.after ?? null,
    meta: {
      ...(input.meta ?? {}),
      ...(who.meta?.ip ? { ip: who.meta.ip } : {}),
      ...(who.meta?.userAgent ? { userAgent: who.meta.userAgent } : {}),
    },
    requestId: who.meta?.requestId ?? null,
  });
}

/** Escape LIKE wildcards in user input. */
export const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

export interface AuditQuery {
  actor?: string; // email fragment or user id
  action?: string; // exact verb or prefix ending in '.' e.g. "role."
  subjectType?: string;
  subjectId?: string;
  from?: Date;
  to?: Date;
  q?: string; // free text over summary
  limit?: number;
  /** id of the last row from the previous page */
  before?: number;
}

export interface AuditPage {
  items: AuditEventRow[];
  nextCursor: number | null;
}

export async function listAuditEvents(
  db: DbOrTx,
  ability: AppAbility,
  query: AuditQuery = {},
): Promise<AuditPage> {
  if (!ability.can('read', 'AuditEvent')) throw forbidden('You cannot view the audit log.');
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
  const where: SQL[] = [];
  if (query.actor) {
    const a = query.actor.trim();
    const byId = /^[0-9a-f-]{36}$/i.test(a);
    where.push(byId ? eq(auditEvents.actorId, a) : ilike(auditEvents.actorEmail, `%${likeEscape(a)}%`));
  }
  if (query.action) {
    where.push(
      query.action.endsWith('.')
        ? ilike(auditEvents.action, `${likeEscape(query.action)}%`)
        : eq(auditEvents.action, query.action),
    );
  }
  if (query.subjectType) where.push(eq(auditEvents.subjectType, query.subjectType));
  if (query.subjectId) where.push(eq(auditEvents.subjectId, query.subjectId));
  if (query.from) where.push(gte(auditEvents.occurredAt, query.from));
  if (query.to) where.push(lte(auditEvents.occurredAt, query.to));
  if (query.q) {
    const q = `%${likeEscape(query.q.trim())}%`;
    where.push(or(ilike(auditEvents.summary, q), ilike(auditEvents.action, q))!);
  }
  if (query.before) where.push(lt(auditEvents.id, query.before));

  const rows = await db
    .select()
    .from(auditEvents)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(auditEvents.id))
    .limit(limit + 1);

  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null };
}
