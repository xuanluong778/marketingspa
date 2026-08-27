-- Email SES provider tracking (message id + delivered timestamp)

ALTER TABLE "email_campaign_recipients"
  ADD COLUMN IF NOT EXISTS "delivered_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "provider" TEXT,
  ADD COLUMN IF NOT EXISTS "provider_message_id" TEXT;

CREATE INDEX IF NOT EXISTS "email_campaign_recipients_provider_message_id_idx"
  ON "email_campaign_recipients"("provider_message_id");
