-- Google Ads SaaS: per-tenant linked advertiser accounts (loginCustomerId per account).
-- One AdConnection (OAuth refresh token) per org+GOOGLE; many client/MCC accounts underneath.

CREATE TABLE "ad_google_ads_accounts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "login_customer_id" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "is_manager" BOOLEAN NOT NULL DEFAULT false,
    "is_selected" BOOLEAN NOT NULL DEFAULT true,
    "access_type" TEXT NOT NULL DEFAULT 'direct',
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_google_ads_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ad_google_ads_accounts_organization_id_customer_id_key" ON "ad_google_ads_accounts"("organization_id", "customer_id");
CREATE INDEX "ad_google_ads_accounts_connection_id_idx" ON "ad_google_ads_accounts"("connection_id");
CREATE INDEX "ad_google_ads_accounts_organization_id_is_selected_idx" ON "ad_google_ads_accounts"("organization_id", "is_selected");

ALTER TABLE "ad_google_ads_accounts" ADD CONSTRAINT "ad_google_ads_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_google_ads_accounts" ADD CONSTRAINT "ad_google_ads_accounts_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "ad_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill from existing Google AdConnection rows (primary customer + login from metadata).
INSERT INTO "ad_google_ads_accounts" (
  "id",
  "organization_id",
  "connection_id",
  "customer_id",
  "login_customer_id",
  "name",
  "currency",
  "timezone",
  "is_manager",
  "is_selected",
  "access_type",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid()::text,
  c."organization_id",
  c."id",
  regexp_replace(c."external_account_id", '[^0-9]', '', 'g'),
  NULLIF(regexp_replace(COALESCE(c."metadata"->>'loginCustomerId', ''), '[^0-9]', '', 'g'), ''),
  COALESCE(c."external_account_name", c."external_account_id"),
  COALESCE(c."metadata"->>'currency', 'USD'),
  COALESCE(c."metadata"->>'timezone', 'UTC'),
  false,
  true,
  CASE
    WHEN NULLIF(regexp_replace(COALESCE(c."metadata"->>'loginCustomerId', ''), '[^0-9]', '', 'g'), '') IS NULL
      OR regexp_replace(COALESCE(c."metadata"->>'loginCustomerId', ''), '[^0-9]', '', 'g')
         = regexp_replace(c."external_account_id", '[^0-9]', '', 'g')
    THEN 'direct'
    ELSE 'mcc'
  END,
  NOW(),
  NOW()
FROM "ad_connections" c
WHERE c."provider"::text = 'GOOGLE'
  AND c."external_account_id" IS NOT NULL
  AND regexp_replace(c."external_account_id", '[^0-9]', '', 'g') <> '';
