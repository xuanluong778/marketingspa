-- Connect Email Marketing automations to CRM / Funnel events

ALTER TYPE "EmailAutomationTrigger" ADD VALUE IF NOT EXISTS 'NEW_LEAD';
ALTER TYPE "EmailAutomationTrigger" ADD VALUE IF NOT EXISTS 'EMAIL_OPENED';
ALTER TYPE "EmailAutomationTrigger" ADD VALUE IF NOT EXISTS 'EMAIL_CLICKED';
ALTER TYPE "EmailAutomationTrigger" ADD VALUE IF NOT EXISTS 'EMAIL_NOT_OPENED';
ALTER TYPE "EmailAutomationTrigger" ADD VALUE IF NOT EXISTS 'FUNNEL_SIGNUP';
ALTER TYPE "EmailAutomationTrigger" ADD VALUE IF NOT EXISTS 'BOOKING_CREATED';
ALTER TYPE "EmailAutomationTrigger" ADD VALUE IF NOT EXISTS 'PURCHASED';

DO $$ BEGIN
  CREATE TYPE "EmailAutomationAction" AS ENUM ('SEND_EMAIL', 'ADD_LEAD_SCORE', 'SET_CRM_STAGE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "email_automations"
  ADD COLUMN IF NOT EXISTS "recipe_id" TEXT,
  ADD COLUMN IF NOT EXISTS "action" "EmailAutomationAction" NOT NULL DEFAULT 'SEND_EMAIL',
  ADD COLUMN IF NOT EXISTS "score_delta" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS "target_stage" TEXT,
  ADD COLUMN IF NOT EXISTS "wait_days" INTEGER NOT NULL DEFAULT 2;

CREATE INDEX IF NOT EXISTS "email_automations_organization_id_recipe_id_idx"
  ON "email_automations"("organization_id", "recipe_id");
