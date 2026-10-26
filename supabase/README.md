# supabase/

- `migrations/`: SQL migrations, applied in filename order. Generated from `packages/db/src/schema` with
  `pnpm db:generate`, plus hand-written files for Supabase-only features (RLS, triggers, the FK to
  `auth.users`). The `meta/` folder is Drizzle's bookkeeping; do not edit it.
- `config.toml`: local Supabase stack for `supabase start` (Docker).

Migrations are applied:

| Where | How |
| --- | --- |
| Vercel deploys (preview and production) | `pnpm run vercel-build` runs `pnpm db:migrate` before `next build` |
| Locally | `supabase db reset` (fresh) or `pnpm db:migrate` |
| CI | applied to a throwaway Postgres to prove they run cleanly |

There is one hosted database for now, shared by preview and production deploys. Keep migrations additive
(add columns/tables; do not drop or rename in the same release that stops using them).
