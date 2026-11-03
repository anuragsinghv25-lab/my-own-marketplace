CREATE TYPE "public"."address_kind" AS ENUM('registered', 'manufacturing', 'warehouse');--> statement-breakpoint
CREATE TYPE "public"."business_type" AS ENUM('proprietorship', 'partnership', 'llp', 'private_limited', 'public_limited', 'other');--> statement-breakpoint
CREATE TYPE "public"."certificate_status" AS ENUM('pending', 'verified', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."org_status" AS ENUM('pending', 'verified', 'rejected', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."approval_source" AS ENUM('review', 'auto', 'owner_authorisation');--> statement-breakpoint
CREATE TYPE "public"."authorisation_status" AS ENUM('requested', 'granted', 'declined', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."brand_kind" AS ENUM('registered', 'unregistered', 'unbranded');--> statement-breakpoint
CREATE TYPE "public"."brand_relation" AS ENUM('owner', 'manufacturer_for_owner', 'authorised_reseller', 'unbranded');--> statement-breakpoint
CREATE TYPE "public"."brand_status" AS ENUM('proposed', 'active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."case_status" AS ENUM('draft', 'submitted', 'info_requested', 'escalated', 'approved', 'partially_approved', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."mark_type" AS ENUM('word', 'device', 'both');--> statement-breakpoint
CREATE TYPE "public"."name_list_kind" AS ENUM('prohibited', 'negative', 'legally_rejected');--> statement-breakpoint
CREATE TYPE "public"."oem_type" AS ENUM('oem', 'deemed_oem', 'oem_fabricator');--> statement-breakpoint
ALTER TYPE "public"."review_decision_kind" ADD VALUE 'reject';--> statement-breakpoint
ALTER TYPE "public"."review_decision_kind" ADD VALUE 'request_info';--> statement-breakpoint
ALTER TYPE "public"."review_decision_kind" ADD VALUE 'respond';--> statement-breakpoint
ALTER TYPE "public"."review_decision_kind" ADD VALUE 'escalate';--> statement-breakpoint
ALTER TYPE "public"."review_state" ADD VALUE 'rejected';--> statement-breakpoint
CREATE TABLE "certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"type_id" uuid NOT NULL,
	"number" text NOT NULL,
	"issuer" text NOT NULL,
	"valid_from" text,
	"valid_until" text,
	"scope" text DEFAULT '' NOT NULL,
	"file_id" uuid NOT NULL,
	"status" "certificate_status" DEFAULT 'pending' NOT NULL,
	"status_note" text,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "division_members" (
	"division_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "divisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category_node_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_blobs" (
	"path" text PRIMARY KEY NOT NULL,
	"bytes" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"path" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" "address_kind" NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"line1" text NOT NULL,
	"line2" text DEFAULT '' NOT NULL,
	"city" text NOT NULL,
	"state_code" text NOT NULL,
	"pincode" text NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organisations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_name" text NOT NULL,
	"trade_name" text DEFAULT '' NOT NULL,
	"business_type" "business_type" NOT NULL,
	"country" text DEFAULT 'IN' NOT NULL,
	"gstin" text NOT NULL,
	"pan" text NOT NULL,
	"state_code" text NOT NULL,
	"contact_name" text NOT NULL,
	"contact_email" text NOT NULL,
	"contact_phone" text NOT NULL,
	"website" text DEFAULT '' NOT NULL,
	"status" "org_status" DEFAULT 'pending' NOT NULL,
	"status_reason" text,
	"verified_at" timestamp with time zone,
	"terms_accepted_at" timestamp with time zone NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signup_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip" text,
	"email" text NOT NULL,
	"ok" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_authorisations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"owner_org_id" uuid NOT NULL,
	"reseller_org_id" uuid NOT NULL,
	"requested_category_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"granted_category_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"regions" text[] DEFAULT '{}'::text[] NOT NULL,
	"valid_until" date,
	"message" text DEFAULT '' NOT NULL,
	"status" "authorisation_status" DEFAULT 'requested' NOT NULL,
	"decision_note" text,
	"requested_by" uuid NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"category_node_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"request_id" uuid,
	"blocked_by" uuid NOT NULL,
	"blocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revived_by" uuid,
	"revived_at" timestamp with time zone,
	"revive_note" text
);
--> statement-breakpoint
CREATE TABLE "brand_category_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"category_node_id" uuid NOT NULL,
	"relation" "brand_relation" NOT NULL,
	"source" "approval_source" NOT NULL,
	"request_id" uuid,
	"authorisation_id" uuid,
	"regions" text[] DEFAULT '{}'::text[] NOT NULL,
	"valid_until" date,
	"approved_by" uuid,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid
);
--> statement-breakpoint
CREATE TABLE "brand_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"relation" "brand_relation" NOT NULL,
	"brand_kind" "brand_kind" NOT NULL,
	"trademark_id" uuid,
	"category_node_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"owner_name_matches" boolean,
	"undertaking_accepted" boolean DEFAULT false NOT NULL,
	"file_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" "case_status" DEFAULT 'draft' NOT NULL,
	"decision_note" text,
	"created_by" uuid NOT NULL,
	"submitted_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"status" "brand_status" DEFAULT 'proposed' NOT NULL,
	"owner_org_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prohibited_names" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"list" "name_list_kind" NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trademarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"mark_type" "mark_type" NOT NULL,
	"application_number" text NOT NULL,
	"nice_class" integer NOT NULL,
	"owner_name" text NOT NULL,
	"valid_until" date,
	"certificate_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"oem_type" "oem_type" NOT NULL,
	"brand_names" text[] DEFAULT '{}'::text[] NOT NULL,
	"address_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"file_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "case_status" DEFAULT 'draft' NOT NULL,
	"decision_note" text,
	"created_by" uuid NOT NULL,
	"submitted_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "category_nodes" ADD COLUMN "trademark_classes" smallint[] DEFAULT '{}'::smallint[] NOT NULL;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD COLUMN "file_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "review_requests" ADD COLUMN "awaiting_reply_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_type_id_certificate_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."certificate_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "division_members" ADD CONSTRAINT "division_members_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "divisions" ADD CONSTRAINT "divisions_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_addresses" ADD CONSTRAINT "org_addresses_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_authorisations" ADD CONSTRAINT "brand_authorisations_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_authorisations" ADD CONSTRAINT "brand_authorisations_owner_org_id_organisations_id_fk" FOREIGN KEY ("owner_org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_authorisations" ADD CONSTRAINT "brand_authorisations_reseller_org_id_organisations_id_fk" FOREIGN KEY ("reseller_org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_blocks" ADD CONSTRAINT "brand_blocks_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_blocks" ADD CONSTRAINT "brand_blocks_category_node_id_category_nodes_id_fk" FOREIGN KEY ("category_node_id") REFERENCES "public"."category_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_blocks" ADD CONSTRAINT "brand_blocks_request_id_brand_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."brand_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_category_approvals" ADD CONSTRAINT "brand_category_approvals_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_category_approvals" ADD CONSTRAINT "brand_category_approvals_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_category_approvals" ADD CONSTRAINT "brand_category_approvals_category_node_id_category_nodes_id_fk" FOREIGN KEY ("category_node_id") REFERENCES "public"."category_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_category_approvals" ADD CONSTRAINT "brand_category_approvals_request_id_brand_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."brand_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_requests" ADD CONSTRAINT "brand_requests_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_requests" ADD CONSTRAINT "brand_requests_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_requests" ADD CONSTRAINT "brand_requests_trademark_id_trademarks_id_fk" FOREIGN KEY ("trademark_id") REFERENCES "public"."trademarks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_owner_org_id_organisations_id_fk" FOREIGN KEY ("owner_org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trademarks" ADD CONSTRAINT "trademarks_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trademarks" ADD CONSTRAINT "trademarks_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trademarks" ADD CONSTRAINT "trademarks_certificate_file_id_files_id_fk" FOREIGN KEY ("certificate_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_assessments" ADD CONSTRAINT "vendor_assessments_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "certificates_org_idx" ON "certificates" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "certificates_status_idx" ON "certificates" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "division_members_key" ON "division_members" USING btree ("division_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "divisions_org_name_key" ON "divisions" USING btree ("org_id",lower("name"));--> statement-breakpoint
CREATE INDEX "files_org_idx" ON "files" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "org_addresses_org_idx" ON "org_addresses" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organisations_gstin_key" ON "organisations" USING btree ("gstin");--> statement-breakpoint
CREATE INDEX "organisations_status_idx" ON "organisations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "signup_attempts_ip_idx" ON "signup_attempts" USING btree ("ip","created_at");--> statement-breakpoint
CREATE INDEX "signup_attempts_email_idx" ON "signup_attempts" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "brand_authorisations_owner_idx" ON "brand_authorisations" USING btree ("owner_org_id","status");--> statement-breakpoint
CREATE INDEX "brand_authorisations_reseller_idx" ON "brand_authorisations" USING btree ("reseller_org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_blocks_active_key" ON "brand_blocks" USING btree ("brand_id","category_node_id") WHERE "brand_blocks"."revived_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "brand_category_approvals_active_key" ON "brand_category_approvals" USING btree ("org_id","brand_id","category_node_id") WHERE "brand_category_approvals"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "brand_category_approvals_brand_idx" ON "brand_category_approvals" USING btree ("brand_id","category_node_id");--> statement-breakpoint
CREATE INDEX "brand_requests_org_idx" ON "brand_requests" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "brand_requests_brand_idx" ON "brand_requests" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brands_normalized_key" ON "brands" USING btree ("normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "prohibited_names_key" ON "prohibited_names" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "trademarks_brand_idx" ON "trademarks" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "vendor_assessments_org_idx" ON "vendor_assessments" USING btree ("org_id");