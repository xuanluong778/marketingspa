-- Autopilot-owned Funnel/Email/Scoring draft tables for baselines without Funnel Builder / Email Marketing.
-- Separate from later Funnel/Email modules (different table names) so those migrations can still apply.

CREATE TABLE "marketing_autopilot_funnel_specs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "created_by_id" TEXT,
    "prompt" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ai',
    "selected_slug" TEXT,
    "selected_at" TIMESTAMP(3),
    "complete_spec" JSONB,
    "complete_source" TEXT,
    "complete_generated_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "chatbot_bot_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_autopilot_funnel_specs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "marketing_autopilot_funnel_specs_organization_id_created_at_idx"
  ON "marketing_autopilot_funnel_specs"("organization_id", "created_at");

CREATE INDEX "marketing_autopilot_funnel_specs_organization_id_status_idx"
  ON "marketing_autopilot_funnel_specs"("organization_id", "status");

ALTER TABLE "marketing_autopilot_funnel_specs"
  ADD CONSTRAINT "marketing_autopilot_funnel_specs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketing_autopilot_funnel_specs"
  ADD CONSTRAINT "marketing_autopilot_funnel_specs_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "marketing_autopilot_email_drafts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "created_by_user_id" TEXT,
    "name" TEXT NOT NULL,
    "subject" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "open_count" INTEGER NOT NULL DEFAULT 0,
    "click_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_autopilot_email_drafts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "marketing_autopilot_email_drafts_organization_id_status_idx"
  ON "marketing_autopilot_email_drafts"("organization_id", "status");

ALTER TABLE "marketing_autopilot_email_drafts"
  ADD CONSTRAINT "marketing_autopilot_email_drafts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketing_autopilot_email_drafts"
  ADD CONSTRAINT "marketing_autopilot_email_drafts_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "marketing_autopilot_scoring_configs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "funnel_id" TEXT NOT NULL,
    "max_score" INTEGER NOT NULL DEFAULT 100,
    "mql_threshold" INTEGER NOT NULL DEFAULT 50,
    "sql_threshold" INTEGER NOT NULL DEFAULT 80,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'executor',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_autopilot_scoring_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketing_autopilot_scoring_configs_funnel_id_key"
  ON "marketing_autopilot_scoring_configs"("funnel_id");

CREATE INDEX "marketing_autopilot_scoring_configs_organization_id_idx"
  ON "marketing_autopilot_scoring_configs"("organization_id");

ALTER TABLE "marketing_autopilot_scoring_configs"
  ADD CONSTRAINT "marketing_autopilot_scoring_configs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
