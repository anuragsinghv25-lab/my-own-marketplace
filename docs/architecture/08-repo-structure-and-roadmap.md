# 08 · Repository structure and roadmap

## Target repository layout

```
my-own-marketplace/
├─ apps/
│  └─ web/                    Next.js app deployed to Vercel
│     ├─ app/
│     │  ├─ (auth)/           login, invite, reset
│     │  ├─ (seller)/         brand center, catalogs, offers, action centre, opportunities
│     │  ├─ (workbench)/      taxonomy, category versions, spec builder, rule canvas, publish
│     │  ├─ (review)/         review desk: queues, request detail, decisions
│     │  ├─ (admin)/          users, roles, workgroups, attribute library, flag profiles, audit
│     │  ├─ (marketplace)/    read-only category listing and product pages
│     │  └─ api/v1/           route handlers (thin adapters over packages/modules)
│     ├─ workflows/           Vercel Workflows (durable jobs) calling module use cases
│     └─ vercel.json          crons, function regions
├─ packages/
│  ├─ modules/                one folder per bounded context: domain, application, infrastructure
│  ├─ ui/                     Orbita design system: tokens.css, Tailwind preset, components
│  ├─ domain/                 shared kernel: ids, money, units, state machine helpers
│  ├─ contract/               category contract compiler, differ, validators (Ajv)
│  ├─ rules/                  decision-rule evaluation + fixtures
│  ├─ authz/                  CASL abilities: roles, scopes, conditions
│  ├─ db/                     Drizzle schema, migrations, seed data
│  ├─ ai/                     AI gateway client, prompt templates, structured-output schemas
│  └─ config/                 shared tsconfig, eslint, prettier presets
├─ supabase/                  Supabase CLI config, storage policies, local seed
├─ prototype/orbita/          original prototype, reference only
├─ docs/                      architecture, releases, ADRs, design system, brainstorm
└─ .github/workflows/         CI
```

## Roadmap

The detailed scope of every release is in **[docs/releases](../releases/README.md)**: ten releases (R0–R9) grouped into three milestones.

| Milestone | Releases | Outcome |
| --- | --- | --- |
| MVP · pilot | R0 Foundations · R1 Library & taxonomy · R2 Config studio + contract · R3 Category approval · R4 Sellers & brands · R5 Catalog creation & approval | Full chain for a pilot group: category → brand → catalog → review → marketplace preview |
| V1 · public launch | R6 Maintenance & versioning · R7 AI assist | Catalogs stay correct over time; AI fills most of the typing |
| V2 · scale | R8 Smart governance & bulk · R9 Growth & intelligence | Risk-based review, bulk onboarding, opportunity engine, AI category drafter |

## Immediate next steps

1. Create the Vercel and Supabase accounts ([09 · Deployment](09-deployment-and-services.md#what-you-need-to-do-and-when)).
2. Agree the open questions in [`docs/brainstorm/open-questions.md`](../brainstorm/open-questions.md).
3. Build **R0** (monorepo, Supabase CLI, Orbita UI shell, auth, roles, audit, CI, first Vercel deploy).
