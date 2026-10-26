import { z } from 'zod';
import { ROLE_KEYS } from '@orbita/authz';
import { grantInputSchema, inviteInputSchema, userFilterSchema } from '@orbita/identity';

/**
 * Every /api/v1 route is declared here first. Route files import their contract, so
 * input validation, the OpenAPI document and the contract test all come from one place.
 * (test/api-contracts.test.ts fails if a route file has no contract or vice versa.)
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface Contract {
  method: HttpMethod;
  /** OpenAPI-style path, e.g. /api/v1/admin/users/{id} */
  path: string;
  summary: string;
  tag: string;
  auth: 'public' | 'session';
  params?: z.ZodObject;
  query?: z.ZodObject;
  body?: z.ZodType;
  response: z.ZodType;
  successStatus?: number;
}

const isoDate = z.iso.datetime();
const idParams = z.object({ id: z.uuid() });

const grantView = z.object({
  id: z.uuid(),
  role: z.enum(ROLE_KEYS),
  roleLabel: z.string(),
  scopeType: z.enum(['global', 'workgroup', 'org', 'brand']),
  scopeId: z.uuid().nullable(),
  grantedAt: isoDate,
});

const userView = z.object({
  id: z.uuid(),
  email: z.email(),
  fullName: z.string(),
  kind: z.enum(['staff', 'seller']),
  status: z.enum(['invited', 'active', 'deactivated']),
  invitedAt: isoDate.nullable(),
  activatedAt: isoDate.nullable(),
  lastSeenAt: isoDate.nullable(),
  createdAt: isoDate,
  grants: z.array(grantView),
});

const auditEvent = z.object({
  id: z.number().int(),
  occurredAt: isoDate,
  actorId: z.uuid().nullable(),
  actorEmail: z.string().nullable(),
  action: z.string(),
  subjectType: z.string(),
  subjectId: z.string().nullable(),
  summary: z.string(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  meta: z.unknown().nullable(),
  requestId: z.string().nullable(),
});

export const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string(),
  }),
});

export const contracts = {
  health: {
    method: 'GET',
    path: '/api/v1/health',
    summary: 'Liveness and database check',
    tag: 'System',
    auth: 'public',
    response: z.object({
      status: z.enum(['ok', 'degraded']),
      database: z.enum(['ok', 'error', 'not_configured']),
      version: z.string(),
      time: isoDate,
    }),
  },
  openapi: {
    method: 'GET',
    path: '/api/v1/openapi.json',
    summary: 'This API description (OpenAPI 3.1)',
    tag: 'System',
    auth: 'public',
    response: z.record(z.string(), z.unknown()),
  },
  me: {
    method: 'GET',
    path: '/api/v1/me',
    summary: 'The signed-in user, roles and accessible areas',
    tag: 'Identity',
    auth: 'session',
    response: z.object({
      id: z.uuid(),
      email: z.email(),
      fullName: z.string(),
      status: z.enum(['invited', 'active', 'deactivated']),
      roles: z.array(z.object({ role: z.enum(ROLE_KEYS), label: z.string(), scopeType: z.string(), scopeId: z.uuid().nullable() })),
      areas: z.array(z.string()),
      homePath: z.string(),
    }),
  },
  listUsers: {
    method: 'GET',
    path: '/api/v1/admin/users',
    summary: 'List users with their active role grants',
    tag: 'Admin',
    auth: 'session',
    query: userFilterSchema,
    response: z.object({ items: z.array(userView) }),
  },
  inviteUser: {
    method: 'POST',
    path: '/api/v1/admin/users',
    summary: 'Invite a user and grant roles (sends the invite email)',
    tag: 'Admin',
    auth: 'session',
    body: inviteInputSchema,
    response: z.object({ user: userView, manualLink: z.url().nullable() }),
    successStatus: 201,
  },
  getUser: {
    method: 'GET',
    path: '/api/v1/admin/users/{id}',
    summary: 'One user with active role grants',
    tag: 'Admin',
    auth: 'session',
    params: idParams,
    response: userView,
  },
  grantRole: {
    method: 'POST',
    path: '/api/v1/admin/users/{id}/roles',
    summary: 'Grant a role to a user',
    tag: 'Admin',
    auth: 'session',
    params: idParams,
    body: grantInputSchema,
    response: userView,
    successStatus: 201,
  },
  revokeRole: {
    method: 'DELETE',
    path: '/api/v1/admin/users/{id}/roles/{grantId}',
    summary: 'Revoke a role grant',
    tag: 'Admin',
    auth: 'session',
    params: z.object({ id: z.uuid(), grantId: z.uuid() }),
    response: userView,
  },
  setUserStatus: {
    method: 'POST',
    path: '/api/v1/admin/users/{id}/status',
    summary: 'Deactivate or reactivate a user',
    tag: 'Admin',
    auth: 'session',
    params: idParams,
    body: z.object({ active: z.boolean() }),
    response: userView,
  },
  listAudit: {
    method: 'GET',
    path: '/api/v1/admin/audit',
    summary: 'Audit events, newest first (cursor pagination)',
    tag: 'Admin',
    auth: 'session',
    query: z.object({
      actor: z.string().max(200).optional(),
      action: z.string().max(100).optional(),
      subjectType: z.string().max(50).optional(),
      subjectId: z.string().max(100).optional(),
      q: z.string().max(200).optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      limit: z.coerce.number().int().min(1).max(200).optional(),
      before: z.coerce.number().int().positive().optional(),
    }),
    response: z.object({ items: z.array(auditEvent), nextCursor: z.number().int().nullable() }),
  },
} satisfies Record<string, Contract>;

export type ContractName = keyof typeof contracts;
