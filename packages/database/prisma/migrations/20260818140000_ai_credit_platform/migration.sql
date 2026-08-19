-- AI Credit platform: extend wallet, migrate transaction types, feature pricing
-- Safe for existing data: balances preserved; CREDIT→GRANT, DEBIT→USAGE

-- ---------------------------------------------------------------------------
-- credit_wallets: new columns
-- ---------------------------------------------------------------------------
ALTER TABLE "credit_wallets"
  ADD COLUMN IF NOT EXISTS "reserved_balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lifetime_earned" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lifetime_used" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "credit_wallets"
  ADD CONSTRAINT "credit_wallets_balance_nonneg" CHECK ("balance" >= 0);

ALTER TABLE "credit_wallets"
  ADD CONSTRAINT "credit_wallets_reserved_nonneg" CHECK ("reserved_balance" >= 0);

-- ---------------------------------------------------------------------------
-- credit_transactions: migrate enum CREDIT/DEBIT → new types
-- ---------------------------------------------------------------------------
CREATE TYPE "CreditTransactionType_new" AS ENUM (
  'GRANT',
  'PURCHASE',
  'USAGE',
  'RESERVE',
  'RELEASE',
  'REFUND',
  'ADMIN_ADJUST'
);

ALTER TABLE "credit_transactions" ADD COLUMN "type_new" "CreditTransactionType_new";

UPDATE "credit_transactions" SET "type_new" = 'GRANT' WHERE "type" = 'CREDIT';
UPDATE "credit_transactions" SET "type_new" = 'USAGE' WHERE "type" = 'DEBIT';

ALTER TABLE "credit_transactions" ALTER COLUMN "type_new" SET NOT NULL;

ALTER TABLE "credit_transactions" DROP COLUMN "type";
ALTER TABLE "credit_transactions" RENAME COLUMN "type_new" TO "type";

DROP TYPE "CreditTransactionType";
ALTER TYPE "CreditTransactionType_new" RENAME TO "CreditTransactionType";

ALTER TABLE "credit_transactions"
  ADD COLUMN IF NOT EXISTS "reserved_after" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT,
  ADD COLUMN IF NOT EXISTS "feature_code" TEXT,
  ADD COLUMN IF NOT EXISTS "metadata" JSONB NOT NULL DEFAULT '{}';

CREATE UNIQUE INDEX IF NOT EXISTS "credit_transactions_org_idempotency_key"
  ON "credit_transactions" ("organization_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "credit_transactions_reference_id_idx"
  ON "credit_transactions" ("reference_id");

CREATE INDEX IF NOT EXISTS "credit_transactions_feature_code_idx"
  ON "credit_transactions" ("feature_code");

-- Backfill lifetime counters from historical ledger (non-destructive)
UPDATE "credit_wallets" w SET
  "lifetime_earned" = COALESCE((
    SELECT SUM(t."amount") FROM "credit_transactions" t
    WHERE t."wallet_id" = w."id" AND t."type" = 'GRANT'
  ), 0),
  "lifetime_used" = COALESCE((
    SELECT SUM(t."amount") FROM "credit_transactions" t
    WHERE t."wallet_id" = w."id" AND t."type" = 'USAGE'
  ), 0);

-- ---------------------------------------------------------------------------
-- credit_feature_pricing
-- ---------------------------------------------------------------------------
CREATE TABLE "credit_feature_pricing" (
  "id" TEXT NOT NULL,
  "feature_code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "credit_cost" DECIMAL(12,2) NOT NULL,
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "credit_feature_pricing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "credit_feature_pricing_feature_code_key"
  ON "credit_feature_pricing"("feature_code");

CREATE INDEX "credit_feature_pricing_is_active_sort_order_idx"
  ON "credit_feature_pricing"("is_active", "sort_order");
