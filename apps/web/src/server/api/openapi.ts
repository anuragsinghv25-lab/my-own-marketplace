import { z } from 'zod';
import { contracts, errorSchema, type Contract } from './contracts';

const schema = (s: z.ZodType, io: 'input' | 'output') =>
  z.toJSONSchema(s, { io, target: 'draft-2020-12', unrepresentable: 'any' });

/** OpenAPI 3.1 document generated from the contracts. */
export function buildOpenApi(serverUrl: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [name, c] of Object.entries(contracts) as [string, Contract][]) {
    const parameters: unknown[] = [];
    for (const [where, obj] of [
      ['path', c.params],
      ['query', c.query],
    ] as const) {
      if (!obj) continue;
      for (const [key, field] of Object.entries(obj.shape)) {
        parameters.push({
          name: key,
          in: where,
          required: where === 'path' ? true : !(field as z.ZodType).safeParse(undefined).success,
          schema: schema(field as z.ZodType, 'input'),
        });
      }
    }
    paths[c.path] ??= {};
    paths[c.path]![c.method.toLowerCase()] = {
      operationId: name,
      summary: c.summary,
      tags: [c.tag],
      security: c.auth === 'public' ? [] : [{ supabaseSession: [] }, { bearer: [] }],
      ...(parameters.length ? { parameters } : {}),
      ...(c.body
        ? { requestBody: { required: true, content: { 'application/json': { schema: schema(c.body, 'input') } } } }
        : {}),
      responses: {
        [String(c.successStatus ?? 200)]: {
          description: 'Success',
          content: { 'application/json': { schema: schema(c.response, 'output') } },
        },
        default: {
          description: 'Error',
          content: { 'application/json': { schema: schema(errorSchema, 'output') } },
        },
      },
    };
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Orbita API',
      version: 'v1',
      description:
        'Errors always use `{ error: { code, message, details?, requestId } }`. Every response carries an `x-request-id` header.',
    },
    servers: [{ url: serverUrl }],
    components: {
      securitySchemes: {
        supabaseSession: { type: 'apiKey', in: 'cookie', name: 'sb-<project>-auth-token' },
        bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'Supabase access token (JWT)' },
      },
    },
    paths,
  };
}
