-- R2: security and housekeeping for category configuration.

-- 1. Same rule as R0: the public Data API can never read or change app tables.
ALTER TABLE "version_flag_values" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "spec_definitions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "category_rules" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "category_contracts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "contract_test_cases" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- 2. A version points at the flag profile it applies.
ALTER TABLE "category_versions" ADD CONSTRAINT "category_versions_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."flag_profiles"("id");
--> statement-breakpoint

-- 3. Keep updated_at honest (set_updated_at() comes from the R0 security migration).
CREATE TRIGGER "spec_definitions_set_updated_at" BEFORE UPDATE ON "spec_definitions" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "category_rules_set_updated_at" BEFORE UPDATE ON "category_rules" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "contract_test_cases_set_updated_at" BEFORE UPDATE ON "contract_test_cases" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint

-- 4. Compiled contracts are evidence: once written they never change.
CREATE OR REPLACE FUNCTION "category_contracts_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'category_contracts rows are immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "category_contracts_no_update" BEFORE UPDATE ON "category_contracts" FOR EACH ROW EXECUTE FUNCTION "category_contracts_immutable"();
