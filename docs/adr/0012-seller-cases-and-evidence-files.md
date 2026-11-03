# 0012 · One lean case path for sellers; evidence files behind a storage port

- **Status:** Accepted
- **Date:** 2026-11-03
- **Builds on:** [0011](0011-review-engine-and-daily-job.md)

## Context
R4 adds three seller-side reviews (seller verification, vendor assessment, brand requests). The original plan copied a four-tier government chain with a committee and helpdesk revival; the 3 Nov decision chose a lean two-step instead. Sellers also upload evidence (certificates, trademark papers, factory licences), and the deployment runs on Supabase's free plan.

## Decision
- **Cases** (`@orbita/sellers/cases`): one helper for submit, decide, reply and withdraw on top of the review engine. Definitions have a reviewer stage and an **escalation-only** approver stage. The engine gained `reject`, `request_info` (pauses the request, no SLA), `respond` and `escalate`. Each subject module applies what a decision means (verify an organisation, set brand owners, create approvals, block a brand).
- **Who decides a stage** is checked by role: reviewers can create escalations, only approvers can decide them.
- **Evidence files** go through a `FileStorage` port: a private Supabase Storage bucket in deployments, Postgres (`file_blobs`) for local work and tests. Files are checked by content and size (4 MB, within Vercel's request limit), never changed once stored, and served only through an access-checked route.
- **Self sign-up** uses the Supabase admin API from the server (like invites), so Supabase's public sign-up stays off and no paid feature is needed.

## Consequences
- R5 catalog review can reuse the same case path with its own definition.
- Moving to signed direct uploads (larger files) later only changes the web adapter.
- Supabase's free plan gives 1 GB of storage; a cleanup or a paid plan is needed when sellers upload a lot.
