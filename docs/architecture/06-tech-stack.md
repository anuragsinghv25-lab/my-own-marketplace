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
2. **Boring, well-documented, self-hostable.** Government-style deployments often need on-prem or in-country hosting; avoid lock-in to one SaaS.
3. **Postgres does as much as it reasonably can** (data, JSON, search, vectors, job queue) until a dedicated tool is clearly needed.
4. **Config as data, rules as data.** Flags, rules and review definitions are stored and versioned, not coded.

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
| API | **NestJS** (REST + OpenAPI) | Next.js route handlers only; Fastify + tRPC; Hono | Modules map 1:1 to bounded contexts; guards for authz; generated OpenAPI → typed client for web and for sellers' own integrations |
| Database | **PostgreSQL 17+** with **JSONB**, `pg_trgm`, full-text search, **pgvector** | MySQL; MongoDB | Relational core + flexible spec values in JSONB + vectors in one engine |
| ORM / SQL | **Drizzle ORM + drizzle-kit migrations** | Prisma 7 | Schema in TypeScript, SQL-level control for JSONB and complex joins, no generate step ([comparison](https://makerkit.dev/blog/tutorials/drizzle-vs-prisma)) |
| Background jobs | **pg-boss** (Postgres-backed queue) | BullMQ (Redis), Temporal, Inngest | No Redis to run; cron, retries, dead-letter, singleton jobs; job state is transactional with data ([comparison](https://www.pkgpulse.com/guides/bullmq-vs-bee-queue-vs-pg-boss-job-queues-nodejs-2026)) |
| Approval workflows | **Own review engine** (state machines in `packages/domain`, persisted in Postgres, timers via pg-boss) | Temporal, Camunda | Approvals are long-running human waits with simple state; Temporal's durable execution is powerful but adds a server and a steep learning curve ([review](https://www.devtoolreviews.com/reviews/temporal-vs-inngest-vs-trigger-dev-vs-bullmq-2026)). Revisit if workflows become multi-system sagas |
| Business rules | **GoRules ZEN engine** (JSON decision graphs, MIT, Node binding) | json-rules-engine, hand-written code | Price bounds, certificate applicability, risk scoring stored as versionable JSON decision tables editable in a visual editor ([zen-engine](https://www.pypi.org/project/zen-engine)) |
| Schema validation | **Ajv** (JSON Schema) for contracts, **Zod** for API DTOs | Yup | Contracts are JSON Schema so the same file serves API, browser, bulk validator and AI structured output |
| Authentication | **Better Auth** (self-hosted; email/password, OTP, passkeys; organization plugin for seller orgs) | Auth.js, Keycloak, Clerk | Self-hosted TypeScript library with organizations, members, custom roles and teams ([organization plugin](https://better-auth.com/docs/1.6/plugins/organization.md)); OIDC to an external IdP (e.g. Keycloak / government SSO) can be added later |
| Authorisation | **CASL** policies in `packages/authz` (role + scope + conditions) | Cerbos, OpenFGA, Casbin | Same typed rules on server and in React for hiding buttons ([comparison](https://www.pkgpulse.com/guides/casl-vs-casbin-vs-accesscontrol-authorization-rbac-2026)); move to Cerbos if policies must be managed outside code ([Cerbos vs OpenFGA](https://www.cerbos.dev/cerbos-vs-openfga)) |
| Files | **S3-compatible storage** (MinIO locally) with signed URLs | DB blobs | Standard, cheap, works on any cloud |
| AI | **Provider-agnostic AI gateway** (Vercel AI SDK or similar) with structured outputs; **pgvector** for embeddings | Direct provider SDKs | Swap models per task; one place for prompts, cost tracking and guardrails |
| Search (later) | Postgres FTS first → **OpenSearch** or **Meilisearch** when buyer search needs facets at scale | Elasticsearch | Avoid a second datastore until it pays for itself |
| Email | SMTP provider; **Mailpit** locally; React Email templates | — | Simple |
| Testing | **Vitest** (unit), **Testcontainers** (DB integration), **Playwright** (end-to-end per role) | Jest, Cypress | Fast; real Postgres in tests |
| Quality | ESLint, Prettier, TypeScript strict, **dependency-cruiser** for module boundaries | — | Keep the modular monolith modular |
| Observability | **OpenTelemetry** traces + structured logs; Sentry-style error tracking | — | Follow one request from web to worker |
| Local dev | **Docker Compose**: Postgres (pgvector image), MinIO, Mailpit | — | One command to run everything |
| CI/CD | **GitHub Actions**: lint, typecheck, test, build, migrations check | — | Lives with the repo |
| Hosting | Containers on a managed platform or Kubernetes in an Indian region; managed Postgres | Serverless-only | Long-running worker and Postgres queue need always-on processes |
| Runtime | **Node.js 22 LTS** (upgrade to 24 LTS when dependencies are ready) | Bun, Deno | Ecosystem compatibility |

## Decisions that are deliberately reversible

| If this happens… | …switch to |
| --- | --- |
| Approval flows span many external systems with compensations | Temporal |
| Policies must be edited by non-developers or shared with non-TS services | Cerbos |
| Buyer search needs heavy faceting, typo tolerance, ranking at scale | OpenSearch / Meilisearch fed from the outbox |
| Job throughput outgrows Postgres | BullMQ on Redis, same job interfaces |
| A module needs independent scaling | Extract it as a service; its tables and events are already isolated |

See the [ADRs](../adr/) for the reasoning behind each major choice.
