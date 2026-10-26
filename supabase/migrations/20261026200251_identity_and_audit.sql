CREATE TYPE "public"."scope_type" AS ENUM('global', 'workgroup', 'org', 'brand');--> statement-breakpoint
CREATE TYPE "public"."user_kind" AS ENUM('staff', 'seller');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('invited', 'active', 'deactivated');--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text DEFAULT '' NOT NULL,
	"kind" "user_kind" DEFAULT 'staff' NOT NULL,
	"status" "user_status" DEFAULT 'invited' NOT NULL,
	"invited_by" uuid,
	"invited_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"deactivated_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"scope_type" "scope_type" DEFAULT 'global' NOT NULL,
	"scope_id" uuid,
	"granted_by" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_by" uuid,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"actor_email" text,
	"action" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text,
	"summary" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"meta" jsonb,
	"request_id" text
);
--> statement-breakpoint
ALTER TABLE "role_grants" ADD CONSTRAINT "role_grants_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_email_key" ON "profiles" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "role_grants_user_idx" ON "role_grants" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_grants_active_key" ON "role_grants" USING btree ("user_id","role","scope_type",coalesce("scope_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "role_grants"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "audit_events_occurred_idx" ON "audit_events" USING btree ("occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_events_subject_idx" ON "audit_events" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "audit_events_action_idx" ON "audit_events" USING btree ("action");