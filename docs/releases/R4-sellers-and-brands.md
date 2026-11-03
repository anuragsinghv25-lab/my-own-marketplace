# R4 · Seller onboarding and brands

**Goal:** sellers can register an organisation, prove who they are, and get brands approved for categories, using Orbita's Brand Center journey; brand reviewers work in the shared review desk.

**Depends on:** R3 (review engine). **Indicative size:** 3 sprints. **Status:** built (see *As built*; decisions Q17–Q19 of 3 Nov 2026 simplify the plan below: self sign-up, lean two-step review, India-only identity).

## Scope

### Seller organisations

| ID | Feature | Details |
| --- | --- | --- |
| F4.1 | Seller registration | Self sign-up → organisation profile (legal name, PAN/GST fields, address, contact); email verification; terms acceptance |
| F4.2 | Org users and divisions | Seller admin invites users, creates divisions, grants divisions permission per category; roles `seller_admin`, `seller_lister`, `seller_pricing` |
| F4.3 | Vendor assessment (simplified) | Seller applies to be recognised as OEM / deemed OEM / OEM fabricator for brands, uploads evidence and manufacturing addresses; VA officer reviews via the review desk; result sets `brand_owner` powers and approved addresses |
| F4.4 | Certificate library (basic) | Upload certificates against certificate types with number, issuer, dates, scope; manual verification by the right review team; reused in R5 |

### Brand Center (seller side, Orbita journey)

| ID | Feature | Details |
| --- | --- | --- |
| F4.5 | Lookup first | Type a brand name → existing verified identity? Claim it (owner) or continue as authorised seller; no duplicate brands |
| F4.6 | Relationship first | Owner · Manufacturer for owner · Authorised representative · Unbranded; the answer and trademark status choose the evidence path |
| F4.7 | Brand types | Registered (trademark details + certificate mandatory), Unregistered (undertaking), Unbranded (OEM application, trademark section hidden) |
| F4.8 | Trademark details | Word mark / device mark / both; application number; class; validity; owner name check ("is your name on the certificate?" → authorisation, deemed OEM, or merger/demerger documents) |
| F4.9 | Suggested categories | Categories linked to the trademark class recommended; multi-select for registered brands |
| F4.10 | Prohibited-name check | Live check against configurable prohibited, negative and legally rejected lists |
| F4.11 | Readiness score + final check | Orbita's readiness meter with one next recommendation; pre-submit checks |
| F4.12 | Request types | Brand only · OEM dashboard only · both; withdraw before decision |
| F4.13 | Owner authorisation handshake | If the brand owner is already on the platform, an authorisation request goes to their dashboard; they grant scope (categories, regions, validity) or decline |

### Brand review (reviewer side)

| ID | Feature | Details |
| --- | --- | --- |
| F4.14 | Queues and priority | Master queue → specialist feed; priority order: priority + bid, priority, bid, first-in-first-out |
| F4.15 | Auto-approval | Same seller + brand + trademark class + details already approved → auto-approved for the new category |
| F4.16 | Reviewer actions | Specialist: approve, reject request, notify (ask info), under review, partial approval. Agency manager: approve, reject, notify, send back, escalate, revive. Marketplace manager: accept, reject, send back, priority; committee for special cases |
| F4.17 | Reject request vs reject brand | Request reject affects only that seller; brand reject blocks the brand + category for all sellers until revived |
| F4.18 | Attempts and cool-down | 3 attempts per seller + brand + category; then helpdesk or reapply after cool-down (configurable) |
| F4.19 | Revival | Seller → helpdesk ticket → marketplace manager → committee → agency manager; evidence reused |
| F4.20 | Brand-category approvals | Approved brand-category-seller relations feed catalog permissions in R5 |
| F4.21 | OEM dashboard (basic) | OEM sees its brands, authorised resellers (grant/revoke), pending authorisation requests |

## Data added

`organisation`, `division`, `org_membership`, `vendor_assessment`, `address`, `certificate`, `brand`, `trademark`, `brand_relation`, `brand_request`, `brand_category_approval`, `prohibited_name_list`, `helpdesk_ticket` (minimal)

## Screens

Seller: Registration · Profile · Users & divisions · Vendor assessment · Brand Center (Add brand journey, My brands, Requests, Timeline) · Certificate library · OEM dashboard. Reviewer: Review desk for VA and brands.

## Out of scope

Trademark registry API integration (later). Brand renewals and upgrades (R6). AI reading of trademark certificates (R7).

## As built

| Item | Decision |
| --- | --- |
| Sign-up (F4.1) | `/register`, public. GSTIN checked as you type (format, state code and check digit), PAN taken from it, Indian mobile and PIN code. The server creates the account with the Supabase admin API and emails the confirmation link through Resend (public sign-up stays off; nothing beyond the free plan). Rate limits: 5 attempts per IP per hour, 3 per email per day, plus a hidden honeypot field. Without email the link is only shown in demo mode |
| Seller verification | A new organisation is *pending*. Once the seller admin confirms their email, a **seller verification** review opens (reviewer, escalation to approver). Brand requests and vendor assessments can be prepared but not submitted until verified |
| Users and divisions (F4.2) | Seller admins add seller admins and staff (invite email), and divisions with categories and members. Roles stay the R0.1 set: `seller_lister` and `seller_pricing` are `seller_staff` |
| Lean review (F4.14–F4.16) | One path for seller verification, vendor assessments and brand requests: a reviewer approves, asks for information (the request pauses, no SLA, until the seller replies with notes and files), rejects with a reason, or escalates; an approver decides escalations. Built on the R3 engine with *escalation-only* stages and new decisions (`reject`, `request_info`, `respond`, `escalate`), reason codes as data |
| Vendor assessment (F4.3) | OEM, deemed OEM or OEM fabricator; brands, manufacturing addresses, evidence files. Approval approves the addresses, makes the brands the organisation's (`owner_org_id`) and gives its seller admins the **derived** `brand_owner` role (new seller admins get it too) |
| Brand Center (F4.5–F4.12) | Lookup first (live check: duplicates, near-duplicates, prohibited / not-a-brand / legally rejected lists, owner on Orbita); relationship first (owner, makes it for the owner, authorised reseller, unbranded); registered (trademark details, certificate, "is your name on it?" with proof otherwise), unregistered (undertaking), unbranded (needs vendor assessment). Suggested categories from the trademark class. Readiness meter with one next step, the same rules in browser and server. Draft, submit, withdraw |
| Owner handshake (F4.13, F4.21) | A reseller of a brand whose owner is on Orbita asks the owner directly; the owner grants categories, zones (North, South, East, West, Central, North-East) and validity, or declines; revoking ends the approvals. OEM dashboard: owned brands, waiting requests, authorised resellers, history |
| Auto-approval (F4.15) | Same seller + brand + trademark application number + class already approved after review, and the category fits the class: approved without a reviewer. Categories get trademark classes in the category tree (inherited down) |
| Reject request vs brand (F4.17) | A normal rejection affects that seller only. The reason *infringing* blocks the brand in those categories for everyone; only an approver can do that, and only an approver revives it (Review desk → Escalations) |
| Attempts and cool-down (F4.18) | 3 rejections for the same seller, brand and category within the cool-down (30 days, platform setting `brand_request_cooldown_days`) block new requests there |
| Certificates (F4.4) | Library per organisation (types from the attribute library), file attached, verified or rejected by a reviewer (Review desk → Certificates); reused in R5 |
| Files | PDF, JPG, PNG or WebP up to 4 MB, checked by content (magic bytes), stored in a private Supabase Storage bucket `evidence` created on first use (free plan: 1 GB); `FILE_STORAGE=database` keeps them in Postgres for local work. Served through `/api/files/{id}` to the organisation, reviewers, approvers and auditors only |
| Brand-category approvals (F4.20) | `brand_category_approvals` (who may sell which brand where, as what, from which source, with zones and validity) is what R5 checks when sellers list |
| Not built (decided) | Helpdesk tickets, committee, priority-plus-bid queues (lean review, Q18); request type "OEM dashboard only" (the vendor assessment covers it); trademark registry lookup (later) |

## Exit demo

Run end to end in a browser on 3 Nov 2026 (all five steps pass, no console errors).


1. A new seller registers, adds two users and a division.
2. They complete vendor assessment as OEM for "NOVARA"; the VA officer approves.
3. In Brand Center they add NOVARA (registered, Class 9) for Gaming laptops; the specialist asks for info, the seller replies, the specialist approves.
4. A reseller requests to sell NOVARA; the OEM grants authorisation for Gaming laptops in North and Central zones.
5. A second category in Class 9 is auto-approved.
