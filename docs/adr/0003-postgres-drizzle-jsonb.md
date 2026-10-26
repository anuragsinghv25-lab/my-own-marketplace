# 0003 · PostgreSQL with Drizzle; spec values in JSONB

- **Status:** Accepted
- **Date:** 2026-10-27

## Context
Hundreds of categories, each with its own specification set that changes over versions. Core objects (orgs, brands, reviews, offers) are strongly relational. We also need text search, similarity search (duplicate detection, AI) and a job queue.

## Decision
- PostgreSQL as the single system of record.
- Relational tables for core entities; **product spec values in a `facts` JSONB column**, validated against the pinned Category Contract's JSON Schema. Filterable attributes get generated columns or GIN indexes as needed.
- `pg_trgm` + full-text search for admin and seller search; `pgvector` for embeddings.
- Drizzle ORM with drizzle-kit SQL migrations, checked in CI.

## Consequences
- No entity-attribute-value tables; one query returns a whole product.
- Schema validation happens in the application (contract), not in database constraints, so tests matter.
- Very large buyer-side faceted search may later move to a search engine fed by events.

## Alternatives considered
- **EAV tables** for spec values: flexible but slow and painful to query.
- **MongoDB:** natural for documents, weaker for the relational and transactional core.
- **Prisma 7:** good DX; Drizzle preferred for SQL-level control over JSONB and no generate step.
