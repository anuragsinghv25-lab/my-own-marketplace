import type { Action, AppAbility, SubjectType } from '@orbita/authz';
import { forbidden, type Actor, type RequestMeta } from '@orbita/domain';

export interface Ctx {
  actor: Actor;
  ability: AppAbility;
  meta: RequestMeta;
}

export function must(ctx: Pick<Ctx, 'ability'>, action: Action, subject: SubjectType, message?: string) {
  if (!ctx.ability.can(action, subject)) throw forbidden(message);
}

/** Postgres unique-violation → friendly message. */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}

/** Keep only plain JSON in audit before/after snapshots. */
export function snapshot<T extends object>(row: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(row));
}

export const codeSchemaRegex = /^[a-z][a-z0-9_]{1,62}$/;
