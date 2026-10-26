# 0005 · Own generic review engine on Postgres + pg-boss

- **Status:** Accepted, amended by [0008](0008-vercel-and-supabase.md): the review engine stands; pg-boss is replaced by Vercel Workflows (timers, orchestration) and Vercel Cron
- **Date:** 2026-10-27

## Context
Category versions, brand requests, catalogs and vendor assessments all need maker-checker style reviews with queues, priorities, send-backs, escalations, SLAs and audit. They differ in configuration, not in mechanics. Reviews wait on humans for hours or days.

## Decision
- One **review engine** module: `review_request`, `review_task`, `decision`, `comment`, with lifecycle state machines defined in `packages/domain` and per-subject **review definitions stored as data** (lanes, reviewers, risk rules, SLAs, reason codes, attempt limits).
- **pg-boss** (Postgres-backed queue) for timers, routing, notifications and AI jobs. Events enter the queue through the transactional outbox.

## Consequences
- Adding a new reviewable thing means a new definition, not new workflow code.
- Risk-tiered lanes (green/amber/red) can be switched on per category by configuration.
- No extra infrastructure (no Redis, no workflow server).
- We own the engine's correctness: state machines must be exhaustively tested.

## Alternatives considered
- **Temporal:** excellent durable execution, but adds a cluster and deterministic-code constraints for what are mostly simple human waits.
- **Camunda / BPMN:** powerful modelling, heavy for this stage, and Java-centric.
- **BullMQ:** fine queue, but needs Redis and gives no transactional link with business data.
