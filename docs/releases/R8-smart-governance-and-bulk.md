# R8 · Smart governance and bulk

**Goal:** reviewers spend time only where risk is; admins run categories from instruments instead of inboxes; large sellers onboard thousands of products.

**Depends on:** R7 (AI signals feed risk). **Indicative size:** 3–4 sprints.

## Scope

### Governance

| ID | Feature | Details |
| --- | --- | --- |
| F8.1 | Risk scoring | Per request: seller history, VA status, brand verification, AI findings/overrides, seller-typed free values, price outliers, category sensitivity → score + explanation |
| F8.2 | Traffic-light lanes | Green (auto-approve + sampled audit) · Amber (one reviewer) · Red (two reviewers) · Escalation; switched on per category and per subject type |
| F8.3 | Post-approval sampling | Random sample of green-lane approvals queued for audit review; findings tune thresholds |
| F8.4 | Change classes for categories | Cosmetic / minor / major computed from the contract diff; cosmetic publishes with checker only; maker-checker kept for major |
| F8.5 | SLA automation | Auto-escalation, load balancing across reviewers, absence reassignment |
| F8.6 | Reason-code analytics | Top rejection reasons per category → ticket against the category definition when a spec is the root cause |

### Admin cockpit

| ID | Feature | Details |
| --- | --- | --- |
| F8.7 | Category health | Per category: products, sellers, rejection rate and top reasons, pending LoV requests, unused filters, specs rarely filled, distance from buyer go-live catalog count |
| F8.8 | Bulk config changes | Apply a flag or rule change to many categories with impact preview and one approval |
| F8.9 | Config history | Diff and rollback for profiles, flags definitions, review definitions |
| F8.10 | Go-live calendar | Scheduled publishes, downtimes and version releases on one calendar |

### Sellers at scale

| ID | Feature | Details |
| --- | --- | --- |
| F8.11 | Bulk variant matrices | Building on R5's variants (options from the category attribute set): generate dozens of variants at once from a matrix (e.g. 6 colours × 4 sizes), bulk-edit their prices, stock and images, and review them as one request |
| F8.12 | Bulk create / pair | Browser grid and file upload (Excel/CSV); AI maps the seller's own column names; server-side validation against the contract; drafts submitted in bulk once clean |
| F8.13 | Seller API | Authenticated REST API for products and offers with validate-only mode; API keys per seller org |

## Exit demo

1. Green lane enabled for Gaming laptops brand requests from verified OEMs: low-risk test requests auto-approve and a configured share of them is sampled for audit.
2. Category health shows "RAM" as the top rejection cause; the checker fixes the value list.
3. A seller uploads 200 rows from their own spreadsheet; columns auto-mapped; 180 pass, 20 show row-level errors.
