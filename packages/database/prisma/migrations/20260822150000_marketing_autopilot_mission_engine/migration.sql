-- Marketing Autopilot mission engine (ADD-ONLY).
-- Runs after outcome learning (20260822140000) and before outcome loop (20260822160000)
-- so ALTER/FK on marketing_missions, marketing_autopilot_guardrails, and
-- marketing_mission_assets succeed on a clean origin/main database.

CREATE TYPE "MarketingMissionStatus" AS ENUM (
  'PENDING',
  'DRAFT',
  'GENERATING',
  'RUNNING',
  'READY_FOR_APPROVAL',
  'APPROVED',
  'QUEUED',
  'FAILED',
  'BLOCKED'
);

-- Include STALE so schema.prisma matches; 20260822160000 ADD VALUE IF NOT EXISTS is a no-op.
CREATE TYPE "MarketingAutopilotOptimizationStatus" AS ENUM (
  'PENDING_APPROVAL',
  'APPROVED',
  'APPLIED',
  'REJECTED',
  'BLOCKED_GUARDRAIL',
  'STALE',
  'SKIPPED'
);

CREATE TABLE "marketing_missions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" "MarketingMissionStatus" NOT NULL DEFAULT 'DRAFT',
    "current_step" TEXT NOT NULL DEFAULT 'BRIEF',
    "progress_percent" INTEGER NOT NULL DEFAULT 0,
    "steps_json" JSONB NOT NULL DEFAULT '{}',
    "blueprint_json" JSONB NOT NULL DEFAULT '{}',
    "error_json" JSONB,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error_at" TIMESTAMP(3),
    "ready_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "approval_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_missions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketing_missions_organization_id_idempotency_key_key"
ON "marketing_missions"("organization_id", "idempotency_key");

CREATE INDEX "marketing_missions_organization_id_project_id_created_at_idx"
ON "marketing_missions"("organization_id", "project_id", "created_at");

CREATE INDEX "marketing_missions_organization_id_status_idx"
ON "marketing_missions"("organization_id", "status");

CREATE INDEX "marketing_missions_status_updated_at_idx"
ON "marketing_missions"("status", "updated_at");

ALTER TABLE "marketing_missions"
ADD CONSTRAINT "marketing_missions_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketing_missions"
ADD CONSTRAINT "marketing_missions_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketing_missions"
ADD CONSTRAINT "marketing_missions_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "marketing_autopilot_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "marketing_mission_approvals" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "mission_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "approved_by_id" TEXT NOT NULL,
    "approved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshot_json" JSONB NOT NULL,
    "run_status" TEXT NOT NULL DEFAULT 'APPROVED',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_mission_approvals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketing_mission_approvals_mission_id_version_key"
ON "marketing_mission_approvals"("mission_id", "version");

CREATE INDEX "marketing_mission_approvals_organization_id_project_id_crea_idx"
ON "marketing_mission_approvals"("organization_id", "project_id", "created_at");

CREATE INDEX "marketing_mission_approvals_organization_id_approved_at_idx"
ON "marketing_mission_approvals"("organization_id", "approved_at");

ALTER TABLE "marketing_mission_approvals"
ADD CONSTRAINT "marketing_mission_approvals_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketing_mission_approvals"
ADD CONSTRAINT "marketing_mission_approvals_mission_id_fkey"
FOREIGN KEY ("mission_id") REFERENCES "marketing_missions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketing_mission_approvals"
ADD CONSTRAINT "marketing_mission_approvals_approved_by_id_fkey"
FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Base guardrail columns. autopilot_mode / full_autopilot_enabled are added by 20260822160000.
CREATE TABLE "marketing_autopilot_guardrails" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "max_daily_ad_spend" DECIMAL(15,2),
    "max_campaign_budget" DECIMAL(15,2),
    "max_budget_increase_percent" INTEGER NOT NULL DEFAULT 20,
    "allowed_channels" JSONB NOT NULL DEFAULT '[]',
    "allow_facebook_publish" BOOLEAN NOT NULL DEFAULT false,
    "allow_google_ads_publish" BOOLEAN NOT NULL DEFAULT false,
    "allow_email_send" BOOLEAN NOT NULL DEFAULT false,
    "allow_zalo_send" BOOLEAN NOT NULL DEFAULT false,
    "allow_automation_activation" BOOLEAN NOT NULL DEFAULT true,
    "stop_loss_cpl" DECIMAL(15,2),
    "stop_loss_cpa" DECIMAL(15,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_autopilot_guardrails_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketing_autopilot_guardrails_organization_id_key"
ON "marketing_autopilot_guardrails"("organization_id");

ALTER TABLE "marketing_autopilot_guardrails"
ADD CONSTRAINT "marketing_autopilot_guardrails_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "marketing_autopilot_execution_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "mission_id" TEXT NOT NULL,
    "approval_id" TEXT,
    "module" TEXT NOT NULL DEFAULT '',
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "check_stage" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "before_json" JSONB NOT NULL DEFAULT '{}',
    "after_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_autopilot_execution_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "marketing_autopilot_execution_logs_organization_id_mission__idx"
ON "marketing_autopilot_execution_logs"("organization_id", "mission_id", "created_at");

CREATE INDEX "marketing_autopilot_execution_logs_mission_id_entity_id_idx"
ON "marketing_autopilot_execution_logs"("mission_id", "entity_id");

CREATE INDEX "marketing_autopilot_execution_logs_organization_id_result_c_idx"
ON "marketing_autopilot_execution_logs"("organization_id", "result", "created_at");

ALTER TABLE "marketing_autopilot_execution_logs"
ADD CONSTRAINT "marketing_autopilot_execution_logs_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Base asset columns. asset_type / recommendation_id / edit_url are added by 20260823120000.
CREATE TABLE "marketing_mission_assets" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "mission_id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "adapter" TEXT NOT NULL DEFAULT '',
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_mission_assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketing_mission_assets_organization_id_entity_type_entity_key"
ON "marketing_mission_assets"("organization_id", "entity_type", "entity_id");

CREATE INDEX "marketing_mission_assets_mission_id_module_idx"
ON "marketing_mission_assets"("mission_id", "module");

CREATE INDEX "marketing_mission_assets_organization_id_module_created_at_idx"
ON "marketing_mission_assets"("organization_id", "module", "created_at");

ALTER TABLE "marketing_mission_assets"
ADD CONSTRAINT "marketing_mission_assets_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketing_mission_assets"
ADD CONSTRAINT "marketing_mission_assets_mission_id_fkey"
FOREIGN KEY ("mission_id") REFERENCES "marketing_missions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- schema.prisma: MarketingAutopilotDraft.missionId (nullable, SET NULL)
ALTER TABLE "marketing_autopilot_drafts"
ADD COLUMN "mission_id" TEXT;

CREATE INDEX "marketing_autopilot_drafts_mission_id_idx"
ON "marketing_autopilot_drafts"("mission_id");

ALTER TABLE "marketing_autopilot_drafts"
ADD CONSTRAINT "marketing_autopilot_drafts_mission_id_fkey"
FOREIGN KEY ("mission_id") REFERENCES "marketing_missions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- schema.prisma: MarketingAutopilotOutcomeTrack.missionId (nullable, SET NULL).
-- Column/indexes are also ADD COLUMN IF NOT EXISTS in 20260822160000.
ALTER TABLE "marketing_autopilot_outcome_tracks"
ADD COLUMN "mission_id" TEXT;

ALTER TABLE "marketing_autopilot_outcome_tracks"
ADD CONSTRAINT "marketing_autopilot_outcome_tracks_mission_id_fkey"
FOREIGN KEY ("mission_id") REFERENCES "marketing_missions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
