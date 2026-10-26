# Orbita seller prototype (reference only)

`index.html` is the original Orbita seller prototype: a single, self-contained, pre-built React app (Vite bundle with Tailwind CSS and Lucide icons inlined). Open it directly in a browser; it needs no server and no backend.

## What it is used for

This file is a **design and UX reference**, not source code. The production app in this repo will be rebuilt from scratch as a proper multi-role application (see [`docs/architecture`](../../docs/architecture/README.md)). What we carry over from it:

| Carried over | Where it goes in the real app |
| --- | --- |
| Visual language: colours, type, radii, shadows, light/dark themes | `packages/ui` design tokens ([design system notes](../../docs/design/orbita-design-system.md)) |
| Brand Center journey (lookup first, relationship-first evidence, readiness score) | Brand module, seller app |
| Catalog Builder (AI classification, spec extraction with confidence bands, LoV mapping, compliance computed from specs, media roles, quality checks, preview) | Catalog module, seller app |
| Orbit AI co-pilot pattern | AI gateway + assistant panel |
| Marketplace Opportunities (demand signals) | Insights module |
| Core rule: *AI recommends, Orbita validates, humans review exceptions* | Everywhere |

## What it is not

- It has no backend, no login, no persistence, no real AI and no real verification. All data is deterministic demo data.
- It has only the **seller** side. Admin, category, review and approval roles do not exist yet; they are the main work of the real app.

Do not edit `index.html`. It is a minified build artefact kept for reference; its source is not in this repo.
