-- R0.1: 18 roles become 8 (see docs/architecture/02-roles-and-permissions.md).
-- Existing grants move to their replacement role; old grants are revoked (kept as history).

-- 1. Mark demo accounts created by /setup (everyone it seeded except the platform admin).
UPDATE "profiles" SET "is_demo" = true
WHERE "id"::text IN (
  SELECT "subject_id" FROM "audit_events"
  WHERE "action" = 'user.seeded' AND coalesce("after"->>'role', '') <> 'platform_admin'
);
--> statement-breakpoint

-- 2. Grant the replacement role (once per user and scope) for every active legacy grant.
WITH "legacy"("old_role", "new_role") AS (
  VALUES
    ('category_creator', 'category_manager'),
    ('category_drafter', 'category_manager'),
    ('category_checker', 'category_manager'),
    ('category_approver', 'approver'),
    ('agency_manager', 'approver'),
    ('marketplace_manager', 'approver'),
    ('committee_member', 'approver'),
    ('va_officer', 'reviewer'),
    ('brand_specialist', 'reviewer'),
    ('product_reviewer', 'reviewer'),
    ('seller_lister', 'seller_staff'),
    ('seller_pricing', 'seller_staff')
),
"wanted" AS (
  SELECT DISTINCT g."user_id", l."new_role", g."scope_type", g."scope_id"
  FROM "role_grants" g JOIN "legacy" l ON l."old_role" = g."role"
  WHERE g."revoked_at" IS NULL
)
INSERT INTO "role_grants" ("user_id", "role", "scope_type", "scope_id")
SELECT w."user_id", w."new_role", w."scope_type", w."scope_id"
FROM "wanted" w
WHERE NOT EXISTS (
  SELECT 1 FROM "role_grants" e
  WHERE e."user_id" = w."user_id" AND e."role" = w."new_role" AND e."scope_type" = w."scope_type"
    AND e."scope_id" IS NOT DISTINCT FROM w."scope_id" AND e."revoked_at" IS NULL
)
-- separation of duties: never end up reviewer + approver on the same person
AND NOT (w."new_role" = 'reviewer' AND EXISTS (
  SELECT 1 FROM "wanted" o WHERE o."user_id" = w."user_id" AND o."new_role" = 'approver'
));
--> statement-breakpoint

-- 3. Revoke every grant of a role that no longer exists.
UPDATE "role_grants" SET "revoked_at" = now()
WHERE "revoked_at" IS NULL
  AND "role" NOT IN ('platform_admin', 'category_manager', 'approver', 'reviewer', 'auditor',
                     'seller_admin', 'seller_staff', 'brand_owner');
--> statement-breakpoint

-- 4. Leave a trace in the audit trail.
INSERT INTO "audit_events" ("action", "subject_type", "summary", "meta")
VALUES ('system.roles_consolidated', 'role',
        'Roles consolidated from 18 to 8 (R0.1); legacy grants mapped to their replacement and revoked',
        '{"release": "R0.1"}'::jsonb);
