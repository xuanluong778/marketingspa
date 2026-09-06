-- Customer 360 — first/latest source tracking for omnichannel CRM filter
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "first_source" VARCHAR(64);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "latest_source" VARCHAR(64);

CREATE INDEX IF NOT EXISTS "customers_org_latest_source_idx"
  ON "customers" ("organization_id", "latest_source");

CREATE INDEX IF NOT EXISTS "customers_org_first_source_idx"
  ON "customers" ("organization_id", "first_source");

-- Backfill from legacy source column (best-effort normalize common values)
UPDATE "customers"
SET
  "first_source" = COALESCE("first_source", CASE lower(trim("source"))
    WHEN 'crm_manual' THEN 'crm_manual'
    WHEN 'funnel_form' THEN 'funnel_form'
    WHEN 'website_form' THEN 'website_form'
    WHEN 'website_chat' THEN 'website_chat'
    WHEN 'chatbot' THEN 'chatbot'
    WHEN 'zalo' THEN 'zalo'
    WHEN 'messenger' THEN 'messenger'
    WHEN 'messenger_verified_phone' THEN 'messenger'
    WHEN 'fanpage' THEN 'fanpage'
    WHEN 'lead_ads' THEN 'facebook_lead_ads'
    WHEN 'facebook_lead_ads' THEN 'facebook_lead_ads'
    WHEN 'booking_walkin' THEN 'booking'
    WHEN 'appointment_from_lead' THEN 'booking'
    WHEN 'email_marketing' THEN 'email_marketing'
    WHEN 'import' THEN 'import'
    ELSE lower(trim("source"))
  END),
  "latest_source" = COALESCE("latest_source", CASE lower(trim("source"))
    WHEN 'crm_manual' THEN 'crm_manual'
    WHEN 'funnel_form' THEN 'funnel_form'
    WHEN 'website_form' THEN 'website_form'
    WHEN 'website_chat' THEN 'website_chat'
    WHEN 'chatbot' THEN 'chatbot'
    WHEN 'zalo' THEN 'zalo'
    WHEN 'messenger' THEN 'messenger'
    WHEN 'messenger_verified_phone' THEN 'messenger'
    WHEN 'fanpage' THEN 'fanpage'
    WHEN 'lead_ads' THEN 'facebook_lead_ads'
    WHEN 'facebook_lead_ads' THEN 'facebook_lead_ads'
    WHEN 'booking_walkin' THEN 'booking'
    WHEN 'appointment_from_lead' THEN 'booking'
    WHEN 'email_marketing' THEN 'email_marketing'
    WHEN 'import' THEN 'import'
    ELSE lower(trim("source"))
  END)
WHERE "source" IS NOT NULL AND trim("source") <> '';
