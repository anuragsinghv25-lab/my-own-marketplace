# 0004 · Compile each category version into an immutable Category Contract

- **Status:** Accepted
- **Date:** 2026-10-27

## Context
Category configuration (dozens of flags, spec definitions, dependency rules, price bounds, certificate rules, title format) controls how catalog creation, validation, review, search and maintenance behave. If every module reads raw config tables, each interprets flags differently and behaviour drifts. Catalogs must also stay valid against the version they were created with.

## Decision
Publishing a category version runs a **compiler** (`packages/contract`) that resolves defaults, profiles, parent inheritance and overrides, then emits one immutable, hashed **Category Contract** containing: `productSchema` and `offerSchema` (JSON Schema), `uiSchema`, `rules` (decision graphs), `titleTemplate`, `filters`, `features`, `flagsSnapshot`. Products pin the contract they were validated against. All consumers (API, web form renderer, bulk validator, AI extraction, review checks, search) read the contract, never raw config.

## Consequences
- One source of truth; browser and server validation cannot disagree.
- Publishing can be blocked by compile errors and by the contract's own test cases.
- Diffing two contracts tells us exactly which products are affected by a new version and how (drives migrations).
- The compiler becomes a critical, heavily tested component.

## Alternatives considered
- **Read config at runtime everywhere:** simpler at first, but leads to scattered flag logic and no reliable versioning.
- **Code-generated TypeScript per category:** type-safe but needs a deploy per category change; rejected.
