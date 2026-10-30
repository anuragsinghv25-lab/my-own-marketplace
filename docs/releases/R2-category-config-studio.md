# R2 · Category configuration studio + Category Contract

**Goal:** a drafter and checker can fully configure a category (flags, specs, rules) by **reviewing and adjusting inherited defaults instead of typing everything**, and see exactly what sellers will get, because the configuration compiles into a Category Contract.

**Depends on:** R1, R1.1. **Indicative size:** 3–4 sprints (the largest and most important release). **Status:** built (see *As built* below; roles use the R0.1 model, so "drafter" and "checker" are both the category manager).

> **R1.1 impact:** every listing category now arrives with an **attribute set** (own plus inherited, often adopted from Shopify with value lists). The spec builder starts from that set instead of an empty sheet, so most of a drafter's work becomes reviewing and narrowing (allowed-value subsets, importance, grouping) rather than picking attributes one by one.

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
| F2.5 | Spec builder | **Pre-filled from the category's attribute set** (R1.1; required ones marked mandatory); add more by **picking attributes from the library** (drag or search), or clone from a sibling category; group specs (group name shown to buyers); reorder; expand/collapse |
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

1. The category manager opens Gaming laptops v0 and applies the "Branded electronics" profile; the flags view shows only what was set here or still needs a decision.
2. Adds the category's attribute set in one click (Processor, RAM, Display size, Graphics card, Refresh rate), adds RGB keyboard from the library, makes Processor and RAM key specs ("higher is better"), RAM a variant option with 4–128 GB in steps of 4, and RGB keyboard optional.
3. Adds a rule: Processor = AMD → GPU options limited to AMD/NVIDIA list; the simulator shows it working.
4. Sets discount band 5–40% off MRP; the preview's price field shows the band.
5. A contract test case "RAM = 4 GB" fails as expected (RAM ≥ 8 rule); compiling stores the contract with its hash and both test cases behave as expected.

## As built

| Item | Decision |
| --- | --- |
| Rules | **Typed rules compiled into the contract** ([ADR 0010](../adr/0010-typed-rules-in-the-contract.md)), not a general rules engine. Four kinds: *limit values* (a list subset or a number range), *make required*, *hide*, *price band*; each with up to five AND conditions (is one of, is not one of, at least, at most, between, yes, no, filled in). Every rule is shown as a plain sentence, the same sentence sellers and reviewers see |
| Compiler checks | Unknown specs, conditions that can never all be true, values outside the list, numbers outside library bounds, key specs that a rule hides, rules that contradict each other **only when they can apply together** (require vs hide, disjoint value limits, disjoint number or price bands), hide loops, unknown title tokens, flags that still need a decision, more than 3 variant options. Switched-off rules only warn |
| Importance | Clearer than GeM's golden/super-golden: **Key spec** (identifies the product: required, in titles and duplicate checks; up to 5), **Required**, **Recommended** (counts towards listing quality), **Optional**; plus *buyer filter*, *shown in comparisons*, *variant option* (for R5) and *higher/lower is better* |
| Contract | `@orbita/contract` (pure TypeScript, no framework): fields, groups, rules with sentences, title template, buyer filters with range buckets, variant options, offer terms (selling units, price label, discount band, images, certificates, allowed sellers), a flags snapshot, and **JSON Schemas** for product facts and offer. Hash = SHA-256 of the canonical JSON; the same configuration always gives the same hash. Stored rows are immutable (database trigger) |
| One evaluator | `evaluate(contract, sample)` decides visibility, requirements, allowed values, number bounds, price band (rules plus discount off MRP), title and a listing-quality score. The seller-form preview, the compiler's test cases and (from R5) the server all use it. A property test checks it agrees with the generated JSON Schema on 2,000 random products |
| Live preview | The seller's form is generated from the contract by a renderer R5 reuses, beside the generated title, listing quality, the rules in play and the buyer filter panel. Any filled form can be saved as a test case that must pass or be rejected |
| Draft safety | One editor at a time: opening the editor takes a lock, which another category manager can take over after 15 minutes without changes (audited). Every change is saved immediately with before/after in the version's history. Everyone who edits is recorded on the version so R3 can stop them from approving it |
| Spec defaults | "Add from the attribute set" turns the R1.1 attribute set (own and inherited) into specs: required attributes become *Required*, others *Recommended*; list and number specs become buyer filters |
| Copy and assign | Copy specs, rules, flags and profile, title or test cases from any version you can read; reassign to another category manager of that part of the tree |
| API | `GET /api/v1/category-versions/{id}/contract` returns the latest compiled contract with its hash |
| Not built | Spec import/export by spreadsheet (F2.9), per-field comments between drafter and checker (moved to R3's review engine), range sets for discrete display (F2.6 partly: filters get automatic buckets), certificate rules per spec value (with R5 certificates), quantity discount slabs and buyer groups flags (later flags, no code needed when defined) |
| Out of scope (decided) | **Services** listing categories: the marketplace lists physical products only. Government-specific procurement features are configurable flags, not built-in behaviour |
