# Architecture Decision Records

Short records of significant decisions: the context, what we chose, and what it costs us. New decisions get the next number; superseded ones stay, marked as such.

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-modular-monolith.md) | Start as a modular monolith | Accepted |
| [0002](0002-typescript-monorepo.md) | TypeScript monorepo: Next.js web + NestJS API + worker | Amended by 0008 |
| [0003](0003-postgres-drizzle-jsonb.md) | PostgreSQL with Drizzle; spec values in JSONB | Accepted |
| [0004](0004-category-contract.md) | Compile each category version into an immutable Category Contract | Accepted |
| [0005](0005-review-engine-and-jobs.md) | Own generic review engine on Postgres + pg-boss | Amended by 0008 |
| [0006](0006-auth-and-authorization.md) | Better Auth for authentication, CASL for authorisation | Amended by 0008 |
| [0007](0007-rules-as-data.md) | Business rules as data with GoRules ZEN | Superseded by 0010 |
| [0008](0008-vercel-and-supabase.md) | Deploy on Vercel with Supabase (Postgres, Auth, Storage) | Accepted |
| [0009](0009-standard-taxonomies.md) | Shopify-style variable-depth tree; adopt from Shopify and UNSPSC | Accepted |
| [0010](0010-typed-rules-in-the-contract.md) | Typed category rules compiled into the contract | Accepted |

Template: [`0000-template.md`](0000-template.md)
