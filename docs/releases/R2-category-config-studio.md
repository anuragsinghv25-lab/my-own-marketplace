# R2 · Category configuration studio + Category Contract

**Goal:** a drafter and checker can fully configure a category (flags, specs, rules) by **reviewing and adjusting inherited defaults instead of typing everything**, and see exactly what sellers will get, because the configuration compiles into a Category Contract.

**Depends on:** R1. **Indicative size:** 3–4 sprints (the largest and most important release).

## Scope

### Flags

| ID | Feature | Details |
| --- | --- | --- |
| F2.1 | Inheritance | Effective value of every flag = platform default → profile → parent category → this version's override; the UI shows where each value came from |
| F2.2 | Exceptions view | Default view lists only flags that are overridden or need a decision; "show all" groups flags by consumer (category, seller, buyer, marketplace, transactional); transactional flags read-only for the category team |
| F2.3 | Typed flag editors | Editors generated from each flag's value schema: toggles, single/multi-select, number with bounds, tables (quantity slabs, image headers), structured editors (certificates, allowed sellers, buyer groups) |
| F2.4 | Structured flags | Selling units + decimal rules; price label + discount band; quantity discount slabs; allowed sellers / land-border rule; certificate rules (per type: mandatory/optional, single/either-or, hints); image/video/brochure limits; stock rules (required, lower limit, update and expiry days, monthly supply rate); AI check severities (warn/error); custom title format builder; buying modes |

### Specifications

| ID | Feature | Details |
| --- | --- | --- |
| F2.5 | Spec builder | Add specs by **picking attributes from the library** (drag or search), or clone from a sibling category; group specs (group name shown to buyers); reorder; expand/collapse |
| F2.6 | Spec settings | Per spec: allowed-value subset or conditions (≥, ≤, step, decimals), display as discrete or ranges (manual or generated range sets), importance (super-golden / golden / filter / mandatory / optional), preference (higher/lower/shorter/larger/yes/no/none), seller selection (single/multi), bid restriction, comparable-product flag, per-unit price comparison flag (one per category), buyer and seller hints |
| F2.7 | Mutual-exclusivity guards | The UI only offers valid combinations (e.g. text is always mandatory-only; Boolean is single-select; preference options depend on datatype; only one per-unit comparison spec) |
| F2.8 | Customisable specs group | Auto-created when the "allow customisation" flag is on |
| F2.9 | Spec import/export | Excel/CSV round-trip including value lists |
| F2.10 | Search and filter specs | By name, datatype, importance, preference, selection, restriction |

### Rules

| ID | Feature | Details |
| --- | --- | --- |
| F2.11 | Dependency rules | Value → value and value → spec/group visibility rules; visual rule canvas (React Flow) plus a table view; contradiction and hierarchy-of-importance checks before save |
| F2.12 | Price bounds | Min/max offer price per selling unit and per spec-value combination (tree with bounds at leaves) |
| F2.13 | Eligibility rules | Which sellers / seller types may list (from allowed-seller and land-border flags) |
| F2.14 | Rule simulator | Pick values as a seller would and see enabled/hidden/blocked fields and price band live |

### Contract and preview

| ID | Feature | Details |
| --- | --- | --- |
| F2.15 | Contract compiler | `packages/contract`: resolves inheritance; emits `productSchema`, `offerSchema` (JSON Schema), `uiSchema`, `rules`, `titleTemplate`, `filters`, `features`, `flagsSnapshot`; hash; compile errors listed with links to the offending setting |
| F2.16 | Contract test cases | Attach sample products that must pass or must fail; run on every compile |
| F2.17 | Live preview | Side-by-side preview of the seller form (rendered from the contract by the same renderer sellers will use in R5) and a buyer filter panel mock |
| F2.18 | Draft safety | Autosave per change; edit lock (one editor at a time) with take-over by checker; full field-level history |
| F2.19 | Checker ↔ drafter | Checker assigns/reassigns drafters; drafter submits to checker; checker comments per field (review engine arrives in R3, so this is a simple hand-off) |
| F2.20 | Clone category | Clone flags/specs/rules from another category version (choose sections) |

## Data added

`flag_value`, `spec_group`, `spec_definition`, `spec_range_set`, `rule` (JSON decision graphs), `price_bound`, `category_contract` (compiled JSON + hash), `contract_test_case`, `edit_lock`

## Screens

Workbench › Category version: Overview · Flags · Specifications · Rules (canvas + table) · Price bounds · Preview · History

## Out of scope

Formal approval and publishing (R3). AI-drafted specs (R9).

## Exit demo

1. Checker opens Gaming laptops v0, applies the "Branded electronics" profile; only 6 flags show as needing a decision.
2. Adds 12 specs from the library in two minutes; sets Processor to super-golden, RAM golden "higher is better", RGB keyboard optional.
3. Adds a rule: Processor = AMD → GPU options limited to AMD/NVIDIA list; the simulator shows it working.
4. Sets discount band 5–40% off MRP; the preview's price field shows the band.
5. A contract test case "RAM = 4 GB" fails as expected (RAM ≥ 8 rule).
