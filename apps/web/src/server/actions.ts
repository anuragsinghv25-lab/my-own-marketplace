import 'server-only';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { isAppError } from '@orbita/domain';
import type { ActionState } from '@/lib/action-state';
import { log } from './log';
import { requestMeta } from './request';
import { sessionOrThrow } from './session';

/** The module context (who, what they may do, request id) for a server action. */
export async function actionCtx() {
  return { ...(await sessionOrThrow()), meta: await requestMeta() };
}

/**
 * Runs a server action body with one error format: AppError and validation errors become
 * a readable message; anything else is logged and reported generically.
 */
export async function runAction(fn: () => Promise<ActionState>, revalidate: string[] = []): Promise<ActionState> {
  try {
    const result = await fn();
    for (const p of revalidate) revalidatePath(p);
    return result;
  } catch (err) {
    if (isAppError(err)) return { status: 'error', message: err.message };
    if (err instanceof ZodError) {
      const first = err.issues[0];
      const field = first?.path.join('.');
      return {
        status: 'error',
        message: first ? `${field ? `${field}: ` : ''}${first.message}` : 'Check the input.',
        fieldErrors: Object.fromEntries(err.issues.map((i) => [i.path.join('.'), [i.message]])),
      };
    }
    log.error('action.failed', { err });
    return { status: 'error', message: 'Something went wrong. Please try again.' };
  }
}
