# 0001 · Start as a modular monolith

- **Status:** Accepted
- **Date:** 2026-10-27

## Context
The domain has many tightly related parts (category config feeds catalog validation, which feeds review, which feeds maintenance). The team is small, and requirements will move a lot in the first year. Microservices would force us to decide service boundaries and distributed transactions before we understand the domain.

## Decision
Build one backend codebase deployed as two processes (API and worker) sharing one PostgreSQL database. Inside it, each bounded context is a module that owns its tables, exposes a public service interface and publishes domain events through a transactional outbox. Module boundaries are enforced by lint rules (dependency-cruiser).

## Consequences
- One deploy, one database, simple local development, ACID transactions across a use case.
- Discipline is required: no cross-module table access, no reaching into another module's internals.
- Any module can later be extracted into a service because its data and events are already isolated.

## Alternatives considered
- **Microservices from day one:** too much operational and coordination cost for the current team and stage.
- **Unstructured monolith / Next.js-only app:** fastest start, but business rules end up spread across UI handlers and become hard to reuse for bulk uploads, APIs and workers.
