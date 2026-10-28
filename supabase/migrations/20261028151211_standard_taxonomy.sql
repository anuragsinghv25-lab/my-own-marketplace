CREATE TYPE "public"."standard_source" AS ENUM('custom', 'shopify', 'unspsc');--> statement-breakpoint
CREATE TYPE "public"."category_attribute_origin" AS ENUM('manual', 'shopify', 'unspsc');--> statement-breakpoint
CREATE TYPE "public"."category_kind" AS ENUM('group', 'listing');--> statement-breakpoint
CREATE TABLE "reference_attributes" (
	"source" "standard_source" NOT NULL,
	"handle" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"base_handle" text,
	"values" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "reference_attributes_source_handle_pk" PRIMARY KEY("source","handle")
);
--> statement-breakpoint
CREATE TABLE "reference_categories" (
	"source" "standard_source" NOT NULL,
	"external_id" text NOT NULL,
	"parent_external_id" text,
	"level" smallint NOT NULL,
	"name" text NOT NULL,
	"full_path" text NOT NULL,
	"attribute_handles" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_leaf" boolean DEFAULT true NOT NULL,
	CONSTRAINT "reference_categories_source_external_id_pk" PRIMARY KEY("source","external_id")
);
--> statement-breakpoint
CREATE TABLE "reference_taxonomies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "standard_source" NOT NULL,
	"version" text NOT NULL,
	"loaded_parts" text[] DEFAULT '{}'::text[] NOT NULL,
	"category_count" integer DEFAULT 0 NOT NULL,
	"attribute_count" integer DEFAULT 0 NOT NULL,
	"complete" boolean DEFAULT false NOT NULL,
	"loaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_attributes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" uuid NOT NULL,
	"attribute_id" uuid NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"origin" "category_attribute_origin" DEFAULT 'manual' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attributes" ADD COLUMN "source" "standard_source" DEFAULT 'custom' NOT NULL;--> statement-breakpoint
ALTER TABLE "attributes" ADD COLUMN "external_ref" text;--> statement-breakpoint
ALTER TABLE "value_lists" ADD COLUMN "source" "standard_source" DEFAULT 'custom' NOT NULL;--> statement-breakpoint
ALTER TABLE "value_lists" ADD COLUMN "external_ref" text;--> statement-breakpoint
ALTER TABLE "category_nodes" ADD COLUMN "kind" "category_kind" DEFAULT 'group' NOT NULL;--> statement-breakpoint
ALTER TABLE "category_nodes" ADD COLUMN "source" "standard_source" DEFAULT 'custom' NOT NULL;--> statement-breakpoint
ALTER TABLE "category_nodes" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "category_nodes" ADD COLUMN "unspsc_code" text;--> statement-breakpoint
ALTER TABLE "category_attributes" ADD CONSTRAINT "category_attributes_node_id_category_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."category_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_attributes" ADD CONSTRAINT "category_attributes_attribute_id_attributes_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "public"."attributes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reference_categories_parent_idx" ON "reference_categories" USING btree ("source","parent_external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reference_taxonomies_source_key" ON "reference_taxonomies" USING btree ("source");--> statement-breakpoint
CREATE UNIQUE INDEX "category_attributes_node_attribute_key" ON "category_attributes" USING btree ("node_id","attribute_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attributes_external_key" ON "attributes" USING btree ("source","external_ref") WHERE "attributes"."external_ref" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "value_lists_external_key" ON "value_lists" USING btree ("source","external_ref") WHERE "value_lists"."external_ref" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "category_nodes_external_key" ON "category_nodes" USING btree ("source","external_id") WHERE "category_nodes"."external_id" is not null;