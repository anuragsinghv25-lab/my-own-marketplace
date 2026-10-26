# 0002 · TypeScript monorepo: Next.js web + NestJS API + worker

- **Status:** Accepted
- **Date:** 2026-10-27

## Context
The Orbita prototype is React + Tailwind. We need many role-specific UIs, a rich API (also for sellers' own integrations and bulk tools), and background processing. Validation and rule logic must run both in the browser (live hints) and on the server (enforcement).

## Decision
- `pnpm` workspaces + Turborepo monorepo.
- `apps/web`: Next.js (App Router) for all UIs, with route groups per area (`seller`, `workbench`, `review`, `admin`).
- `apps/api`: NestJS REST API with OpenAPI; the only writer of business data.
- `apps/worker`: NestJS standalone app running pg-boss consumers, sharing modules with the API.
- Shared packages: `domain`, `contract`, `rules`, `authz`, `db`, `ui`, `ai`, `config`.

## Consequences
- One language and one type system across the stack; shared rules run in both places.
- Next.js does not hold business logic; it renders and calls the API (server components call it server-side with the user's session).
- Two frameworks (Next.js, NestJS) to learn, but each is used for what it is best at.

## Alternatives considered
- **Next.js only (server actions as backend):** less to run, but business rules get tied to UI routes and are awkward to expose as a public API or reuse in workers.
- **Fastify/Hono + tRPC:** lighter and very type-safe, but tRPC is less suited to a public, documented API for sellers and integrators.
- **Java/Spring backend:** strong in enterprise, but loses shared TypeScript rules with the UI.
