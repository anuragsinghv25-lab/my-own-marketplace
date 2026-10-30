CREATE TYPE "public"."category_rule_kind" AS ENUM('restrict', 'require', 'hide', 'price');--> statement-breakpoint
CREATE TYPE "public"."spec_importance" AS ENUM('key', 'required', 'recommended', 'optional');--> statement-breakpoint
CREATE TYPE "public"."spec_preference" AS ENUM('none', 'higher', 'lower');--> statement-breakpoint
CREATE TYPE "public"."contract_test_expectation" AS ENUM('pass', 'fail');--> statement-breakpoint
CREATE TABLE "category_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"ok" boolean NOT NULL,
	"hash" text,
	"contract" jsonb,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tests_passed" integer DEFAULT 0 NOT NULL,
	"tests_failed" integer DEFAULT 0 NOT NULL,
	"compiled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"kind" "category_rule_kind" NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"definition" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_test_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"name" text NOT NULL,
	"expectation" "contract_test_expectation" NOT NULL,
	"sample" jsonb NOT NULL,
	"last_result" text,
	"last_message" text,
	"last_run_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spec_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"attribute_id" uuid NOT NULL,
	"group_name" text DEFAULT 'General' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"importance" "spec_importance" DEFAULT 'optional' NOT NULL,
	"filterable" boolean DEFAULT false NOT NULL,
	"comparable" boolean DEFAULT false NOT NULL,
	"variant_option" boolean DEFAULT false NOT NULL,
	"preference" "spec_preference" DEFAULT 'none' NOT NULL,
	"multiple" boolean,
	"allowed_values" text[],
	"min_value" double precision,
	"max_value" double precision,
	"step" double precision,
	"decimals" smallint,
	"unit_id" uuid,
	"seller_hint" text DEFAULT '' NOT NULL,
	"buyer_hint" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "version_flag_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"flag_id" uuid NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "category_versions" ADD COLUMN "profile_id" uuid;--> statement-breakpoint
ALTER TABLE "category_versions" ADD COLUMN "profile_version" integer;--> statement-breakpoint
ALTER TABLE "category_versions" ADD COLUMN "title_template" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "category_versions" ADD COLUMN "locked_by" uuid;--> statement-breakpoint
ALTER TABLE "category_versions" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "category_versions" ADD COLUMN "editor_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "category_versions" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "category_contracts" ADD CONSTRAINT "category_contracts_version_id_category_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."category_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_version_id_category_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."category_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_test_cases" ADD CONSTRAINT "contract_test_cases_version_id_category_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."category_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spec_definitions" ADD CONSTRAINT "spec_definitions_version_id_category_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."category_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spec_definitions" ADD CONSTRAINT "spec_definitions_attribute_id_attributes_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "public"."attributes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spec_definitions" ADD CONSTRAINT "spec_definitions_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_flag_values" ADD CONSTRAINT "version_flag_values_version_id_category_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."category_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_flag_values" ADD CONSTRAINT "version_flag_values_flag_id_flag_definitions_id_fk" FOREIGN KEY ("flag_id") REFERENCES "public"."flag_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "category_contracts_version_idx" ON "category_contracts" USING btree ("version_id","created_at");--> statement-breakpoint
CREATE INDEX "category_rules_version_idx" ON "category_rules" USING btree ("version_id","sort_order");--> statement-breakpoint
CREATE INDEX "contract_test_cases_version_idx" ON "contract_test_cases" USING btree ("version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "spec_definitions_version_attribute_key" ON "spec_definitions" USING btree ("version_id","attribute_id");--> statement-breakpoint
CREATE INDEX "spec_definitions_version_idx" ON "spec_definitions" USING btree ("version_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "version_flag_values_key" ON "version_flag_values" USING btree ("version_id","flag_id");