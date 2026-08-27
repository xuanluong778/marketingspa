-- Prompt 9: funnel-scoped automation + new triggers
ALTER TYPE "AutomationTriggerType" ADD VALUE 'STAGE_CHANGED';
ALTER TYPE "AutomationTriggerType" ADD VALUE 'SCORE_CHANGED';
ALTER TYPE "AutomationTriggerType" ADD VALUE 'MESSAGE_RECEIVED';
ALTER TYPE "AutomationTriggerType" ADD VALUE 'NO_REPLY';
ALTER TYPE "AutomationTriggerType" ADD VALUE 'BOOKING_CREATED';
ALTER TYPE "AutomationTriggerType" ADD VALUE 'PURCHASED';

ALTER TABLE "automation_flows"
  ADD COLUMN IF NOT EXISTS "funnel_id" TEXT;

CREATE INDEX IF NOT EXISTS "automation_flows_organization_id_funnel_id_trigger_type_idx"
  ON "automation_flows"("organization_id", "funnel_id", "trigger_type");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'automation_flows_funnel_id_fkey'
  ) THEN
    ALTER TABLE "automation_flows"
      ADD CONSTRAINT "automation_flows_funnel_id_fkey"
      FOREIGN KEY ("funnel_id") REFERENCES "funnel_recommendations"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
