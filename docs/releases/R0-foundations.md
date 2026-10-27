# R0 · Foundations

**Goal:** a deployed, secure, Orbita-styled application shell where every role can log in and land on its own home page. No business features yet, but every later release plugs into what R0 builds.

**Depends on:** nothing. **Indicative size:** 2 sprints. **Status:** built. Deploy with [docs/setup/deploy-r0.md](../setup/deploy-r0.md).

## Scope

| ID | Feature | Details | Acceptance |
| --- | --- | --- | --- |
| F0.1 | Monorepo | pnpm workspaces + Turborepo; `apps/web` (Next.js), `packages/{ui,domain,db,authz,config}`; TypeScript strict; ESLint, Prettier; dependency-cruiser module rules | `pnpm build` and `pnpm test` pass from a clean clone |
| F0.2 | Environments | Supabase project (Mumbai region) for staging; Vercel project linked to the GitHub repo; preview deployment on every pull request; production on `main` | Push to a PR branch produces a working preview URL |
| F0.3 | Local development | Supabase CLI local stack (Postgres, Auth, Storage, Studio) in Docker; seed script; `.env.example` | New developer runs the app locally in under 15 minutes from the README |
| F0.4 | Database tooling | Drizzle schema + migrations in `packages/db`; migrations run in CI and on deploy; connection through the Supabase pooler for serverless | A migration added in a PR is applied to the preview database |
| F0.5 | Orbita design system | `packages/ui`: tokens (light + dark), Tailwind preset, Inter font, Lucide icons; base components: button, input, select, textarea, checkbox, radio, switch, badge/chip, card, tabs, table, dialog, drawer, toast, tooltip, stepper, empty state, skeleton | Storybook-style gallery page matches the prototype side by side |
| F0.6 | App shell | Sidebar navigation driven by role; top bar with search/command palette (⌘K), notifications bell, theme toggle, user menu; responsive down to tablet | Each role sees only its own menu items |
| F0.7 | Authentication | Supabase Auth: email + password, email OTP / magic link, password reset; session handling in Next.js middleware; staff invited by admin, sellers self-register (verification in R4) | Login, logout, reset work; protected routes redirect to login |
| F0.8 | Roles and grants | Tables for platform roles, role grants with scope (global / workgroup / org); `packages/authz` with CASL abilities; server-side check helper used by every route handler; UI `<Can>` helper | Unit tests cover allow/deny for each role on a sample resource |
| F0.9 | Admin: users and roles | Platform admin can invite staff, assign/revoke roles, deactivate users | Role change takes effect on next request and is audited |
| F0.10 | Audit log | `audit_event` table; helper that writes in the same transaction as the change; admin audit viewer with filters (who, what, when) | Every write in R0 (role grants, user changes) appears in the viewer |
| F0.11 | API conventions | `/api/v1/*` route handlers; Zod-validated input; consistent error format; request id; OpenAPI generated from route schemas | Contract test checks every route has a schema |
| F0.12 | Observability | Vercel logs + Sentry for errors; structured logging helper with request id | A thrown error appears in Sentry with user and route |
| F0.13 | Email | Resend for transactional mail; React Email templates (invite, reset) | Invite email arrives with the Orbita look |
| F0.14 | CI | GitHub Actions: install, lint, typecheck, unit tests, build, migration check | Required checks on `main` |
| F0.15 | Seed data | One user per role; demo marketplace name and branding | Demo script below works on preview |

## Screens

Login · Accept invite · Reset password · Role home pages (empty states) · Admin › Users · Admin › Roles · Admin › Audit log · Design-system gallery

## Out of scope

Any category, brand or catalog data. Seller registration verification (R4). SSO with an external identity provider.

## Exit demo

1. Open the production URL; log in as the platform admin.
2. Invite a category checker; they accept and log in; they see the workbench menu only.
3. Switch dark mode; the shell matches the prototype.
4. Open the audit log; the invite and role grant are there.

## Implementation notes (as built)

| Item | Decision |
| --- | --- |
| Packages | `packages/{config,ui,domain,authz,db}` and `packages/modules/{identity,audit}`. Packages ship TypeScript source; Next compiles them (`transpilePackages`). |
| Auth emails | Invite, sign-in-link and reset emails are sent by the app through Resend using one-time links from the Supabase Admin API, so Supabase's own mailer and templates are not needed. Without Resend, admins get a copyable invite link. |
| First admin | `/setup`, protected by `SETUP_TOKEN`, works only while no platform admin exists. It can also create the demo team (one per role in R0; five accounts since R0.1). |
| Scopes before R1/R4 | Workgroups (R1) and seller organisations (R4) do not exist yet, so category roles are granted platform-wide and seller roles are attached to a fixed demo organisation id. The grant model already stores scope. |
| Separation of duties | Enforced at grant time: platform admin cannot hold approval roles; auditor cannot hold any other role. Abilities also forbid approving anything you submitted or edited. |
| Role changes | Roles are read from the database on every request, so grants and revocations apply immediately. Deactivation also bans the Supabase user. |
| Audit | `audit_events` is append-only (trigger blocks update, delete, truncate). Events are written in the same transaction as the change and carry the request id. |
| Database exposure | Row level security is on with no policies for every app table, so the public Supabase Data API cannot read them; the app connects to Postgres directly from the server. |
| Migrations | Drizzle generates SQL into `supabase/migrations`; a hand-written migration adds RLS, triggers and the FK to `auth.users`. Applied during each Vercel build. Previews share the one database. |
| API | Contracts in `apps/web/src/server/api/contracts.ts` drive validation, the OpenAPI document (`/api/v1/openapi.json`) and a test that fails if any route lacks a contract. |
| Design gallery | `/design` (public) instead of Storybook. |
| Not yet | i18n plumbing, per-PR preview databases (needs Supabase branching on a paid plan), Sentry source-map upload. |

## R0.1 · Fewer roles, demo tools

| Change | Detail |
| --- | --- |
| 18 roles → 8 | Platform admin, category manager, approver, reviewer, auditor, seller admin, seller staff, brand owner. Mapping and reasoning in [02 · Roles](../architecture/02-roles-and-permissions.md). |
| Data migration | Existing grants move to their replacement role (old grants revoked, kept as history). Template/workgroup manager grants are revoked: that work moved to the platform admin. |
| Demo team | 5 accounts instead of 16: `category-manager@`, `approver@`, `reviewer@`, `seller@`, `oem-seller@`. |
| Demo tools | Admin → Users: *Set password* on any demo account, *Set for all*, *Rebuild demo team*. Only accounts flagged as demo can have their password set by an admin. |
