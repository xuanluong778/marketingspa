-- Prompt 13 — Customer Journey: funnelId on marketing events + journey step types

ALTER TYPE "MarketingFunnelEventType" ADD VALUE IF NOT EXISTS 'AD_CLICK';
ALTER TYPE "MarketingFunnelEventType" ADD VALUE IF NOT EXISTS 'FORM_SUBMIT';
ALTER TYPE "MarketingFunnelEventType" ADD VALUE IF NOT EXISTS 'CHATBOT';
ALTER TYPE "MarketingFunnelEventType" ADD VALUE IF NOT EXISTS 'STAGE_CHANGED';

ALTER TABLE "marketing_funnel_events"
  ADD COLUMN IF NOT EXISTS "funnel_id" TEXT;

CREATE INDEX IF NOT EXISTS "marketing_funnel_events_organization_id_funnel_id_occurred_at_idx"
  ON "marketing_funnel_events" ("organization_id", "funnel_id", "occurred_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketing_funnel_events_funnel_id_fkey'
  ) THEN
    ALTER TABLE "marketing_funnel_events"
      ADD CONSTRAINT "marketing_funnel_events_funnel_id_fkey"
      FOREIGN KEY ("funnel_id") REFERENCES "funnel_recommendations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

UPDATE "marketing_funnel_events" mfe
SET "funnel_id" = l."funnel_recommendation_id"
FROM "leads" l
WHERE mfe."lead_id" = l."id"
  AND mfe."funnel_id" IS NULL
  AND l."funnel_recommendation_id" IS NOT NULL;
