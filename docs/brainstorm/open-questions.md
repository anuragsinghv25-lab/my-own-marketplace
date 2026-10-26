# Open questions for technical brainstorming

Decisions we need before or during M0–M2. Each has a default we will use if nobody objects.

| # | Question | Options | Default if undecided |
| --- | --- | --- | --- |
| Q1 | Single Next.js app with role route groups, or separate apps per audience (seller app vs back-office)? | One app · Two apps sharing `packages/ui` | **One app** now; split into `web-seller` and `web-console` only if bundle size or release cadence diverge |
| Q2 | Multi-tenant (several marketplaces on one install) or single marketplace? | Single · Tenant column everywhere | **Single**, but keep a `marketplace_id` on top-level config so tenancy is possible later |
| Q3 | Taxonomy standard | UNSPSC L1–L4 + own L5 · Own tree · Shopify taxonomy as seed | **UNSPSC-style L1–L4 + platform-defined L5** listing level, with custom L1/L2 allowed |
| Q4 | Who may override flags per category vs only via profiles? | Free override · Profile-only with exception requests | **Profile + overrides**, overrides highlighted in review |
| Q5 | Variant families in MVP? | Yes · Later | **Later (after M6)**; keep `variant_family_id` nullable from day one |
| Q6 | Should catalogs created against an old category version stay sellable? | Yes until cool-off ends · Only for existing bids | **Yes until the cool-off period ends**, then ACTION_REQUIRED |
| Q7 | Risk lanes at launch | Amber only · All three | **Amber only**; green and red behind per-category switches |
| Q8 | Staff login | Better Auth accounts · External OIDC (Keycloak/SSO) | **Better Auth** first; OIDC when a real IdP exists |
| Q9 | AI provider | One provider · Gateway with per-task models | **Gateway**, one provider configured initially |
| Q10 | Hosting target | PaaS (Render/Railway/Fly) · AWS/GCP/Azure India region · On-prem | **Managed containers + managed Postgres in an Indian region**; keep everything Docker-portable |
| Q11 | Languages | English only · English + Hindi | **English**, i18n plumbing from M0 |
| Q12 | Rules engine | GoRules ZEN · json-rules-engine · code | **ZEN** pending the checks in ADR 0007 |

## Brainstorm parking lot

- Contract "test cases": let category teams attach sample products that must pass/fail before publish.
- Synthetic catalog sandbox: generate fake products from a contract to preview filters and comparisons.
- Read-only public API for sellers' ERPs from M5; write API with validate-only mode from M6.
- Event catalogue: publish domain events (`category.version.published`, `product.submitted`, …) with JSON schemas so integrations can subscribe later.
