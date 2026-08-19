-- Sender domain DNS checks (DKIM / SPF / DMARC)

ALTER TABLE "email_sender_domains"
  ADD COLUMN IF NOT EXISTS "dmarc_host" TEXT,
  ADD COLUMN IF NOT EXISTS "dmarc_value" TEXT,
  ADD COLUMN IF NOT EXISTS "dkim_records" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "dkim_verified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "spf_verified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "dmarc_verified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "last_checked_at" TIMESTAMP(3);
