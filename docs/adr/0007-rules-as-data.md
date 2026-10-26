# 0007 · Business rules as data with GoRules ZEN

- **Status:** Proposed
- **Date:** 2026-10-27

## Context
Category teams need to define rules without developers: price bands relative to MRP, price bounds per spec combination, which certificates apply given spec values, dependency rules between specs, and review risk scoring. These rules must be versioned with the category and evaluated identically in browser and server.

## Decision (proposed)
Store rules as **JSON decision graphs** evaluated by the open-source **GoRules ZEN engine** (MIT, Node.js binding). The contract compiler embeds the graphs into the Category Contract. Simple structural rules (required fields, ranges, allowed values) stay in JSON Schema; ZEN handles decision tables and cross-field logic.

## Open points before accepting
- Confirm ZEN runs in the browser (WASM) for live hints, or provide a thin server endpoint for evaluation.
- Decide whether to embed GoRules' visual editor in the category workbench or build a simpler table editor.
- Benchmark evaluation for bulk uploads (thousands of rows).

## Alternatives considered
- **json-rules-engine:** simple and pure JS, but no decision-table model or editor.
- **Hand-written TypeScript rules:** fastest to start, but every rule change needs a developer and a deploy.
