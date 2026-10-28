# 0009 · Shopify-style variable-depth tree; adopt from Shopify and UNSPSC

- **Status:** Accepted
- **Date:** 2026-10-28
- **Supersedes:** the "UNSPSC-style L1–L4 + platform L5" default of open question Q3, and the fixed-level tree built in R1.

## Context

R1 built a fixed five-level tree (segment › family › class › commodity › listing category, "L1–L5") where every node is typed by hand. In use this has three problems:

1. **Effort.** A realistic tree has thousands of nodes. Typing them is slow and inconsistent, and the result says nothing about which attributes describe the products.
2. **Shape.** Real product categories are not five levels deep. "Gaming laptops" sits naturally at depth 4, "Toilet paper" at 3, "Cable modems" at 4. Forcing five levels creates empty or artificial levels.
3. **Codes.** R1's generated custom codes (`10101510`) look like real UNSPSC codes but are not, which would mislead anyone using them for procurement reporting.

We looked at how other marketplaces handle this:

| Marketplace | Approach |
| --- | --- |
| Shopify | Open Standard Product Taxonomy (MIT): about 14,600 categories in 26 verticals, depth 1–8, each category with the attributes (and values) that describe it. Merchants pick one category per product; product options (variants) come from those attributes. Published twice a year with mappings to Google and others |
| Amazon | Browse tree (variable depth) plus product types with attribute schemas; feeds map to product types |
| eBay, Google Merchant | Variable-depth trees with ids; attributes per leaf |
| GeM and public procurement | UNSPSC as a classification standard; custom listing categories for buying |

UNSPSC is a procurement classification (four fixed levels, 8-digit codes, about 150,000 commodities) with no product attributes. It is valuable for spend reporting and interoperability with procurement systems, but poor as a shopping tree. Its licence allows free use for classification; embedding the codeset in a product requires agreeing terms with its owner.

## Decision

1. **Variable-depth tree.** Up to 8 levels. A node is a **group** (organises) or a **listing category** (sellers list here; always a leaf; only listing categories have versions and contracts). Levels are depth, not names; the UI shows a breadcrumb.
2. **Standards as read-only references, adopted on demand.** The Shopify Standard Product Taxonomy is **bundled** with Orbita as a compact per-vertical file (regenerated from a tagged release by a script) and loaded into reference tables by the platform admin. UNSPSC is **uploaded** by the admin from the file they obtain, never committed to the repository. Category managers adopt categories (one, a path or a whole branch) into the live tree. Custom categories remain possible anywhere.
3. **Provenance on every node.** `source` (custom / shopify / unspsc) and `external_id` (the standard's id). Adopted nodes use the standard id as their code; custom codes use `C01.02.03` so they can never be confused with UNSPSC.
4. **Category attribute sets.** A category has a set of library attributes, inherited by its descendants. Adopting a Shopify category imports its attributes into the library (reusing existing attributes with the same name or code) and attaches them. R2's spec builder starts from this set; R5's variant options come from it.
5. **UNSPSC as a mapping, not the shape.** Any category may carry an 8-digit `unspsc_code` (inherited) for procurement reporting. Adopting from UNSPSC directly is also possible for procurement-style catalogues.

## Consequences

- Building a tree becomes a search-and-adopt task; each listing category arrives with a sensible attribute set, which shortens R2 configuration substantially.
- Adopted nodes can be diffed against later standard releases using `external_id` (R6 delivers the upgrade flow). We commit to tracking Shopify releases (about twice a year) by regenerating the bundle.
- AI classification (R7) and channel feeds (R9) get a head start: models know Shopify's taxonomy, and Shopify publishes mappings to Google product categories.
- The library will contain many Shopify attributes typed as multi-select lists. R2 must let a category narrow allowed values and choose single vs multi selection per spec.
- A data migration renamed R1 codes and marked R1 "L5" nodes as listing categories. Audit summaries written before R1.1 still show the old codes.
- The repository carries about 1 MB of compressed Shopify data (MIT licence and attribution kept next to it).

## Alternatives considered

- **Load all of UNSPSC as the tree (GeM style).** Rejected as the default: four rigid levels, procurement wording, no attributes; still offered as a source to adopt from and as a mapping.
- **Load all of Shopify as the live tree.** Rejected: 14,600 categories most marketplaces never use, each needing configuration and review. Adopt-on-demand keeps the live tree to what is actually sold.
- **Fetch standards at runtime from GitHub.** Rejected: 80 MB source files, request-size and time limits on serverless, and an external dependency in an admin flow. The bundle is deterministic and versioned with the code.
- **Keep the fixed tree and only add import.** Rejected: would still force artificial levels and could not represent Shopify's depth.
