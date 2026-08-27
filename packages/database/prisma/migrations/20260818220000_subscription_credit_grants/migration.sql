-- TrialSetting.creditGrant + ledger columns for subscription-tied grants
ALTER TABLE "trial_settings"
  ADD COLUMN IF NOT EXISTS "credit_grant" DECIMAL(12,2) NOT NULL DEFAULT 1000;

ALTER TABLE "credit_transactions"
  ADD COLUMN IF NOT EXISTS "balance_before" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "source" TEXT,
  ADD COLUMN IF NOT EXISTS "user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "subscription_id" TEXT,
  ADD COLUMN IF NOT EXISTS "payment_id" TEXT;

CREATE INDEX IF NOT EXISTS "credit_transactions_source_idx"
  ON "credit_transactions"("source");

CREATE INDEX IF NOT EXISTS "credit_transactions_subscription_id_idx"
  ON "credit_transactions"("subscription_id");
