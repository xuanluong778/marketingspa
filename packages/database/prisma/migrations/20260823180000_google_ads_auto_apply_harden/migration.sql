-- Auto-Apply hardening — additive columns + enum values

ALTER TYPE "GoogleAdsAutopilotMode" ADD VALUE IF NOT EXISTS 'RECOMMEND_ONLY';
ALTER TYPE "GoogleAdsAutopilotMode" ADD VALUE IF NOT EXISTS 'AUTO_APPLY';

ALTER TABLE "google_ads_autopilot_configs"
  ADD COLUMN IF NOT EXISTS "cooldown_minutes" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS "allow_auto_pause" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "min_roas" DECIMAL(14,4),
  ADD COLUMN IF NOT EXISTS "last_action_at" TIMESTAMP(3);

ALTER TABLE "google_ads_autopilot_actions"
  ADD COLUMN IF NOT EXISTS "pre_write_checks" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "rollback_snapshot" JSONB;
