# R1 · Attribute library and taxonomy

**Goal:** the building blocks every category is made from. The platform admin defines *what can be configured* and *who owns which part of the tree*; category managers build *the tree*.

**Depends on:** R0. **Indicative size:** 2 sprints. **Status:** built (roles below use the R0.1 model).

## Scope

### Attribute library (platform admin)

| ID | Feature | Details |
| --- | --- | --- |
| F1.1 | Units & dimensions | Dimensions (length, weight, power, volume…) with units and conversion factors; used by measurable attributes |
| F1.2 | Value lists | Reusable lists of allowed values (e.g. processor families); support ordinal weights and groups (group-ordinal); CSV import/export |
| F1.3 | Boolean pairs | Yes/No, True/False, Positive/Negative and admin-defined pairs |
| F1.4 | Attributes | Name, key, description, datatype (boolean, enumerable, ordinal, group-ordinal, numeric discrete, numeric range, measurable discrete/range, text, key-value), unit dimension, default value list, validation (min, max, step, decimals, regex, max length), synonyms, buyer hint, seller hint |
| F1.5 | Attribute usage | "Where used" view: which category versions use the attribute; block deletes of attributes in use (deprecate instead) |
| F1.6 | Flag definitions | Each configuration flag defined as data: key, label, group (category / seller / buyer / marketplace / transactional), owner module, value schema, default, editable-by roles, help text. Seed with the flag set the platform needs (selling units, price label, discount band, allowed sellers, land-border rule, certificates, image/video limits, stock rules, AI check severities, title format, buying modes, bulk upload…) |
| F1.7 | Flag profiles | Named bundles of flag values ("Branded electronics", "Packaged food", "Works contract"), versioned; diff between profiles |
| F1.8 | Certificate types | Certificate type catalogue (e.g. safety, food licence, ISO): fields to capture, levels (product / seller / both), verification method (manual / API later), expiry rules |
| F1.9 | Platform limits | Text lengths, max images, max UoMs, bulk limits, draft lifetime, reminder offsets: all as editable settings |

### Taxonomy (category manager) and workgroups (platform admin)

| ID | Feature | Details |
| --- | --- | --- |
| F1.10 | Category tree | L1 segment → L2 family → L3 class → L4 commodity (UNSPSC-style codes, importable) → L5 listing category (platform-defined); global and custom category types; tree view with search |
| F1.11 | Codes & aliases | Auto-generated L5 codes (copy L4 + `00`, or `01…99` then `A1…`); optional L4 alias and mandatory unique L5 alias |
| F1.12 | Duplicate prevention | Live search of existing categories while typing each level; alias uniqueness rules; duplicate custom L1/L2 blocked |
| F1.13 | Classification edits | Move/rename nodes (requested by checker, done by creator/super admin) with audit and impact note |
| F1.14 | Workgroups | Create workgroups; attach category subtrees; add members with roles (drafter, checker, approver); auto-assign the only checker, otherwise creator picks |
| F1.15 | Category shell creation | Creating an L5 creates an empty **draft version v0** assigned to the workgroup's checker (configured in R2) |
| F1.16 | Notifications | Category assigned to checker → in-app + email |

## Data added

`unit_dimension`, `unit`, `value_list`, `value`, `attribute`, `flag_definition`, `flag_profile`, `flag_profile_value`, `certificate_type`, `platform_setting`, `category_node`, `workgroup`, `workgroup_member`, `workgroup_scope`, `category_version` (shell only)

## Screens

Admin › Library (attributes, value lists, units, Boolean pairs, flags, profiles, certificate types, limits) · Workbench › Taxonomy tree · Create category wizard · Workgroups

## Out of scope

Configuring a specific category (R2). Approving categories (R3).

## Exit demo

1. Platform admin creates attributes *Processor*, *RAM (GB)*, *Display size (inch)*, *Refresh rate (Hz)* and a flag profile "Branded electronics".
2. Platform admin creates the "IT Hardware" workgroup with a category manager and an approver, covering L1 "IT & Electronics".
3. The category manager builds IT & Electronics › Portable computers › Notebooks › Notebook computers › Gaming laptops (L5), alias "High Performance Gaming Laptops"; tries a duplicate alias and is blocked.
4. The workgroup's category manager sees the empty draft v0 assigned to them on the workbench home.

## As built

| Item | Decision |
| --- | --- |
| Roles | Library, flags, profiles, limits and workgroups: platform admin. Tree: category manager (global, or limited to a workgroup's subtree). Approvers and auditors read the tree. |
| Workgroups | Assigned to any node; children inherit. Members are role grants scoped to the workgroup, so separation-of-duties rules apply. |
| Codes | L1 two digits, each level adds two (UNSPSC-style, manual entry allowed for L1–L4); L5 = commodity code + `-01…99`, then `A1…`. Codes stay the same when a category moves. |
| Duplicates | Sibling names unique; aliases unique across the tree and never equal to another category's name; live "similar categories" search (trigram) while typing. |
| L5 shell | Creating an L5 creates draft v0, assigned to the workgroup's category manager when there is exactly one, otherwise to the creator. |
| Deprecate, never delete | Library rows and value-list items are deprecated, so categories configured in R2 keep working. |
| Starter data | Units for 8 dimensions, 4 yes/no label pairs, 16 platform flags, 7 platform limits and 4 certificate types are seeded by migration. |
| API | `GET /api/v1/library/attributes`, `GET /api/v1/taxonomy/tree`. |
| Deferred | CSV import/export of value lists, profile diff view, "where used" (needs R2 category versions), email notifications for assignments. |
