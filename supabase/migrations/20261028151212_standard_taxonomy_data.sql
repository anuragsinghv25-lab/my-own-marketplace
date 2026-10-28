-- R1.1: security, search indexes and data changes for the standard (Shopify / UNSPSC) taxonomy.

-- 1. Same rule as R0: the public Data API can never read or change app tables.
ALTER TABLE "reference_taxonomies" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "reference_categories" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "reference_attributes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "category_attributes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- 2. "Add from standard" search.
CREATE INDEX "reference_categories_name_trgm" ON "reference_categories" USING gin (lower("name") extensions.gin_trgm_ops);
--> statement-breakpoint
CREATE TRIGGER "reference_taxonomies_set_updated_at" BEFORE UPDATE ON "reference_taxonomies" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint

-- 3. The fixed five levels become a variable-depth tree. What R1 called L5 is now a "listing" category.
UPDATE "category_nodes" SET "kind" = 'listing' WHERE "level" = 5;
--> statement-breakpoint

-- 4. Custom codes get a "C" prefix and dots so they can never collide with real UNSPSC codes
--    (R1's generated "10101010" looked like a UNSPSC commodity but was not one):
--    10 → C10 · 1010 → C10.10 · 10101010-01 → C10.10.10.10.01
UPDATE "category_nodes"
SET "code" = 'C'
  || regexp_replace(split_part("code", '-', 1), '(\d\d)(?=\d)', '\1.', 'g')
  || CASE WHEN split_part("code", '-', 2) <> '' THEN '.' || split_part("code", '-', 2) ELSE '' END
WHERE "source" = 'custom' AND "code" ~ '^(\d\d)+(-[0-9A-Z]{2})?$';
