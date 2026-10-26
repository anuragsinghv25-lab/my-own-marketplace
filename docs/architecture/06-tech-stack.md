# 06 · Tech stack

## Why move beyond a single HTML file

The Orbita prototype is a compiled React bundle inside one HTML file, with static demo data. That was the right tool for proving the UX. It cannot do what the real product needs:

| Need | Single HTML file | Real app |
| --- | --- | --- |
| Login, roles, sessions | None | Server-side auth, role- and attribute-based permissions |
| Shared data between sellers, admins, reviewers | None (browser only) | One database, one source of truth |
| Category config that changes catalog behaviour | Hard-coded demo rules | Versioned config compiled into contracts |
| Approvals, timers, notifications | Simulated | Durable workflow engine and background jobs |
| Real AI | Scripted answers | AI gateway with structured outputs |
| Audit trail | None | Append-only, per change |
| Team development | One minified file | Typed source, tests, CI, code review |

## Guiding principles for choosing

1. **One language end to end: TypeScript.** The prototype is already React; one language lets the same validation and rule code run in the browser (live hints) and on the server (enforcement).
2. **Boring, well-documented, portable.** Business logic never imports Vercel or Supabase directly, so an on-prem or in-country deployment stays possible later.
3. **Postgres does as much as it reasonably can** (data, JSON, search, vectors) until a dedicated tool is clearly needed.
4. **Config as data, rules as data.** Flags, rules and review definitions are stored and versioned, not coded.
5. **Deployable on Vercel from the GitHub repo**, with Supabase for data, auth and files ([ADR 0008](../adr/0008-vercel-and-supabase.md)).

## The stack

| Layer | Choice | Main alternatives considered | Why this one |
| --- | --- | --- | --- |
| Monorepo | **pnpm workspaces + Turborepo** | Nx, npm workspaces | Fast, simple, cached builds; shared packages for domain rules and UI |
| Web app | **Next.js 16 (App Router) + React 19** | Vite SPA + React Router; Remix | Server rendering per role, one routing model, mature; Next.js 16.4 shipped Oct 2026 ([Next.js blog](https://nextjs.org/blog)) |
| Styling | **Tailwind CSS** with Orbita tokens as CSS variables | CSS modules, styled-components | The prototype is already Tailwind; tokens port 1:1 ([design notes](../design/orbita-design-system.md)) |
| Components | **Radix UI primitives + own components** (shadcn/ui-style, copied into `packages/ui`), **Lucide** icons | MUI, Ant Design | Full control to match Orbita exactly; accessible primitives; Lucide is what the prototype uses |
| Forms | **React Hook Form + Zod**, plus a **contract-driven form renderer** | Formik | Category contracts generate the seller forms; Zod/Ajv validate on both sides |
| Data grids | **TanStack Table** | AG Grid | Bulk price/stock grid, spec lists, review queues |
| Diagram editors | **React Flow (xyflow)** | GoJS, JointJS | Dependency-rule canvas, workflow views |
| Client data | **TanStack Query** | SWR | Caching, optimistic updates in heavy editors |
| API | **Next.js route handlers (`/api/v1`) + server actions** over framework-free modules in `packages/modules` | NestJS (needs an always-on server); Fastify + tRPC; Hono | Deploys on Vercel with the UI; modules keep bounded contexts clean; OpenAPI generated from Zod schemas for sellers' own integrations ([ADR 0008](../adr/0008-vercel-and-supabase.md)) |
| Database | **PostgreSQL on Supabase** with **JSONB**, `pg_trgm`, full-text search, **pgvector** | MySQL; MongoDB; Neon | Relational core + flexible spec values in JSONB + vectors in one engine; Mumbai region available |
| ORM / SQL | **Drizzle ORM + drizzle-kit migrations** | Prisma 7 | Schema in TypeScript, SQL-level control for JSONB and complex joins, no generate step ([comparison](https://makerkit.dev/blog/tutorials/drizzle-vs-prisma)) |
| Background jobs | **Vercel Workflows** (durable steps, sleeps, hooks) + **Vercel Cron** | pg-boss, BullMQ, Inngest, Supabase Queues | Native to Vercel, in the same codebase, survives deploys, waits minutes to months without compute ([Workflow concepts](https://vercel.com/docs/workflows/concepts.md)) |
| Approval workflows | **Own review engine** (state machines in `packages/domain`, state persisted in Postgres; timers and reminders via Vercel Workflows) | Temporal, Camunda | Approvals are long human waits with simple state; Postgres stays the source of truth, workflows only orchestrate |
| Business rules | **GoRules ZEN engine** (JSON decision graphs, MIT, Node binding) | json-rules-engine, hand-written code | Price bounds, certificate applicability, risk scoring stored as versionable JSON decision tables editable in a visual editor ([zen-engine](https://www.pypi.org/project/zen-engine)) |
| Schema validation | **Ajv** (JSON Schema) for contracts, **Zod** for API DTOs | Yup | Contracts are JSON Schema so the same file serves API, browser, bulk validator and AI structured output |
| Authentication | **Supabase Auth** (email/password, OTP/magic link, MFA) | Better Auth, Auth.js, Clerk, Keycloak | Comes with the Supabase project, integrates with Storage policies, nothing extra to host; roles and scopes stay in our tables ([ADR 0008](../adr/0008-vercel-and-supabase.md)) |
| Authorisation | **CASL** policies in `packages/authz` (role + scope + conditions) | Cerbos, OpenFGA, Casbin | Same typed rules on server and in React for hiding buttons ([comparison](https://www.pkgpulse.com/guides/casl-vs-casbin-vs-accesscontrol-authorization-rbac-2026)); move to Cerbos if policies must be managed outside code ([Cerbos vs OpenFGA](https://www.cerbos.dev/cerbos-vs-openfga)) |
| Files | **Supabase Storage** (S3-compatible) with signed upload URLs | Vercel Blob, AWS S3 | Same vendor as the database; direct browser uploads avoid Vercel's 4.5 MB body limit |
| AI | **Provider-agnostic AI gateway** (Vercel AI SDK or similar) with structured outputs; **pgvector** for embeddings | Direct provider SDKs | Swap models per task; one place for prompts, cost tracking and guardrails |
| Search (later) | Postgres FTS first → **OpenSearch** or **Meilisearch** when buyer search needs facets at scale | Elasticsearch | Avoid a second datastore until it pays for itself |
| Email | **Resend** + React Email templates (Supabase CLI's local mail catcher in dev) | Any SMTP provider | Simple API, works well from Vercel functions |
| Testing | **Vitest** (unit), **Testcontainers** (DB integration), **Playwright** (end-to-end per role) | Jest, Cypress | Fast; real Postgres in tests |
| Quality | ESLint, Prettier, TypeScript strict, **dependency-cruiser** for module boundaries | — | Keep the modular monolith modular |
| Observability | Vercel logs and Workflows dashboard + **Sentry**; structured logs with request id | OpenTelemetry collector | Enough for this stage; OTel can be added later |
| Local dev | **Supabase CLI** (Postgres, Auth, Storage, Studio, mail catcher in Docker) + `pnpm dev` | Hand-made Docker Compose | Same services locally as in the cloud |
| CI/CD | **GitHub Actions**: lint, typecheck, test, build, migrations check | — | Lives with the repo |
| Hosting | **Vercel** (region `bom1`, Mumbai) + **Supabase** (region `ap-south-1`, Mumbai) | Containers on Railway/Render/AWS | Deploy straight from GitHub with preview environments; no servers to run ([09 · Deployment](09-deployment-and-services.md)) |
| Runtime | **Node.js** runtime on Vercel Functions (current LTS); Node 22 LTS locally | Edge runtime | Full Node API coverage needed for rules engine and PDF processing |

## Decisions that are deliberately reversible

| If this happens… | …switch to |
| --- | --- |
| Approval flows span many external systems with compensations | Temporal |
| Background jobs outgrow Vercel Workflows or we leave Vercel | Inngest or Supabase Queues; workflow code only calls module use cases |
| Policies must be edited by non-developers or shared with non-TS services | Cerbos |
| Buyer search needs heavy faceting, typo tolerance, ranking at scale | Meilisearch / Typesense / OpenSearch fed from the outbox |
| Staff need single sign-on with a government or corporate IdP | Supabase Auth SAML/OIDC, or an external IdP |
| A module needs independent scaling | Extract it as a service; its tables and events are already isolated |

See the [ADRs](../adr/) for the reasoning behind each major choice.
