# R3 · Category approval and publishing

**Goal:** category versions move through a governed draft → review → approve → publish lifecycle with maker-checker-approver controls, scheduling and full audit. This release also builds the **generic review engine** that brands and catalogs reuse in R4 and R5.

**Depends on:** R2. **Indicative size:** 2 sprints. **After R3 the category side is complete for v1.**

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

## Exit demo

1. Checker submits Gaming laptops v1; it appears in the approver's worklist.
2. Approver comments on the RAM spec and sends back; checker fixes and resubmits; the compare view highlights the change.
3. The checker tries to approve their own version and cannot.
4. Approver approves with seller go-live today and buyer go-live next Monday; the category shows "Live for sellers".
5. The audit trail shows every step with timestamps.
