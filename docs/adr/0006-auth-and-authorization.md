# 0006 · Better Auth for authentication, CASL for authorisation

- **Status:** Accepted, amended by [0008](0008-vercel-and-supabase.md): authentication moves to Supabase Auth; CASL authorisation stands
- **Date:** 2026-10-27

## Context
Many roles on two sides (platform staff and seller organisations), with permissions that depend on role, scope (workgroup, organisation, division, brand) and object state (draft vs published, owner vs paired seller, maker vs approver). Self-hosting matters.

## Decision
- **Authentication:** Better Auth, self-hosted, storing users and sessions in our Postgres. Email + password and email OTP first; passkeys next. Its organization plugin models seller organisations and members. An external OIDC identity provider (e.g. Keycloak or a government SSO) can be plugged in later for staff.
- **Authorisation:** our own `packages/authz` built on **CASL**: abilities computed from role grants + scopes + conditions; evaluated in the API on every request and reused in React only to hide or disable actions. Platform roles and workgroup scopes live in our tables, not in the auth library.
- Every allow/deny on a governed action is audited.

## Consequences
- No per-user SaaS cost or data leaving our infrastructure.
- Policies are typed code with unit tests; changing them needs a deploy.
- Separation-of-duties rules (maker ≠ approver) are conditions in one place.

## Alternatives considered
- **Keycloak as the only IAM:** strong SSO and admin UI, but fine-grained object conditions still need app-side logic, and it is a heavy service to run from day one.
- **Clerk / hosted auth:** fast, but user data on third-party servers.
- **Cerbos / OpenFGA:** right when policies must be managed outside code or relationships become graph-like; kept as the upgrade path.
