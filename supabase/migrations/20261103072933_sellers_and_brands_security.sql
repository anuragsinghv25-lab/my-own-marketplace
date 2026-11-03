-- R4: security, integrity and starting data for sellers and brands.

-- 1. Same rule as R0: the public Data API can never read or change app tables.
ALTER TABLE "organisations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "org_addresses" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "divisions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "division_members" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "signup_attempts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "files" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "file_blobs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "certificates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "vendor_assessments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "brands" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "trademarks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "brand_requests" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "brand_category_approvals" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "brand_blocks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "prohibited_names" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "brand_authorisations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- 2. Keep updated_at honest.
CREATE TRIGGER "organisations_set_updated_at" BEFORE UPDATE ON "organisations" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "vendor_assessments_set_updated_at" BEFORE UPDATE ON "vendor_assessments" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "brands_set_updated_at" BEFORE UPDATE ON "brands" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "brand_requests_set_updated_at" BEFORE UPDATE ON "brand_requests" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint

-- 3. Integrity the schema file cannot express (formats are checked in code too, with friendlier messages).
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_gstin_format" CHECK ("gstin" ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');
--> statement-breakpoint
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_pan_in_gstin" CHECK ("pan" = substr("gstin", 3, 10));
--> statement-breakpoint
ALTER TABLE "org_addresses" ADD CONSTRAINT "org_addresses_pincode" CHECK ("pincode" ~ '^[1-9][0-9]{5}$');
--> statement-breakpoint
ALTER TABLE "trademarks" ADD CONSTRAINT "trademarks_nice_class" CHECK ("nice_class" BETWEEN 1 AND 45);
--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_size" CHECK ("size" > 0 AND "size" <= 4194304);
--> statement-breakpoint
ALTER TABLE "division_members" ADD CONSTRAINT "division_members_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- a file's bytes never change once stored (a new upload is a new file)
CREATE TRIGGER "files_append_only" BEFORE UPDATE ON "files" FOR EACH ROW EXECUTE FUNCTION "append_only"();
--> statement-breakpoint

-- 4. How seller verification, vendor assessments and brand requests are reviewed:
--    a reviewer decides; anything they are unsure about goes to an approver (Admin → Review rules).
INSERT INTO "review_definitions" ("subject_type", "name", "stages", "reason_codes", "sla_hours", "reminder_hours", "max_attempts")
VALUES
(
  'seller_org',
  'Seller verification',
  '[{"key":"review","label":"Verification","role":"reviewer"},{"key":"escalation","label":"Escalation","role":"approver","escalationOnly":true}]'::jsonb,
  '[
    {"code":"gstin_mismatch","label":"GSTIN does not match the business details","for":["reject","request_info"]},
    {"code":"contact_unreachable","label":"Contact details could not be confirmed","for":["request_info","reject"]},
    {"code":"duplicate_org","label":"Organisation already registered","for":["reject"]},
    {"code":"needs_senior","label":"Needs a senior decision","for":["escalate"]},
    {"code":"other","label":"Other (explain in the note)","for":["reject","request_info","escalate"]}
  ]'::jsonb,
  48, 24, 3
),
(
  'vendor_assessment',
  'Vendor assessment',
  '[{"key":"review","label":"Assessment","role":"reviewer"},{"key":"escalation","label":"Escalation","role":"approver","escalationOnly":true}]'::jsonb,
  '[
    {"code":"evidence_missing","label":"Manufacturing evidence missing or unclear","for":["request_info","reject"]},
    {"code":"address_unverified","label":"Manufacturing address could not be verified","for":["request_info","reject"]},
    {"code":"not_a_manufacturer","label":"Not a manufacturer of these brands","for":["reject"]},
    {"code":"needs_senior","label":"Needs a senior decision","for":["escalate"]},
    {"code":"other","label":"Other (explain in the note)","for":["reject","request_info","escalate"]}
  ]'::jsonb,
  72, 24, 3
),
(
  'brand_request',
  'Brand request',
  '[{"key":"review","label":"Brand review","role":"reviewer"},{"key":"escalation","label":"Escalation","role":"approver","escalationOnly":true}]'::jsonb,
  '[
    {"code":"trademark_mismatch","label":"Trademark details do not match the certificate","for":["request_info","reject"]},
    {"code":"authorisation_missing","label":"Authorisation from the owner is missing","for":["request_info","reject"]},
    {"code":"wrong_categories","label":"The brand does not fit these categories","for":["reject"]},
    {"code":"infringing","label":"Infringes another brand (blocks it for everyone)","for":["reject"]},
    {"code":"needs_senior","label":"Needs a senior decision","for":["escalate"]},
    {"code":"other","label":"Other (explain in the note)","for":["reject","request_info","escalate"]}
  ]'::jsonb,
  48, 24, 3
)
ON CONFLICT ("subject_type") DO NOTHING;
--> statement-breakpoint

-- 5. Common certificate types, if the library does not have them yet (Admin → Attribute library).
INSERT INTO "certificate_types" ("code", "name", "issuer", "level") VALUES
  ('bis_crs', 'BIS registration (Compulsory Registration Scheme)', 'Bureau of Indian Standards', 'product'),
  ('isi_mark', 'ISI mark licence', 'Bureau of Indian Standards', 'product'),
  ('iso_9001', 'ISO 9001 quality management', 'Accredited certification body', 'seller'),
  ('iso_14001', 'ISO 14001 environmental management', 'Accredited certification body', 'seller'),
  ('bee_star', 'BEE star rating', 'Bureau of Energy Efficiency', 'product'),
  ('wpc_eta', 'WPC equipment type approval', 'Wireless Planning and Coordination Wing', 'product'),
  ('trademark', 'Trademark registration certificate', 'Trade Marks Registry', 'seller'),
  ('factory_licence', 'Factory licence', 'State factories department', 'seller'),
  ('msme_udyam', 'Udyam registration (MSME)', 'Ministry of MSME', 'seller')
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- 6. A starting list of names nobody may register as a brand (Admin → Brand names).
INSERT INTO "prohibited_names" ("name", "normalized_name", "list", "reason") VALUES
  ('Generic', 'GENERIC', 'negative', 'Describes no brand'),
  ('No Brand', 'NOBRAND', 'negative', 'Use "Unbranded" instead'),
  ('Unbranded', 'UNBRANDED', 'negative', 'Use the Unbranded path instead'),
  ('Original', 'ORIGINAL', 'negative', 'A claim, not a brand'),
  ('Local', 'LOCAL', 'negative', 'Describes no brand'),
  ('Government of India', 'GOVERNMENTOFINDIA', 'prohibited', 'Emblems and Names (Prevention of Improper Use) Act'),
  ('Ashoka Emblem', 'ASHOKAEMBLEM', 'prohibited', 'State Emblem of India (Prohibition of Improper Use) Act'),
  ('Red Cross', 'REDCROSS', 'prohibited', 'Geneva Conventions Act')
ON CONFLICT ("normalized_name") DO NOTHING;
--> statement-breakpoint

-- 7. Demo seller accounts created before R4 point at these organisation ids; give them real, verified organisations.
INSERT INTO "organisations" ("id", "legal_name", "trade_name", "business_type", "gstin", "pan", "state_code", "contact_name", "contact_email", "contact_phone", "status", "verified_at", "terms_accepted_at")
SELECT v.id::uuid, v.legal_name, v.trade_name, 'private_limited', v.gstin, substr(v.gstin, 3, 10), v.state_code, v.trade_name, v.email, '+919800000000', 'verified', now(), now()
FROM (VALUES
  ('00000000-0000-4000-8000-0000000000d1', 'Demo Retail Private Limited', 'Demo Retail', '27AABCD1234E1Z8', '27', 'seller@example.com'),
  ('00000000-0000-4000-8000-0000000000d2', 'Demo Devices Private Limited', 'Demo Devices', '29AABCN5678F1Z4', '29', 'oem-seller@example.com')
) AS v(id, legal_name, trade_name, gstin, state_code, email)
WHERE EXISTS (SELECT 1 FROM "role_grants" g WHERE g."scope_id" = v.id::uuid)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "org_addresses" ("org_id", "kind", "label", "line1", "city", "state_code", "pincode")
SELECT o."id", 'registered', 'Registered office', '1 Demo Road', CASE o."state_code" WHEN '27' THEN 'Mumbai' ELSE 'Bengaluru' END, o."state_code", CASE o."state_code" WHEN '27' THEN '400001' ELSE '560001' END
FROM "organisations" o
WHERE o."id" IN ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d2')
  AND NOT EXISTS (SELECT 1 FROM "org_addresses" a WHERE a."org_id" = o."id");
