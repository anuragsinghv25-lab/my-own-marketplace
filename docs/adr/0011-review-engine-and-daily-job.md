# 0011 · Review engine as a module; timers as one daily job

- **Status:** Accepted
- **Date:** 2026-11-01
- **Amends:** [0005](0005-review-engine-and-jobs.md) (engine shape) and [0008](0008-vercel-and-supabase.md) (timers)

## Context
R3 needs maker-checker reviews for category versions, and R4/R5 need the same for brand requests and catalogs. ADR 0005 chose our own engine; ADR 0008 planned Vercel Workflows for durable timers. In R3 every wait turned out to be a date (go-live) or an hour count (SLA reminders and escalation), and the Vercel Hobby plan runs cron jobs once a day.

## Decision
- **`@orbita/reviews`** is a framework-free module that knows requests, attempts, stage tasks, decisions, comments and SLA timers, but not the subject. A subject module (`@orbita/category-publishing` now) calls it inside its own transaction and owns the subject's states and the "who may decide" check, passed in as an eligibility callback for transfers.
- **Review definitions are data** (stages, reason codes, SLA, reminder, attempt limit), edited by a platform admin.
- **One daily Vercel Cron job** publishes due versions, sends reminders, escalates overdue tasks and sweeps unsent emails. Pages and the API that show go-live state also publish due versions on load, so correctness never depends on the cron's timing.
- **Notifications** are rows written in the same transaction as the change; email is sent after the response (`after()`), and the daily job retries what was missed. Each row is claimed before sending, so no email goes twice.

## Consequences
- Brands and catalogs in R4/R5 add a definition and a subject module, not workflow code.
- Reminders are at most a day late on the Hobby plan; a paid plan can run the same endpoint hourly with no code change.
- If a later release needs multi-step waits that are not dates (e.g. waiting on an external callback), Vercel Workflows remain the option.

## Alternatives considered
- **Vercel Workflows now:** durable, but adds a dependency for waits a date comparison already answers.
- **Postgres `pg_cron`:** works on Supabase, but splits job logic between SQL and the app.
