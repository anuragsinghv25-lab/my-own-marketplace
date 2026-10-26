import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { AppError, badRequest, isAppError, type RequestMeta } from '@orbita/domain';
import { log } from '../log';
import { metaFromHeaders } from '../request';
import { sessionOrThrow, type Session } from '../session';
import type { Contract } from './contracts';

type Infer<T> = T extends z.ZodType ? z.output<T> : undefined;

export interface HandlerArgs<C extends Contract> {
  params: Infer<C['params']>;
  query: Infer<C['query']>;
  body: Infer<C['body']>;
  session: C['auth'] extends 'session' ? Session : Session | null;
  meta: RequestMeta;
  request: NextRequest;
}

type RouteContext = { params: Promise<Record<string, string | string[]>> };

/**
 * Wraps a route handler with: request id, authentication, Zod validation of
 * params/query/body, a single error format and error reporting.
 */
export function route<C extends Contract>(contract: C, handler: (args: HandlerArgs<C>) => Promise<unknown>) {
  return async (request: NextRequest, ctx: RouteContext): Promise<NextResponse> => {
    const meta = metaFromHeaders(request.headers);
    const started = Date.now();
    let status = 500;
    try {
      // Authenticate before validating, so anonymous callers learn nothing about the schema.
      const bearer = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1] ?? null;
      const session = contract.auth === 'session' ? await sessionOrThrow(bearer) : null;
      const rawParams = (await ctx?.params) ?? {};
      const params = contract.params ? parse(contract.params, rawParams, 'path') : undefined;
      const query = contract.query
        ? parse(contract.query, Object.fromEntries(request.nextUrl.searchParams), 'query')
        : undefined;
      let body: unknown;
      if (contract.body) {
        const json = await request.json().catch(() => {
          throw badRequest('Request body must be valid JSON.');
        });
        body = parse(contract.body, json, 'body');
      }

      const result = await handler({ params, query, body, session, meta, request } as HandlerArgs<C>);
      status = contract.successStatus ?? 200;
      return json(result, status, meta.requestId);
    } catch (err) {
      const appErr = toAppError(err);
      status = appErr.status;
      if (status >= 500) {
        Sentry.captureException(err, { tags: { route: contract.path, requestId: meta.requestId } });
        log.error('api.error', { route: contract.path, requestId: meta.requestId, err });
      }
      return json(
        {
          error: {
            code: appErr.code,
            message: status >= 500 ? 'Something went wrong. Quote the request id when reporting it.' : appErr.message,
            ...(appErr.details !== undefined && status < 500 ? { details: appErr.details } : {}),
            requestId: meta.requestId,
          },
        },
        status,
        meta.requestId,
      );
    } finally {
      log.info('api.request', {
        method: contract.method,
        route: contract.path,
        status,
        ms: Date.now() - started,
        requestId: meta.requestId,
      });
    }
  };
}

function parse<T extends z.ZodType>(schema: T, value: unknown, where: string): z.output<T> {
  const r = schema.safeParse(value);
  if (!r.success) throw badRequest(`Invalid ${where}.`, z.flattenError(r.error));
  return r.data;
}

function toAppError(err: unknown): AppError {
  if (isAppError(err)) return err;
  if (err instanceof z.ZodError) return badRequest('Invalid input.', z.flattenError(err));
  return new AppError('INTERNAL', err instanceof Error ? err.message : String(err));
}

function json(data: unknown, status: number, requestId: string) {
  return NextResponse.json(data, { status, headers: { 'x-request-id': requestId, 'cache-control': 'no-store' } });
}
