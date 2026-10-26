# R6 · Catalog maintenance and category versioning

**Goal:** live catalogs stay correct over time: offers stay fresh, certificates stay valid, brand changes ripple to resellers, and a new category version migrates existing products instead of breaking them. Sellers handle all of it from one Action Centre.

**Depends on:** R5. **Indicative size:** 3 sprints.

## Scope

### Offer and product lifecycle

| ID | Feature | Details |
| --- | --- | --- |
| F6.1 | Offer statuses | Active · Expiring soon · Expired · No stock · Suspended · Removed by owner; product statuses incl. Action required, Inactive (certificate / CMS change / OEM change), Suspended, Sidelined, Discontinued |
| F6.2 | Staleness jobs | Daily cron: stock/price not updated within the category's warning/expiry days → Expiring soon → Expired; refresh action resets the clock |
| F6.3 | Price rules | Lower anytime; raise only after x days by at most y% over the lowest price in the last z days (configurable); the rule is explained on the price field |
| F6.4 | Stock rules | Raise anytime; lower only x days after the last update; monthly supply rate with seller cap |
| F6.5 | Holiday mode | Take all offers off the market between two dates; staleness paused; min length and gap between holidays |
| F6.6 | Discontinue | Owner discontinues now or on a date; paired offers discontinued with notification; buyers' carts cleaned (when carts exist) |
| F6.7 | Edits after go-live | Owner edits product facts (re-validated against its contract, re-reviewed when needed); paired sellers edit only offer data; captcha on catalog-level edits |
| F6.8 | Version history | Every product version kept; compare any two with colour coding |

### Category versioning → catalog migration

| ID | Feature | Details |
| --- | --- | --- |
| F6.9 | Contract diff | Compare contract vN and vN+1; classify each change (no impact · deterministic mapping · needs confirmation · needs new data) |
| F6.10 | Migration plan | Per product: re-pin silently, auto-migrate and notify, ask owner to acknowledge a pre-filled change, or ask owner to edit within the cool-off period |
| F6.11 | Pairing preservation | If the product's facts did not actually change, paired offers stay paired; otherwise paired sellers re-confirm |
| F6.12 | Cool-off enforcement | Unresolved products move to Action required, then Inactive when the cool-off ends |
| F6.13 | Impact preview for category team | Before publishing vN+1 the checker/approver sees how many products and offers fall in each class (feeds R3's approval screen) |

### Brand and OEM ripple

| ID | Feature | Details |
| --- | --- | --- |
| F6.14 | OEM changes | MRP change, country-of-origin change, brand-level certificate change → each paired reseller gets an action with a suggested compliant value and a deadline |
| F6.15 | Ownership transfer | When an OEM is onboarded for a brand, existing products of that brand transfer to it; resellers notified |
| F6.16 | Brand maintenance | Upgrade unregistered → registered; trademark renewal with reminders (6 m, 3 m, 1 m, 15 d, 7 d); add device marks (linked requests); logo change rules |
| F6.17 | Certificate expiry | Reminders at configured offsets; on expiry, linked products/offers go inactive until replaced; replacing a certificate updates every product using it |

### Seller tools

| ID | Feature | Details |
| --- | --- | --- |
| F6.18 | Action Centre | One deadline-sorted list of everything needing the seller: what happened, what to do, by when, with a button to the exact field |
| F6.19 | Bulk price & stock | Browser grid (and CSV) with live validation against offer rules; apply to selected offers |
| F6.20 | Downloads | Download all products/offers and status details as Excel |
| F6.21 | Notification preferences | Email vs in-app per event type; daily digest option |

## Exit demo

1. Approver publishes Gaming laptops v2 (new mandatory spec "NPU", RAM values regrouped); impact preview shows 40 auto-migrate, 8 need acknowledgement, 3 need edit.
2. A seller's Action Centre shows the 3 edits with a deadline; one fix keeps its resellers paired.
3. OEM lowers MRP; resellers above the new band see a suggested price and accept it in one click.
4. A certificate expires overnight; affected offers go inactive and reappear in the Action Centre.
