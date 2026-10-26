# R5 · Catalog creation and product approval

**Goal:** sellers create, pair or clone products against the published Category Contract, add their offer, and get them approved by the brand owner (where required) and the product reviewers. Live products appear in a read-only marketplace preview. **R5 completes the MVP.**

**Depends on:** R2 (contract), R3 (publishing, review engine), R4 (sellers, brands, certificates). **Indicative size:** 4 sprints.

## Scope

### Product model

| ID | Feature | Details |
| --- | --- | --- |
| F5.1 | Product vs offer | Product = shared facts (brand, model, specs, media, brand-level certificates), owned by the OEM where one exists, else the creating reseller. Offer = one seller's price, stock, serviceability, seller-level certificates |
| F5.2 | Pinning | Each product pins the contract version it was validated against |
| F5.3 | IDs | Product ID issued at creation (draft), public product code on approval; offer ID per seller; seller SKU; drafts expire after the configured lifetime with warnings |

### Creating

| ID | Feature | Details |
| --- | --- | --- |
| F5.4 | Start | Choose an approved brand-category relation (inherited context, Orbita style) or a bid number (pre-selects category version) |
| F5.5 | Find before create | Model number / key specs matched against live products, the review queue and recent rejections; "already listed → pair it" offered first |
| F5.6 | Contract-driven form | One generic renderer builds the specs step from the contract's `uiSchema`; live validation and dependency rules; hints; groups; importance badges |
| F5.7 | Manufacturing & origin | Country of origin picker that only allows legal combinations (India / FTA / land-border rules from flags); local-content percentage; manufacturing location from VA-approved addresses (or typed when the OEM is not on platform); MSE / startup info read from the profile; PLI / FTA sections when enabled |
| F5.8 | Certificates | Required certificates computed from the contract rules and confirmed specs; pick from library or upload new; brand-level vs seller-level |
| F5.9 | Price & commercial | MRP / price label with proof document; offer price shown with its live allowed band; GST rate or multi-GST; cess; reverse-charge option; delayed-payment options; volume discounts on the category's slabs |
| F5.10 | Availability | Across India · custom locations · zone-based (up to 5 zones) using seller serviceability templates; MOQ; delivery time; stock (static or monthly supply rate) |
| F5.11 | Media | Images by role (primary, alternate views, details, packaging), video and brochure when enabled; size/type checks; basic background clean-up |
| F5.12 | Title | Generated from the contract's title template; seller can't free-type over it |
| F5.13 | Readiness & preview | Readiness meter (blocking vs recommended); product page preview; captcha + terms (including category terms) on submit |
| F5.14 | Pair | Create an offer on an existing product: specs, brand, model, price label locked; seller adds offer data and seller-level certificates; reverify manufacturing details |
| F5.15 | Clone | Copy a product's specs (and media if own product) into a new draft; must change at least one non-optional field or the brand |
| F5.16 | Entry points | From Catalogs › Create, and "Sell this item" (clone / pair) on the marketplace preview product page |

### Approving

| ID | Feature | Details |
| --- | --- | --- |
| F5.17 | Owner approval | Reseller products for a brand whose owner is on the platform go to the OEM dashboard first (when required by flags/segment rules); OEM can view, edit and submit |
| F5.18 | Product review | Product reviewer queue (review engine) with the review payload: same-product hits, certificate checks, price checks, category notes and instructions; approve / reject / notify (show-cause) |
| F5.19 | Seller statuses | Shown as three buckets: Live · Needs you · Not live, with the precise status underneath |

### Marketplace preview (read-only)

| ID | Feature | Details |
| --- | --- | --- |
| F5.20 | Listing page | Category page with filters generated from the contract's `filters` (importance, preference ranges, group names, multi-select AND/OR behaviour) |
| F5.21 | Product page | Specs grouped as configured, offers from all sellers, certificates, media; "Sell this item" for logged-in sellers |

## Data added

`product`, `product_media`, `offer`, `offer_zone`, `serviceability_template`, `product_certificate`, `offer_certificate`, `product_review_payload`

## Screens

Seller: Catalogs (list, draft), Create product wizard, Pair, Clone, Offer editor, Serviceability templates. OEM: Reseller submissions. Reviewer: Product review. Public: Category listing, Product page.

## Out of scope

Offer staleness and maintenance automation (R6), AI extraction (R7), bulk upload and variant families (R8), checkout.

## Exit demo (MVP pilot script)

1. OEM creates "NOVARA Gaming Laptop Pro" in Gaming laptops; the form comes entirely from the published contract; price outside the band is flagged live.
2. Certificates required by the specs (wireless → radio compliance) are requested; OEM picks them from the library.
3. Product reviewer approves; the product appears on the marketplace preview with filters working.
4. A reseller searches the same model, is offered "pair", adds price, stock and zones; the offer goes live after review.
5. A second reseller tries to create a duplicate and is redirected to pairing.
