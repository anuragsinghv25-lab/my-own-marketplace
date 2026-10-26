# 0008 · Deploy on Vercel with Supabase

- **Status:** Accepted
- **Date:** 2026-10-27
- **Supersedes:** parts of [0002](0002-typescript-monorepo.md) (NestJS API and worker), [0005](0005-review-engine-and-jobs.md) (pg-boss) and [0006](0006-auth-and-authorization.md) (Better Auth)

## Context
The product owner wants to deploy by connecting the GitHub repo to Vercel. Vercel runs Next.js and serverless functions (up to 300 s on Hobby, 800 s on Pro; 4.5 MB request/response bodies) and provides Cron and durable **Vercel Workflows** (steps, sleeps and hooks that wait for external events such as human approvals). It does not run an always-on API server, a long-polling queue worker, or a database. The original design assumed a NestJS API, a pg-boss worker and self-hosted auth.

## Decision
1. **API inside Next.js:** `/api/v1/*` route handlers (plus server actions for simple UI mutations) are thin adapters over framework-free modules in `packages/modules/*` (one per bounded context). The modular-monolith boundaries from ADR 0001 stay; only the HTTP framework changes from NestJS to Next.js route handlers.
2. **Background work:** Vercel Workflows for durable, multi-step and long-waiting jobs (SLA timers, AI extraction, contract compilation for large categories, version migration plans, bulk uploads); Vercel Cron for daily scans (staleness, certificate expiry, draft cleanup). The review engine's state still lives in Postgres as the source of truth; workflows only orchestrate.
3. **Supabase** (Mumbai region) for Postgres, Auth and Storage, installed through the Vercel Marketplace.
4. **Authentication: Supabase Auth.** Authorisation stays in our own `packages/authz` (CASL) with platform roles, workgroup scopes and seller org memberships in our tables. Row Level Security protects Storage buckets and acts as defence in depth; the app does not let browsers query tables directly.
5. **Drizzle** connects through the Supabase pooler; migrations run against the non-pooled URL in CI.
6. **Region alignment:** Vercel functions in `bom1` (Mumbai) next to the database.

## Consequences
- One platform deploys everything from git; preview deployments per pull request; no servers to manage.
- Fewer moving parts than NestJS + worker + Redis; cost near zero while building.
- Some vendor coupling to Vercel Workflows; mitigated by keeping workflow code thin (it calls domain modules) so it can move to Inngest or Temporal if needed.
- Hobby plan is non-commercial and limits cron to daily; Pro is required before the pilot.
- File uploads must go directly to Storage (body size limit); long jobs must be split into workflow steps (duration limit).

## Alternatives considered
- **Keep NestJS + worker on Railway/Render/Fly, web on Vercel:** works, but two hosting platforms, two deploy pipelines and always-on costs from day one.
- **Neon + Better Auth + Vercel Blob:** comparable, but three vendors instead of one for data, auth and files.
- **Supabase Queues (pgmq) + Edge Functions for jobs:** viable; Vercel Workflows chosen because it lives in the same codebase and deploys with the app.
