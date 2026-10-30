# 0010 · Typed category rules compiled into the contract

- **Status:** Accepted
- **Date:** 2026-10-30
- **Supersedes:** [ADR 0007](0007-rules-as-data.md) (GoRules ZEN), which stayed proposed.

## Context
Category rules connect specifications ("when the processor is AMD, only these graphics cards"), require or hide specs, and set price bands. They must behave identically in the seller's browser, on the server, in bulk uploads and for AI extraction, must be checkable for contradictions before publishing, and must be readable by sellers and reviewers. ADR 0007 proposed a general decision-table engine (GoRules ZEN), with open points about browser execution, serverless loading and editor fit.

## Decision
Rules are a **small set of typed rule kinds** stored as data on the category version: *restrict* (allowed values or number bounds), *require*, *hide* and *price*, each with AND conditions on other specs. The contract compiler (`@orbita/contract`, pure TypeScript) validates them, detects contradictions between rules that can apply together, writes each as a plain-language sentence, and compiles them into the contract, including JSON Schema `if/then` clauses for consumers in other languages. One `evaluate` function applies a contract to a product everywhere.

## Consequences
- The same code runs in the browser and on the server with no native dependency; nothing to load in serverless functions.
- Contradictions are found at configuration time because the rule language is small enough to reason about.
- Every rule has an exact sentence, so sellers see *why* a value is not allowed.
- A rule shape that the four kinds cannot express needs a code change (a new kind, with its checker, sentence and schema mapping). If this becomes frequent, a decision-table kind can be added as a fifth kind behind the same interface.
- A property test keeps `evaluate` and the generated JSON Schema in agreement.

## Alternatives considered
- **GoRules ZEN (ADR 0007):** powerful and visual, but opaque to contradiction checks and plain-language explanations, and adds a native/WASM runtime.
- **JSON Schema only:** cannot express price bands with MRP, explain itself, or hide fields cleanly; used as an output instead.
- **Code per rule:** every rule change becomes a deploy.
