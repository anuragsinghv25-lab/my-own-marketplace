CREATE TYPE "public"."attribute_type" AS ENUM('boolean', 'enumerable', 'multi_enumerable', 'ordinal', 'group_ordinal', 'numeric', 'numeric_range', 'measurable', 'measurable_range', 'text', 'key_value');--> statement-breakpoint
CREATE TYPE "public"."certificate_level" AS ENUM('product', 'seller', 'both');--> statement-breakpoint
CREATE TYPE "public"."flag_group" AS ENUM('category', 'seller', 'buyer', 'marketplace', 'transactional');--> statement-breakpoint
CREATE TYPE "public"."flag_value_type" AS ENUM('boolean', 'number', 'text', 'single_select', 'multi_select', 'range');--> statement-breakpoint
CREATE TYPE "public"."library_status" AS ENUM('active', 'deprecated');--> statement-breakpoint
CREATE TYPE "public"."value_list_kind" AS ENUM('plain', 'ordinal', 'group_ordinal');--> statement-breakpoint
CREATE TYPE "public"."category_version_state" AS ENUM('DRAFT', 'IN_REVIEW', 'SENT_BACK', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'SUPERSEDED', 'DISCARDED');--> statement-breakpoint
CREATE TYPE "public"."category_node_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TABLE "attributes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"data_type" "attribute_type" NOT NULL,
	"value_list_id" uuid,
	"boolean_pair_id" uuid,
	"dimension_id" uuid,
	"default_unit_id" uuid,
	"validation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synonyms" text[] DEFAULT '{}'::text[] NOT NULL,
	"buyer_hint" text DEFAULT '' NOT NULL,
	"seller_hint" text DEFAULT '' NOT NULL,
	"status" "library_status" DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boolean_pairs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"true_label" text NOT NULL,
	"false_label" text NOT NULL,
	"status" "library_status" DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "certificate_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"issuer" text DEFAULT '' NOT NULL,
	"level" "certificate_level" DEFAULT 'product' NOT NULL,
	"fields" text[] DEFAULT '{number}'::text[] NOT NULL,
	"verification" text DEFAULT 'manual' NOT NULL,
	"has_expiry" boolean DEFAULT true NOT NULL,
	"reminder_days" integer[] DEFAULT '{30,7}'::int[] NOT NULL,
	"status" "library_status" DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flag_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"group_name" "flag_group" NOT NULL,
	"owner_module" text DEFAULT 'catalog' NOT NULL,
	"value_type" "flag_value_type" NOT NULL,
	"schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"default_value" jsonb,
	"help_text" text DEFAULT '' NOT NULL,
	"status" "library_status" DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flag_profile_values" (
	"profile_id" uuid NOT NULL,
	"flag_id" uuid NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flag_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "library_status" DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"value" jsonb NOT NULL,
	"value_type" "flag_value_type" DEFAULT 'number' NOT NULL,
	"unit" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit_dimensions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"status" "library_status" DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dimension_id" uuid NOT NULL,
	"code" text NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"factor_to_base" numeric(30, 12) NOT NULL,
	"is_base" boolean DEFAULT false NOT NULL,
	"status" "library_status" DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "value_list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"value" text NOT NULL,
	"weight" integer,
	"group_name" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "library_status" DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "value_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"kind" "value_list_kind" DEFAULT 'plain' NOT NULL,
	"status" "library_status" DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"level" smallint NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"workgroup_id" uuid,
	"status" "category_node_status" DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"state" "category_version_state" DEFAULT 'DRAFT' NOT NULL,
	"assignee_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workgroups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "category_node_status" DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attributes" ADD CONSTRAINT "attributes_value_list_id_value_lists_id_fk" FOREIGN KEY ("value_list_id") REFERENCES "public"."value_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attributes" ADD CONSTRAINT "attributes_boolean_pair_id_boolean_pairs_id_fk" FOREIGN KEY ("boolean_pair_id") REFERENCES "public"."boolean_pairs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attributes" ADD CONSTRAINT "attributes_dimension_id_unit_dimensions_id_fk" FOREIGN KEY ("dimension_id") REFERENCES "public"."unit_dimensions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attributes" ADD CONSTRAINT "attributes_default_unit_id_units_id_fk" FOREIGN KEY ("default_unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flag_profile_values" ADD CONSTRAINT "flag_profile_values_profile_id_flag_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."flag_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flag_profile_values" ADD CONSTRAINT "flag_profile_values_flag_id_flag_definitions_id_fk" FOREIGN KEY ("flag_id") REFERENCES "public"."flag_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_dimension_id_unit_dimensions_id_fk" FOREIGN KEY ("dimension_id") REFERENCES "public"."unit_dimensions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_list_items" ADD CONSTRAINT "value_list_items_list_id_value_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."value_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_aliases" ADD CONSTRAINT "category_aliases_node_id_category_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."category_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_nodes" ADD CONSTRAINT "category_nodes_parent_id_category_nodes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."category_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_nodes" ADD CONSTRAINT "category_nodes_workgroup_id_workgroups_id_fk" FOREIGN KEY ("workgroup_id") REFERENCES "public"."workgroups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_versions" ADD CONSTRAINT "category_versions_node_id_category_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."category_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attributes_code_key" ON "attributes" USING btree (lower("code"));--> statement-breakpoint
CREATE UNIQUE INDEX "attributes_name_key" ON "attributes" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "boolean_pairs_code_key" ON "boolean_pairs" USING btree (lower("code"));--> statement-breakpoint
CREATE UNIQUE INDEX "certificate_types_code_key" ON "certificate_types" USING btree (lower("code"));--> statement-breakpoint
CREATE UNIQUE INDEX "flag_definitions_key_key" ON "flag_definitions" USING btree (lower("key"));--> statement-breakpoint
CREATE UNIQUE INDEX "flag_profile_values_pk" ON "flag_profile_values" USING btree ("profile_id","flag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "flag_profiles_code_key" ON "flag_profiles" USING btree (lower("code"));--> statement-breakpoint
CREATE UNIQUE INDEX "unit_dimensions_code_key" ON "unit_dimensions" USING btree (lower("code"));--> statement-breakpoint
CREATE UNIQUE INDEX "units_code_key" ON "units" USING btree (lower("code"));--> statement-breakpoint
CREATE UNIQUE INDEX "units_one_base_per_dimension" ON "units" USING btree ("dimension_id") WHERE "units"."is_base";--> statement-breakpoint
CREATE UNIQUE INDEX "value_list_items_value_key" ON "value_list_items" USING btree ("list_id",lower("value"));--> statement-breakpoint
CREATE INDEX "value_list_items_list_idx" ON "value_list_items" USING btree ("list_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "value_lists_code_key" ON "value_lists" USING btree (lower("code"));--> statement-breakpoint
CREATE UNIQUE INDEX "category_aliases_alias_key" ON "category_aliases" USING btree (lower("alias"));--> statement-breakpoint
CREATE UNIQUE INDEX "category_nodes_code_key" ON "category_nodes" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "category_nodes_sibling_name_key" ON "category_nodes" USING btree (coalesce("parent_id", '00000000-0000-0000-0000-000000000000'::uuid),lower("name"));--> statement-breakpoint
CREATE INDEX "category_nodes_parent_idx" ON "category_nodes" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "category_versions_node_version_key" ON "category_versions" USING btree ("node_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "category_versions_one_open_draft" ON "category_versions" USING btree ("node_id") WHERE "category_versions"."state" in ('DRAFT', 'IN_REVIEW', 'SENT_BACK');--> statement-breakpoint
CREATE INDEX "category_versions_assignee_idx" ON "category_versions" USING btree ("assignee_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "workgroups_code_key" ON "workgroups" USING btree (lower("code"));--> statement-breakpoint
CREATE UNIQUE INDEX "workgroups_name_key" ON "workgroups" USING btree (lower("name"));