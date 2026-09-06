-- Prompt 10: per-funnel lead scoring 0–100 + MQL/SQL thresholds
ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "qualification" TEXT,
  ADD COLUMN IF NOT EXISTS "mql_reached_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sql_reached_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "leads_organization_id_qualification_idx"
  ON "leads"("organization_id", "qualification");

CREATE TABLE IF NOT EXISTS "funnel_scoring_configs" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "funnel_id" TEXT NOT NULL,
  "max_score" INTEGER NOT NULL DEFAULT 100,
  "mql_threshold" INTEGER NOT NULL DEFAULT 50,
  "sql_threshold" INTEGER NOT NULL DEFAULT 80,
  "mql_stage_id" TEXT,
  "sql_stage_id" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "funnel_scoring_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "funnel_scoring_configs_funnel_id_key"
  ON "funnel_scoring_configs"("funnel_id");

CREATE INDEX IF NOT EXISTS "funnel_scoring_configs_organization_id_is_active_idx"
  ON "funnel_scoring_configs"("organization_id", "is_active");

CREATE TABLE IF NOT EXISTS "funnel_scoring_rules" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "config_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "points" INTEGER NOT NULL,
  "condition" JSONB NOT NULL DEFAULT '{}',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "position" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "funnel_scoring_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "funnel_scoring_rules_config_id_key_key"
  ON "funnel_scoring_rules"("config_id", "key");

CREATE INDEX IF NOT EXISTS "funnel_scoring_rules_organization_id_event_type_idx"
  ON "funnel_scoring_rules"("organization_id", "event_type");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'funnel_scoring_configs_organization_id_fkey'
  ) THEN
    ALTER TABLE "funnel_scoring_configs"
      ADD CONSTRAINT "funnel_scoring_configs_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'funnel_scoring_configs_funnel_id_fkey'
  ) THEN
    ALTER TABLE "funnel_scoring_configs"
      ADD CONSTRAINT "funnel_scoring_configs_funnel_id_fkey"
      FOREIGN KEY ("funnel_id") REFERENCES "funnel_recommendations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'funnel_scoring_configs_mql_stage_id_fkey'
  ) THEN
    ALTER TABLE "funnel_scoring_configs"
      ADD CONSTRAINT "funnel_scoring_configs_mql_stage_id_fkey"
      FOREIGN KEY ("mql_stage_id") REFERENCES "funnel_stages"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'funnel_scoring_configs_sql_stage_id_fkey'
  ) THEN
    ALTER TABLE "funnel_scoring_configs"
      ADD CONSTRAINT "funnel_scoring_configs_sql_stage_id_fkey"
      FOREIGN KEY ("sql_stage_id") REFERENCES "funnel_stages"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'funnel_scoring_rules_organization_id_fkey'
  ) THEN
    ALTER TABLE "funnel_scoring_rules"
      ADD CONSTRAINT "funnel_scoring_rules_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'funnel_scoring_rules_config_id_fkey'
  ) THEN
    ALTER TABLE "funnel_scoring_rules"
      ADD CONSTRAINT "funnel_scoring_rules_config_id_fkey"
      FOREIGN KEY ("config_id") REFERENCES "funnel_scoring_configs"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
