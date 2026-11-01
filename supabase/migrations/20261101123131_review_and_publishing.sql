CREATE TYPE "public"."category_op_status" AS ENUM('active', 'deactivated', 'down_for_buyers', 'down_for_sellers', 'maintenance');--> statement-breakpoint
CREATE TYPE "public"."review_decision_kind" AS ENUM('approve', 'send_back', 'discard', 'withdraw');--> statement-breakpoint
CREATE TYPE "public"."review_state" AS ENUM('open', 'sent_back', 'approved', 'withdrawn', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."review_task_state" AS ENUM('open', 'done', 'cancelled');--> statement-breakpoint
CREATE TABLE "category_schedules" (
	"version_id" uuid PRIMARY KEY NOT NULL,
	"seller_go_live" date NOT NULL,
	"buyer_go_live" date NOT NULL,
	"min_catalogs" integer DEFAULT 0 NOT NULL,
	"test_mode" boolean DEFAULT false NOT NULL,
	"set_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" uuid NOT NULL,
	"status" "category_op_status" NOT NULL,
	"reason" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"set_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid
);
--> statement-breakpoint
CREATE TABLE "category_version_contracts" (
	"version_id" uuid PRIMARY KEY NOT NULL,
	"contract_id" uuid NOT NULL,
	"approved_by" uuid NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"link" text,
	"subject_type" text,
	"subject_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"emailed_at" timestamp with time zone,
	"email_wanted" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"field_key" text,
	"field_label" text,
	"body" text NOT NULL,
	"author_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "review_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"task_id" uuid,
	"attempt" integer NOT NULL,
	"decision" "review_decision_kind" NOT NULL,
	"reason_code" text,
	"note" text DEFAULT '' NOT NULL,
	"decided_by" uuid NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" text NOT NULL,
	"name" text NOT NULL,
	"stages" jsonb NOT NULL,
	"reason_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sla_hours" integer DEFAULT 48 NOT NULL,
	"reminder_hours" integer DEFAULT 24 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_definitions_subject_type_unique" UNIQUE("subject_type")
);
--> statement-breakpoint
CREATE TABLE "review_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"definition_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"title" text NOT NULL,
	"workgroup_id" uuid,
	"state" "review_state" DEFAULT 'open' NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"submitted_by" uuid NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"stage" text NOT NULL,
	"assignee_id" uuid,
	"state" "review_task_state" DEFAULT 'open' NOT NULL,
	"snapshot_id" uuid,
	"snapshot_hash" text,
	"due_at" timestamp with time zone NOT NULL,
	"reminded_at" timestamp with time zone,
	"escalated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "category_versions" ADD COLUMN "submitted_by" uuid;--> statement-breakpoint
ALTER TABLE "category_versions" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "category_versions" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "category_versions" ADD COLUMN "discard_reason" text;--> statement-breakpoint
ALTER TABLE "category_schedules" ADD CONSTRAINT "category_schedules_version_id_category_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."category_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_status_history" ADD CONSTRAINT "category_status_history_node_id_category_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."category_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_version_contracts" ADD CONSTRAINT "category_version_contracts_version_id_category_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."category_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_version_contracts" ADD CONSTRAINT "category_version_contracts_contract_id_category_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."category_contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_request_id_review_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."review_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_request_id_review_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."review_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_task_id_review_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."review_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_definition_id_review_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."review_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_tasks" ADD CONSTRAINT "review_tasks_request_id_review_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."review_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "category_status_history_node_idx" ON "category_status_history" USING btree ("node_id","starts_at");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_email_idx" ON "notifications" USING btree ("email_wanted","emailed_at");--> statement-breakpoint
CREATE INDEX "review_comments_request_idx" ON "review_comments" USING btree ("request_id","created_at");--> statement-breakpoint
CREATE INDEX "review_decisions_request_idx" ON "review_decisions" USING btree ("request_id","decided_at");--> statement-breakpoint
CREATE UNIQUE INDEX "review_requests_one_active" ON "review_requests" USING btree ("subject_type","subject_id") WHERE "review_requests"."state" in ('open', 'sent_back');--> statement-breakpoint
CREATE INDEX "review_requests_state_idx" ON "review_requests" USING btree ("state","subject_type");--> statement-breakpoint
CREATE INDEX "review_tasks_open_idx" ON "review_tasks" USING btree ("state","assignee_id","due_at");--> statement-breakpoint
CREATE INDEX "review_tasks_request_idx" ON "review_tasks" USING btree ("request_id","attempt");