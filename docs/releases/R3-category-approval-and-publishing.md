# R3 · Category approval and publishing

**Goal:** category versions move through a governed draft → review → approve → publish lifecycle with maker-checker-approver controls, scheduling and full audit. This release also builds the **generic review engine** that brands and catalogs reuse in R4 and R5.

**Depends on:** R2. **Indicative size:** 2 sprints. **After R3 the category side is complete for v1.** **Status:** built (see *As built* below; with the R0.1 roles the category manager drafts and checks, and the approver is the independent second person, so categories have one review stage).

## Scope

### Review engine v1 (generic)

| ID | Feature | Details |
| --- | --- | --- |
| F3.1 | Review requests | `review_request` for any subject (`subject_type`, `subject_id`, version pinned); tasks, assignees, comments, decisions, attachments |
| F3.2 | Review definitions as data | Reviewer roles per stage, send-back target, reason codes, SLA durations, attempt limits; editable by platform admin |
| F3.3 | Queues | Master queue → personal worklist; "My team" view for supervisors; "All requests" for super users and auditors; filters and sorting |
| F3.4 | Field-level comments | Comment on a specific field or spec; multiple comments per field; attachments (PDF/DOC) |
| F3.5 | Change highlighting | Compare any two versions; colour code: green added, red removed, orange modified, yellow state change |
| F3.6 | Transfers | Reassign drafter (by checker) and checker (by super admin) individually or in bulk, without changing status; audited |
| F3.7 | SLA timers | Durable timers (Vercel Workflows) remind and escalate overdue tasks |

### Category lifecycle

| ID | Feature | Details |
| --- | --- | --- |
| F3.8 | Statuses | `DRAFT → IN_REVIEW → APPROVED → SCHEDULED → PUBLISHED → SUPERSEDED`, plus `SENT_BACK`, `DISCARDED`; drafter pull-back until the checker acts |
| F3.9 | Maker-checker-approver | Separation of duties enforced by policy: an approver cannot approve a version they edited or checked |
| F3.10 | Send back / discard | Approver sends back to the same checker; checker sends back to the same drafter; discard restores the last published version (or deletes a never-published draft) with mandatory reason |
| F3.11 | Publish = compile + freeze | Approval triggers final compile; version and contract become immutable; publish blocked on compile or test-case failure |
| F3.12 | Go-live scheduling | Approve now or schedule; separate seller and buyer go-live (seller date ≤ buyer date); buyer go-live can wait until N catalogs exist; reschedule until live |
| F3.13 | Category status | Never live (staged), Live, Deactivated, Down for buyers, Down for sellers, Down for maintenance; scheduled downtime |
| F3.14 | Test mode | Optional "test category" visible only to designated test sellers and buyers before go-live |
| F3.15 | New version of a live category | "Create next version" clones the published version into a new draft; the live version keeps serving until the new one publishes (catalog migration arrives in R6) |
| F3.16 | Notifications | Assignment, submission, send-back, approval, schedule, go-live → creator, checker, approver, drafter |

## Data added

`review_definition`, `review_request`, `review_task`, `review_decision`, `review_comment`, `attachment`, `category_schedule`, `category_status_history`

## Screens

Review desk (shared by all reviewer roles from now on) · Request detail with right-hand feedback panel (status, assignee, comments) · Version compare · Schedule dialog · Workbench › Category status

## Out of scope

Risk-based lanes and change classes (R8). Catalog migration on version change (R6).

## As built

| Item | Decision |
| --- | --- |
| Review engine | `@orbita/reviews`, generic ([ADR 0011](../adr/0011-review-engine-and-daily-job.md)): one **request** per reviewed thing, an **attempt** per submission, a **task** per stage per attempt (pinned to the submitted contract and its hash), append-only **decisions**, per-field **comments**. It does not know what it reviews; `@orbita/category-publishing` owns the category side, brands and catalogs add their own in R4/R5 |
| Review definitions as data | Stages (role per stage), reason codes (and whether each is for send-back, discard or both), SLA hours, reminder hours, attempt limit. Admin → **Review rules**. Categories ship with one stage (approver), 8 reason codes, 48 h SLA, 24 h reminder, 5 attempts. The engine already runs multi-stage definitions (tested), for brands in R4 |
| Lifecycle | `DRAFT → IN_REVIEW → (SENT_BACK → IN_REVIEW)* → SCHEDULED → PUBLISHED → SUPERSEDED`, plus `DISCARDED`. Submitting needs a clean, current compile and passing test cases. Withdraw (pull-back) works until the approver comments or decides. A send-back returns to the **same approver** on resubmission |
| Separation of duties | Nobody who edited or submitted a version can approve it, including people holding both roles; the reason is shown in words ("You edited this version, so someone else must approve it"). Transfers refuse ineligible approvers. Platform admins transfer reviews and edit review rules but never decide; auditors only read |
| Publish = compile + freeze | Approving runs a **final compile that must reproduce the submitted contract's hash** (it fails if the shared library changed underneath) and re-runs the test cases. The approved contract is recorded per version (append-only). Database triggers freeze specs, rules, flags, test cases and the version's own settings outside DRAFT/SENT_BACK, and published history only moves forward (PUBLISHED → SUPERSEDED) |
| Go-live | Separate seller and buyer dates (buyer ≥ seller), optional "buyers wait for N catalogs" (counted from R5), test mode. Seller date today = live on approval. Dates are in India time. Approvers reschedule until sellers have it, and move the buyer date until buyers have it |
| Timers | A **daily Vercel Cron** job (`/api/cron/daily`, 00:15 IST) publishes due versions, sends SLA reminders and escalates overdue reviews to every eligible approver, and sends unsent emails. Pages that show go-live state also publish due versions when they load, so a late cron is never visible. Vercel Workflows were not needed: every wait is a date or an hour count |
| Category status | Never live, Scheduled, Live, Live for sellers, Deactivated (approvers only), Down for buyers, Down for sellers, Down for maintenance; overrides now or in a planned window, with a reason. Workbench → **Category status** also starts the **next version** (a copy of the live one; the live one keeps serving) |
| Change highlighting | `compareContracts` in `@orbita/contract`: green added, red removed, orange changed, yellow importance/required changed; specs, rules (matched by name), flags, title and offer terms. The review shows changes since the previous attempt and against the live version |
| Notifications | In-app bell plus email (Resend), written in the same transaction as the change: assignment, submission, resubmission, withdrawal, send-back, approval, discard, go-live, reschedule, comments to the approver, reminders, overdue |
| API | `GET /api/v1/categories/{id}/live`: status, live version, go-live dates and the approved contract |
| Not built | Attachments on comments (F3.4: arrives with R4, where brand evidence needs file storage); a supervisor's "My team" queue (no supervisor role in the R0.1 model; "All requests" covers it); enforcement of test mode for test sellers and buyers (recorded now, enforced when sellers and buyers exist in R4/R5) |

## Exit demo

Run end to end in a browser on 1 Nov 2026 (all five steps pass, no console errors).


1. Checker submits Gaming laptops v1; it appears in the approver's worklist.
2. Approver comments on the RAM spec and sends back; checker fixes and resubmits; the compare view highlights the change.
3. The checker tries to approve their own version and cannot.
4. Approver approves with seller go-live today and buyer go-live next Monday; the category shows "Live for sellers".
5. The audit trail shows every step with timestamps.
