# 05 · Workflows

All approval-style processes run on **one generic review engine**. Category versions, brand requests, catalogs and vendor assessments differ only in their configuration: who reviews, which lanes exist, what the checks are and what "approve" does.

## The generic review engine

```mermaid
flowchart LR
  S[Subject submitted<br/>category version · brand ·<br/>product · vendor assessment] --> CHK[Automated checks<br/>contract rules, API checks,<br/>AI findings]
  CHK --> RISK{Risk score<br/>→ lane}
  RISK -- green --> AUTO[Auto-approve<br/>+ sample for audit]
  RISK -- amber --> L1[One reviewer]
  RISK -- red --> L2[Reviewer +<br/>second reviewer]
  L1 & L2 -- unsure / dispute --> ESC[Escalation:<br/>marketplace manager → committee]
  L1 & L2 & ESC --> DEC{Decision}
  AUTO --> DEC
  DEC -- approve --> EFF[Apply effect<br/>publish / activate]
  DEC -- send back --> BACK[Back to sender<br/>with reason codes]
  DEC -- reject --> REJ[Rejected<br/>with reason codes]
```

What a review **definition** declares (stored as data, editable by admins):

```ts
// Illustrative
const brandReview: ReviewDefinition = {
  subjectType: 'brand_request',
  lanes: {
    green: { reviewers: [], sampleRate: 0.1 },
    amber: { reviewers: ['brand_specialist'] },
    red:   { reviewers: ['brand_specialist', 'agency_manager'] },
  },
  escalation: ['marketplace_manager', 'committee_member'],
  riskRules: 'rules/brand-risk.json',      // ZEN decision graph
  checks: ['prohibited_name', 'trademark_owner_match', 'duplicate_brand'],
  sla: { amber: 'P2D', red: 'P5D' },        // ISO-8601 durations; timers in the worker
  sendBackTo: 'previous_actor',
  attemptsLimit: { per: ['seller', 'brand', 'category'], max: 3, cooldown: 'P30D' },
  reasonCodes: 'reason-codes/brand.json',
};
```

At MVP every lane except **amber** can be switched off, so the platform starts as "everything gets one reviewer" and the green/red lanes are turned on per category as confidence grows.

## Category version lifecycle

```mermaid
stateDiagram-v2
  [*] --> DRAFT: creator assigns workgroup + checker
  DRAFT --> DRAFT: drafter / checker edit (edit lock)
  DRAFT --> IN_REVIEW: checker submits
  IN_REVIEW --> SENT_BACK: approver sends back
  SENT_BACK --> DRAFT: checker resumes
  IN_REVIEW --> APPROVED: approver approves
  APPROVED --> SCHEDULED: go-live date in future
  APPROVED --> PUBLISHED: go-live now
  SCHEDULED --> PUBLISHED: timer fires
  PUBLISHED --> SUPERSEDED: next version published
  DRAFT --> DISCARDED: checker discards
  PUBLISHED --> [*]
```

- **Publishing compiles the contract.** If compilation or the contract's own test cases fail, publishing is blocked.
- **Change classes** decide the path: *cosmetic* changes (hint text, labels) can be published by the checker; *minor* and *major* changes need the approver. The class is computed from the contract diff, not chosen by the user.
- **Separate go-live for sellers and buyers** (seller first, so catalogs exist before buyers arrive).

## What happens to catalogs when a new category version is published

```mermaid
flowchart TB
  P[vN+1 published] --> D[Diff contract vN → vN+1]
  D --> PLAN[Migration plan per product]
  PLAN --> A{Change type for<br/>this product}
  A -- no impact --> NOOP[Re-pin silently]
  A -- deterministic mapping --> AUTO[Auto-migrate,<br/>notify owner]
  A -- needs confirmation --> ACK[Owner acknowledges<br/>pre-filled change]
  A -- needs new data --> EDIT[Owner edits fields<br/>within cool-off period]
  ACK & EDIT --> CHECK{Did product facts<br/>actually change?}
  CHECK -- no --> KEEP[Paired offers stay paired]
  CHECK -- yes --> NOTIFY[Paired sellers re-confirm]
  EDIT -- cool-off expires --> INACT[Product → ACTION_REQUIRED / inactive]
```

## Brand request

```mermaid
stateDiagram-v2
  [*] --> DRAFT
  DRAFT --> SUBMITTED: seller submits
  SUBMITTED --> AUTO_APPROVED: same seller + brand + trademark class already approved
  SUBMITTED --> IN_QUEUE: otherwise
  IN_QUEUE --> IN_REVIEW: picked or assigned (priority order)
  IN_REVIEW --> INFO_REQUESTED: reviewer asks for more
  INFO_REQUESTED --> IN_REVIEW: seller responds
  IN_REVIEW --> ESCALATED: unsure → agency manager → marketplace manager
  ESCALATED --> IN_REVIEW
  IN_REVIEW --> APPROVED
  IN_REVIEW --> PARTIALLY_APPROVED: some categories
  IN_REVIEW --> REJECTED_REQUEST: this seller only
  IN_REVIEW --> REJECTED_BRAND: brand+category blocked for all
  REJECTED_BRAND --> REVIVAL: revival process
  DRAFT --> WITHDRAWN
  SUBMITTED --> WITHDRAWN
  APPROVED --> [*]
```

Seller-side relationship paths (owner, manufacturer for owner, authorised reseller, unbranded) decide the evidence required; when the brand owner is already on the platform, an authorisation request goes to **their** dashboard instead of a reviewer.

## Product (catalog) creation

```mermaid
flowchart TB
  START([Seller starts]) --> CTX{Has an approved<br/>brand-category relation?}
  CTX -- no --> BRQ[Brand request flow]
  CTX -- yes --> EVI[Upload evidence or enter model no.]
  EVI --> MATCH{Same product<br/>already exists?}
  MATCH -- yes --> PAIR[Create offer on existing product]
  MATCH -- no --> FILL[AI extracts facts →<br/>form rendered from contract uiSchema]
  FILL --> CONF[Seller confirms<br/>low-confidence values]
  CONF --> OFFER[Offer: price within live band,<br/>stock, serviceability, certificates]
  OFFER --> READY{Readiness: 0 blocking?}
  READY -- no --> CONF
  READY -- yes --> SUB[Submit]
  PAIR --> SUB
  SUB --> OWN{Reseller of a brand<br/>whose owner is on platform?}
  OWN -- yes --> OEM[Brand owner approves]
  OWN -- no --> REV[Review engine: lanes]
  OEM --> REV
  REV --> LIVE([Published])
```

## Notifications and timers (worker jobs)

| Job | Trigger |
| --- | --- |
| `contract.compile` | Category version submitted / publish requested |
| `version.publish_scheduled` | Scheduled go-live time |
| `version.plan_migrations` | Version published |
| `review.route` | Any subject submitted |
| `review.sla_tick` | Every N minutes: escalate overdue tasks, rebalance load |
| `ai.extract_product` | Evidence uploaded |
| `certificate.expiry_scan` | Daily: reminders at configured offsets, inactivate on expiry |
| `offer.stock_staleness` | Daily: Expiring Soon → Expired per category rules |
| `draft.cleanup` | Daily: warn then delete stale drafts |
| `notify.*` | Any event with subscribers (email digest + in-app) |
