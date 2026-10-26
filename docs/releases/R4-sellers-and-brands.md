# R4 · Seller onboarding and brands

**Goal:** sellers can register an organisation, prove who they are, and get brands approved for categories, using Orbita's Brand Center journey; brand reviewers work in the shared review desk.

**Depends on:** R3 (review engine). **Indicative size:** 3 sprints.

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

## Exit demo

1. A new seller registers, adds two users and a division.
2. They complete vendor assessment as OEM for "NOVARA"; the VA officer approves.
3. In Brand Center they add NOVARA (registered, Class 9) for Gaming laptops; the specialist asks for info, the seller replies, the specialist approves.
4. A reseller requests to sell NOVARA; the OEM grants authorisation for Gaming laptops in North and Central zones.
5. A second category in Class 9 is auto-approved.
