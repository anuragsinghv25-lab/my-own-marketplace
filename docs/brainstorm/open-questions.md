# Open questions for technical brainstorming

Decisions we need before or during R0–R2. Each has a default we will use if nobody objects.

| # | Question | Options | Default if undecided |
| --- | --- | --- | --- |
| Q1 | Single Next.js app with role route groups, or separate apps per audience (seller app vs back-office)? | One app · Two apps sharing `packages/ui` | **One app** now; split into `web-seller` and `web-console` only if bundle size or release cadence diverge |
| Q2 | Multi-tenant (several marketplaces on one install) or single marketplace? | Single · Tenant column everywhere | **Single**, but keep a `marketplace_id` on top-level config so tenancy is possible later |
| Q3 | Taxonomy standard | ~~UNSPSC L1–L4 + own L5 · Own tree · Shopify taxonomy as seed~~ **Decided (R1.1):** variable-depth tree; adopt from Shopify (bundled) and UNSPSC (uploaded), custom anywhere; UNSPSC code as a mapping ([ADR 0009](../adr/0009-standard-taxonomies.md)) | — |
| Q4 | Who may override flags per category vs only via profiles? | Free override · Profile-only with exception requests | **Profile + overrides**, overrides highlighted in review |
| Q5 | Variants in MVP? | ~~Yes · Later~~ **Decided (R1.1):** yes, Shopify-style options from the category attribute set in **R5**; bulk variant matrices in R8 | — |
| Q6 | Should catalogs created against an old category version stay sellable? | Yes until cool-off ends · Only for existing bids | **Yes until the cool-off period ends**, then ACTION_REQUIRED |
| Q7 | Risk lanes at launch | Amber only · All three | **Amber only**; green and red behind per-category switches |
| Q8 | Staff login | Supabase Auth accounts · External SAML/OIDC (Keycloak/SSO) | **Supabase Auth** first; SSO when a real IdP exists |
| Q9 | AI provider | One provider · Gateway with per-task models | **Gateway**, one provider configured initially |
| Q10 | Hosting target | ~~Open~~ **Decided:** Vercel + Supabase, Mumbai regions ([ADR 0008](../adr/0008-vercel-and-supabase.md)) | — |
| Q11 | Languages | English only · English + Hindi | **English**, i18n plumbing from R0 |
| Q12 | Rules engine | GoRules ZEN · json-rules-engine · code | **ZEN** pending the checks in ADR 0007 |

| Q13 | Shopify release cadence | Follow every release · Pin and upgrade yearly | **Follow each stable release** (about twice a year): regenerate the bundle, admin clicks Update, category team reviews the diff in R6 |
| Q14 | UNSPSC licence | Upload per deployment · Ship with Orbita | **Upload per deployment**; the operator confirms their UNSPSC terms of use |

## Brainstorm parking lot

- Contract "test cases": let category teams attach sample products that must pass/fail before publish.
- Synthetic catalog sandbox: generate fake products from a contract to preview filters and comparisons.
- Read-only public API for sellers' ERPs from R5; write API with validate-only mode in R8.
- Event catalogue: publish domain events (`category.version.published`, `product.submitted`, …) with JSON schemas so integrations can subscribe later.
