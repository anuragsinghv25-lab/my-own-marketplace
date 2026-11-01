-- R3: security, freezing and defaults for reviews and category publishing.

-- 1. Same rule as R0: the public Data API can never read or change app tables.
ALTER TABLE "review_definitions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "review_requests" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "review_tasks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "review_decisions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "review_comments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "category_schedules" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "category_status_history" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "category_version_contracts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- 2. Keep updated_at honest.
CREATE TRIGGER "review_definitions_set_updated_at" BEFORE UPDATE ON "review_definitions" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "review_requests_set_updated_at" BEFORE UPDATE ON "review_requests" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "category_schedules_set_updated_at" BEFORE UPDATE ON "category_schedules" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint

-- 3. Decisions and approvals are evidence: never changed or removed.
CREATE OR REPLACE FUNCTION "append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "review_decisions_append_only" BEFORE UPDATE OR DELETE ON "review_decisions" FOR EACH ROW EXECUTE FUNCTION "append_only"();
--> statement-breakpoint
CREATE TRIGGER "category_version_contracts_append_only" BEFORE UPDATE OR DELETE ON "category_version_contracts" FOR EACH ROW EXECUTE FUNCTION "append_only"();
--> statement-breakpoint

-- 4. Freeze: once a version leaves DRAFT / SENT_BACK its configuration cannot change, whoever asks.
CREATE OR REPLACE FUNCTION "assert_version_editable"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  vid uuid;
  st text;
BEGIN
  IF TG_OP = 'DELETE' THEN vid := OLD.version_id; ELSE vid := NEW.version_id; END IF;
  SELECT state INTO st FROM category_versions WHERE id = vid;
  -- the version itself being deleted (cascade) has no row left to check
  IF st IS NOT NULL AND st NOT IN ('DRAFT', 'SENT_BACK') THEN
    RAISE EXCEPTION 'category version % is % and frozen', vid, st USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "spec_definitions_frozen" BEFORE INSERT OR UPDATE OR DELETE ON "spec_definitions" FOR EACH ROW EXECUTE FUNCTION "assert_version_editable"();
--> statement-breakpoint
CREATE TRIGGER "category_rules_frozen" BEFORE INSERT OR UPDATE OR DELETE ON "category_rules" FOR EACH ROW EXECUTE FUNCTION "assert_version_editable"();
--> statement-breakpoint
CREATE TRIGGER "version_flag_values_frozen" BEFORE INSERT OR UPDATE OR DELETE ON "version_flag_values" FOR EACH ROW EXECUTE FUNCTION "assert_version_editable"();
--> statement-breakpoint
CREATE TRIGGER "contract_test_cases_frozen" BEFORE INSERT OR UPDATE OR DELETE ON "contract_test_cases" FOR EACH ROW EXECUTE FUNCTION "assert_version_editable"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "category_version_frozen_fields"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state NOT IN ('DRAFT', 'SENT_BACK')
     AND (NEW.title_template IS DISTINCT FROM OLD.title_template
          OR NEW.profile_id IS DISTINCT FROM OLD.profile_id
          OR NEW.profile_version IS DISTINCT FROM OLD.profile_version
          OR NEW.node_id IS DISTINCT FROM OLD.node_id
          OR NEW.version IS DISTINCT FROM OLD.version) THEN
    RAISE EXCEPTION 'category version % is % and frozen', OLD.id, OLD.state USING ERRCODE = 'check_violation';
  END IF;
  -- published history only moves forward
  IF OLD.state IN ('PUBLISHED', 'SUPERSEDED', 'DISCARDED') AND NEW.state IS DISTINCT FROM OLD.state
     AND NOT (OLD.state = 'PUBLISHED' AND NEW.state = 'SUPERSEDED') THEN
    RAISE EXCEPTION 'category version % cannot go from % to %', OLD.id, OLD.state, NEW.state USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "category_versions_frozen_fields" BEFORE UPDATE ON "category_versions" FOR EACH ROW EXECUTE FUNCTION "category_version_frozen_fields"();
--> statement-breakpoint

-- 5. Integrity the schema file cannot express.
ALTER TABLE "category_schedules" ADD CONSTRAINT "category_schedules_buyer_after_seller" CHECK ("buyer_go_live" >= "seller_go_live");
--> statement-breakpoint
ALTER TABLE "category_schedules" ADD CONSTRAINT "category_schedules_min_catalogs" CHECK ("min_catalogs" >= 0);
--> statement-breakpoint
ALTER TABLE "category_status_history" ADD CONSTRAINT "category_status_history_window" CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at");
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- one published version per category at a time
CREATE UNIQUE INDEX "category_versions_one_published" ON "category_versions" ("node_id") WHERE "state" = 'PUBLISHED';
--> statement-breakpoint

-- 6. How category versions are reviewed (editable by a platform admin: Admin → Review rules).
INSERT INTO "review_definitions" ("subject_type", "name", "stages", "reason_codes", "sla_hours", "reminder_hours", "max_attempts")
VALUES (
  'category_version',
  'Category version approval',
  '[{"key":"approval","label":"Approval","role":"approver"}]'::jsonb,
  '[
    {"code":"spec_incomplete","label":"Specifications incomplete or unclear","for":["send_back"]},
    {"code":"rule_wrong","label":"A rule is wrong or missing","for":["send_back"]},
    {"code":"values_wrong","label":"Allowed values or ranges are wrong","for":["send_back"]},
    {"code":"title_wrong","label":"Product title template needs work","for":["send_back"]},
    {"code":"flags_wrong","label":"Flags or offer terms are wrong","for":["send_back"]},
    {"code":"duplicate","label":"Duplicates another category","for":["discard"]},
    {"code":"not_needed","label":"Category no longer needed","for":["discard"]},
    {"code":"other","label":"Other (explain in the note)","for":["send_back","discard"]}
  ]'::jsonb,
  48,
  24,
  5
) ON CONFLICT ("subject_type") DO NOTHING;
