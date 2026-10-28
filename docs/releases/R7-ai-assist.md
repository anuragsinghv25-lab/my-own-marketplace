# R7 · AI assist

**Goal:** AI does most of the typing for sellers and most of the reading for reviewers, always as **suggestions with visible confidence** that a person accepts. Brings the Orbita prototype's AI journeys to life.

**Depends on:** R5 (catalog), R6 helps but is not required. **Indicative size:** 3 sprints.

## Scope

| ID | Feature | Details |
| --- | --- | --- |
| F7.1 | AI gateway | `packages/ai`: provider-agnostic calls (Vercel AI SDK / AI Gateway), per-task model choice, structured output validated against schemas, retries, cost and latency logging |
| F7.2 | Suggestion store | `ai_suggestion` table: target, field, value, confidence, evidence (document/page/span or image), model, prompt version, human decision (accepted / edited / rejected) |
| F7.3 | Evidence-first product creation | Seller uploads a datasheet PDF, photo or product URL; AI classifies the category (top candidates with confidence; models already know Shopify's taxonomy, so adopted categories are matched on their standard id and path before falling back to custom ones) and extracts values for the contract's `productSchema`; ≥ threshold pre-filled for one-click confirm, below threshold left for the seller |
| F7.4 | LoV mapping | Extracted free text mapped to the nearest allowed value; "propose new value" goes to the category team's LoV queue |
| F7.5 | Titles & descriptions | Generated from confirmed facts and the title template; never overwrite seller text without a click |
| F7.6 | Same-product match | Embeddings (pgvector) + model number + key specs improve "find before create" |
| F7.7 | Image checks | Category fit, model match, duplicate detection, quality, background clean-up; severity (warn/error) from the contract |
| F7.8 | Price sanity | Peer-range check per category/spec combination, shown as a hint and passed to reviewers |
| F7.9 | Certificate & trademark reading | Extract number, holder, dates, scope from uploaded certificates and trademark documents; compare with entered values |
| F7.10 | Reviewer co-pilot | For brand and product reviews: summary, mismatches, draft decision with reason codes; reviewer agrees or overrides with reason; agreement rate tracked |
| F7.11 | Orbit AI assistant | ⌘K panel answering "what's missing?", "why was this rejected?", "what changed in v2?" from the user's own permitted data; proposes actions that the user approves |
| F7.12 | AI quality dashboard | Acceptance rate per field and category, co-pilot agreement rate, cost per task, latency |
| F7.13 | Guardrails | Never-silent rule, explainability, fallback to manual form, per-user data boundaries, prompt/version tracking |

## Exit demo

1. A seller drops a NOVARA datasheet; 38 attributes extracted, 34 pre-filled with high confidence, 4 waiting for confirmation; category suggested correctly.
2. One extracted value ("Wi-Fi 6E") has no matching LoV; the seller flags it; it appears in the category team's queue.
3. The product reviewer opens the request; the co-pilot highlights an image of a different model; the reviewer sends it back with the suggested reason code.
4. The AI dashboard shows acceptance rates for the pilot categories.
