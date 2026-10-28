-- R1: security, search indexes and starter reference data for the attribute library and taxonomy.

-- 1. Same rule as R0: the public Data API can never read or change app tables.
ALTER TABLE "unit_dimensions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "units" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "value_lists" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "value_list_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "boolean_pairs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "attributes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "certificate_types" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "flag_definitions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "flag_profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "flag_profile_values" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "platform_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "workgroups" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "category_nodes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "category_aliases" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "category_versions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- 2. Fuzzy "did you mean an existing category?" search (Supabase keeps extensions in their own schema).
CREATE SCHEMA IF NOT EXISTS extensions;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
--> statement-breakpoint
-- If pg_trgm was already installed elsewhere (e.g. public), move it so extensions.* names resolve.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
             WHERE e.extname = 'pg_trgm' AND n.nspname <> 'extensions') THEN
    ALTER EXTENSION pg_trgm SET SCHEMA extensions;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX "category_nodes_name_trgm" ON "category_nodes" USING gin (lower("name") extensions.gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "category_aliases_alias_trgm" ON "category_aliases" USING gin (lower("alias") extensions.gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "attributes_name_trgm" ON "attributes" USING gin (lower("name") extensions.gin_trgm_ops);
--> statement-breakpoint

-- 3. Keep updated_at honest (set_updated_at() comes from the R0 security migration).
CREATE TRIGGER "unit_dimensions_set_updated_at" BEFORE UPDATE ON "unit_dimensions" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "units_set_updated_at" BEFORE UPDATE ON "units" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "value_lists_set_updated_at" BEFORE UPDATE ON "value_lists" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "boolean_pairs_set_updated_at" BEFORE UPDATE ON "boolean_pairs" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "attributes_set_updated_at" BEFORE UPDATE ON "attributes" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "certificate_types_set_updated_at" BEFORE UPDATE ON "certificate_types" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "flag_definitions_set_updated_at" BEFORE UPDATE ON "flag_definitions" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "flag_profiles_set_updated_at" BEFORE UPDATE ON "flag_profiles" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "workgroups_set_updated_at" BEFORE UPDATE ON "workgroups" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "category_nodes_set_updated_at" BEFORE UPDATE ON "category_nodes" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "category_versions_set_updated_at" BEFORE UPDATE ON "category_versions" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint

-- 4. Starter reference data. Admins can change or deprecate any of it.
INSERT INTO "unit_dimensions" ("code", "name") VALUES
  ('length', 'Length'), ('mass', 'Mass'), ('data_storage', 'Data storage'), ('frequency', 'Frequency'),
  ('power', 'Power'), ('voltage', 'Voltage'), ('volume', 'Volume'), ('time', 'Time');
--> statement-breakpoint
INSERT INTO "units" ("dimension_id", "code", "symbol", "name", "factor_to_base", "is_base")
SELECT d."id", u."code", u."symbol", u."name", u."factor", u."is_base"
FROM (VALUES
  ('length', 'mm', 'mm', 'Millimetre', 0.001, false), ('length', 'cm', 'cm', 'Centimetre', 0.01, false),
  ('length', 'm', 'm', 'Metre', 1, true), ('length', 'inch', 'in', 'Inch', 0.0254, false), ('length', 'ft', 'ft', 'Foot', 0.3048, false),
  ('mass', 'g', 'g', 'Gram', 0.001, false), ('mass', 'kg', 'kg', 'Kilogram', 1, true),
  ('data_storage', 'mb', 'MB', 'Megabyte', 0.001, false), ('data_storage', 'gb', 'GB', 'Gigabyte', 1, true), ('data_storage', 'tb', 'TB', 'Terabyte', 1000, false),
  ('frequency', 'hz', 'Hz', 'Hertz', 1, true), ('frequency', 'khz', 'kHz', 'Kilohertz', 1000, false),
  ('frequency', 'mhz', 'MHz', 'Megahertz', 1000000, false), ('frequency', 'ghz', 'GHz', 'Gigahertz', 1000000000, false),
  ('power', 'w', 'W', 'Watt', 1, true), ('power', 'kw', 'kW', 'Kilowatt', 1000, false),
  ('voltage', 'v', 'V', 'Volt', 1, true),
  ('volume', 'ml', 'ml', 'Millilitre', 0.001, false), ('volume', 'l', 'l', 'Litre', 1, true),
  ('time', 's', 's', 'Second', 1, true), ('time', 'min', 'min', 'Minute', 60, false), ('time', 'h', 'h', 'Hour', 3600, false)
) AS u("dim", "code", "symbol", "name", "factor", "is_base")
JOIN "unit_dimensions" d ON d."code" = u."dim";
--> statement-breakpoint
INSERT INTO "boolean_pairs" ("code", "true_label", "false_label") VALUES
  ('yes_no', 'Yes', 'No'), ('true_false', 'True', 'False'),
  ('positive_negative', 'Positive', 'Negative'), ('available', 'Available', 'Not available');
--> statement-breakpoint
INSERT INTO "certificate_types" ("code", "name", "issuer", "level", "fields", "has_expiry") VALUES
  ('bis', 'BIS certification (ISI / CRS)', 'Bureau of Indian Standards', 'product', '{number,issued_on,valid_until}', true),
  ('wpc_eta', 'WPC Equipment Type Approval', 'Wireless Planning & Coordination Wing', 'product', '{number,issued_on}', false),
  ('fssai', 'FSSAI licence', 'Food Safety and Standards Authority of India', 'seller', '{number,valid_until}', true),
  ('iso_9001', 'ISO 9001 quality management', 'Accredited certification body', 'seller', '{number,issued_on,valid_until}', true);
--> statement-breakpoint
INSERT INTO "flag_definitions" ("key", "label", "group_name", "owner_module", "value_type", "schema", "default_value", "help_text") VALUES
  ('selling_units', 'Selling units', 'category', 'catalog', 'multi_select', '{"options":["piece","pack","set","kg","litre","metre"]}', '["piece"]', 'Units a seller may list this category in.'),
  ('price_label', 'Price label', 'marketplace', 'catalog', 'single_select', '{"options":["offer_price","offer_price_with_mrp"]}', '"offer_price_with_mrp"', 'How the price is shown to buyers.'),
  ('discount_band', 'Discount band', 'category', 'catalog', 'range', '{"unit":"%","min":0,"max":100}', '{"min":5,"max":40}', 'Allowed discount off MRP. Offers outside the band are flagged.'),
  ('allowed_sellers', 'Allowed sellers', 'seller', 'brand', 'single_select', '{"options":["all","oem_only","oem_and_authorised"]}', '"oem_and_authorised"', 'Who may list products in this category.'),
  ('land_border_rule', 'Land-border rule', 'transactional', 'seller', 'boolean', '{}', 'true', 'Restrict sellers from countries sharing a land border unless registered with the competent authority.'),
  ('certificates_required', 'Certificates required', 'category', 'catalog', 'boolean', '{}', 'false', 'Products must carry the certificates the specifications ask for.'),
  ('country_of_origin_required', 'Country of origin required', 'category', 'catalog', 'boolean', '{}', 'true', 'Sellers must declare country of origin and local content.'),
  ('max_images', 'Images per product', 'category', 'catalog', 'number', '{"min":1,"max":20}', '6', 'Maximum product images.'),
  ('video_allowed', 'Product video allowed', 'category', 'catalog', 'boolean', '{}', 'false', 'Sellers may add a product video.'),
  ('stock_warning_days', 'Stock freshness warning', 'category', 'offer', 'number', '{"unit":"days","min":1,"max":365}', '30', 'Days without a stock update before an offer shows Expiring soon.'),
  ('stock_expiry_days', 'Stock freshness expiry', 'category', 'offer', 'number', '{"unit":"days","min":1,"max":365}', '60', 'Days without a stock update before an offer expires.'),
  ('ai_image_check_severity', 'AI image check severity', 'category', 'ai', 'single_select', '{"options":["off","warn","block"]}', '"warn"', 'What happens when the AI image check finds a problem.'),
  ('title_format', 'Product title format', 'category', 'catalog', 'text', '{}', '"{brand} {model} {key_specs}"', 'Template used to generate product titles.'),
  ('buying_modes', 'Buying modes', 'buyer', 'buying', 'multi_select', '{"options":["direct_purchase","l1_purchase","bid","reverse_auction"]}', '["direct_purchase","bid"]', 'How buyers may procure products in this category.'),
  ('bulk_upload_allowed', 'Bulk upload allowed', 'seller', 'catalog', 'boolean', '{}', 'true', 'Sellers may create products by file upload.'),
  ('min_catalogs_for_buyer_golive', 'Catalogs before buyer go-live', 'marketplace', 'catalog', 'number', '{"min":1,"max":100}', '3', 'Approved catalogs needed before buyers can buy directly.');
--> statement-breakpoint
INSERT INTO "platform_settings" ("key", "label", "value", "value_type", "unit", "description") VALUES
  ('product_title_max_length', 'Product title length', '120', 'number', 'characters', 'Longest product title allowed.'),
  ('product_description_max_length', 'Product description length', '2000', 'number', 'characters', 'Longest product description allowed.'),
  ('max_images_hard_limit', 'Images per product (platform cap)', '20', 'number', 'images', 'No category can allow more than this.'),
  ('max_selling_units', 'Selling units per product', '5', 'number', 'units', 'Most units of measure one product can be sold in.'),
  ('bulk_upload_max_rows', 'Bulk upload size', '5000', 'number', 'rows', 'Largest file a seller can upload at once.'),
  ('draft_lifetime_days', 'Draft lifetime', '90', 'number', 'days', 'Untouched drafts are deleted after this.'),
  ('draft_reminder_days', 'Draft reminder', '7', 'number', 'days before deletion', 'When to remind the owner of an old draft.');
