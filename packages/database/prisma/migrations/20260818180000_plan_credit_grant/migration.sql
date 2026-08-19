-- Plan creditGrant: configurable AI Credit gifted on paid activate/renew (stack, never reset)
ALTER TABLE "subscription_plans"
  ADD COLUMN IF NOT EXISTS "credit_grant" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Marketing SPA Pro — amounts live in DB (change here, not in app code)
UPDATE "subscription_plans"
SET "credit_grant" = 3000, "price_vnd" = 5500000
WHERE "code" = 'msp-pro-6m';

UPDATE "subscription_plans"
SET "credit_grant" = 8000, "price_vnd" = 8500000
WHERE "code" = 'msp-pro-12m';
