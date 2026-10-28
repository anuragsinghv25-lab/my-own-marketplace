# R9 · Growth and intelligence

**Goal:** the platform tells sellers where demand is and tells the category team which categories to create or fix, and AI drafts new categories for humans to review.

**Depends on:** R8. **Indicative size:** 3 sprints.

## Scope

| ID | Feature | Details |
| --- | --- | --- |
| F9.1 | Opportunity engine | Signals: zero/low-result searches, categories below the buyer go-live catalog count, regional coverage gaps, class-wide brand unlocks, preference eligibility (MSE, startup, local content), price position, seasonal demand |
| F9.2 | Opportunity cards | Personal cards ("why you, how big, one button"): create, pair, add zones, request category; dismiss with reason; same signal shown fairly to all eligible sellers |
| F9.3 | Demand-led category pipeline | Cluster RMS-style category requests, zero-result searches and custom specs into category candidates for the category team |
| F9.4 | AI Category Drafter | Adopt first: if Shopify or UNSPSC already has the category, propose adopting it (R1.1) with its attributes; otherwise from a category name + path + sibling categories + standards/datasheets: draft specs, value lists, importance, preferences, rules, flag profile, with confidence and "because" lines; drafter accepts/edits/rejects |
| F9.5 | Mined dependency rules | Propose LoV → LoV rules from existing products and datasheets |
| F9.6 | Synthetic catalog sandbox | Generate fake products from a draft contract to test filters, comparisons and rules before publish |
| F9.7 | Buyer search (first cut) | Full-text + facet search on the marketplace preview; synonyms from the attribute library |
| F9.8 | Hindi | UI translation and AI assistance in Hindi |
| F9.9 | Public event feed | Documented domain events (category published, product approved…) for integrations |
| F9.10 | Channel feeds | Export products to Google Merchant Center and other channels; adopted Shopify categories map to Google product categories through Shopify's published mappings, custom ones are mapped once by the category team |

## Exit demo

1. A seller sees "Gaming laptops needs 3 more catalogs before buyers can buy directly; you can pair 2 of them" and pairs them in two clicks.
2. The category team receives a candidate category "AI/NPU laptops" with the evidence behind it; the AI drafter produces a draft in which the checker accepts most suggestions.
