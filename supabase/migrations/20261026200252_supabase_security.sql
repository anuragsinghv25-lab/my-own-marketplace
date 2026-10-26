-- Supabase-specific hardening that Drizzle does not model.

-- 1. A profile cannot exist without its Supabase Auth user; deleting the auth user removes the profile
--    (and, through role_grants' own FK, its grants). Audit events stay.
ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_id_auth_users_fk"
  FOREIGN KEY ("id") REFERENCES auth.users ("id") ON DELETE CASCADE;
--> statement-breakpoint

-- 2. The app reads and writes these tables from the server with its own database role.
--    Turn on row level security with no policies, so the public Supabase REST/GraphQL API
--    (anon / authenticated keys) can never read or change them.
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "role_grants" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- 3. The audit trail is append-only.
CREATE OR REPLACE FUNCTION "audit_events_append_only"() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only (% is not allowed)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "audit_events_no_update_delete"
  BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION "audit_events_append_only"();
--> statement-breakpoint
CREATE TRIGGER "audit_events_no_truncate"
  BEFORE TRUNCATE ON "audit_events"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_events_append_only"();
--> statement-breakpoint

-- 4. Keep updated_at honest.
CREATE OR REPLACE FUNCTION "set_updated_at"() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  NEW."updated_at" := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "profiles_set_updated_at"
  BEFORE UPDATE ON "profiles"
  FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
