-- Prompt 11: assignment modes + SLA filters
DO $$ BEGIN
  ALTER TYPE "LeadAssignmentMode" ADD VALUE 'LEAST_LOADED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE "LeadAssignmentMode" ADD VALUE 'BY_SCORE';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "lead_assignment_rules"
  ADD COLUMN IF NOT EXISTS "name" TEXT,
  ADD COLUMN IF NOT EXISTS "lead_source_id" TEXT,
  ADD COLUMN IF NOT EXISTS "ad_campaign_id" TEXT,
  ADD COLUMN IF NOT EXISTS "min_score" INTEGER,
  ADD COLUMN IF NOT EXISTS "max_score" INTEGER,
  ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "reassign_on_sla" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "notify_manager" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "lead_assignment_rules_organization_id_is_active_priority_idx"
  ON "lead_assignment_rules"("organization_id", "is_active", "priority");

CREATE INDEX IF NOT EXISTS "leads_organization_id_sla_breached_sla_respond_by_idx"
  ON "leads"("organization_id", "sla_breached", "sla_respond_by");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lead_assignment_rules_lead_source_id_fkey'
  ) THEN
    ALTER TABLE "lead_assignment_rules"
      ADD CONSTRAINT "lead_assignment_rules_lead_source_id_fkey"
      FOREIGN KEY ("lead_source_id") REFERENCES "lead_sources"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lead_assignment_rules_ad_campaign_id_fkey'
  ) THEN
    ALTER TABLE "lead_assignment_rules"
      ADD CONSTRAINT "lead_assignment_rules_ad_campaign_id_fkey"
      FOREIGN KEY ("ad_campaign_id") REFERENCES "ad_campaigns"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
