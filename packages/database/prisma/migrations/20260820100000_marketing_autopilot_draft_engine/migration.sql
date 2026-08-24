CREATE TYPE "MarketingAutopilotDraftType" AS ENUM ('CONTENT_DRAFT', 'FUNNEL_DRAFT', 'AUTOMATION_DRAFT', 'CAMPAIGN_DRAFT');

CREATE TYPE "MarketingAutopilotDraftRunStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'BLOCKED');

CREATE TABLE "marketing_autopilot_draft_runs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" "MarketingAutopilotDraftRunStatus" NOT NULL DEFAULT 'PENDING',
    "blocked_actions_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_autopilot_draft_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "marketing_autopilot_drafts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "type" "MarketingAutopilotDraftType" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_autopilot_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketing_autopilot_draft_runs_organization_id_idempotency_key_uidx"
ON "marketing_autopilot_draft_runs"("organization_id", "idempotency_key");

CREATE INDEX "marketing_autopilot_draft_runs_organization_id_project_id_created_at_idx"
ON "marketing_autopilot_draft_runs"("organization_id", "project_id", "created_at");

CREATE INDEX "marketing_autopilot_drafts_organization_id_type_created_at_idx"
ON "marketing_autopilot_drafts"("organization_id", "type", "created_at");

CREATE INDEX "marketing_autopilot_drafts_run_id_idx"
ON "marketing_autopilot_drafts"("run_id");

ALTER TABLE "marketing_autopilot_draft_runs"
ADD CONSTRAINT "marketing_autopilot_draft_runs_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketing_autopilot_draft_runs"
ADD CONSTRAINT "marketing_autopilot_draft_runs_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketing_autopilot_draft_runs"
ADD CONSTRAINT "marketing_autopilot_draft_runs_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "marketing_autopilot_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketing_autopilot_drafts"
ADD CONSTRAINT "marketing_autopilot_drafts_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketing_autopilot_drafts"
ADD CONSTRAINT "marketing_autopilot_drafts_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketing_autopilot_drafts"
ADD CONSTRAINT "marketing_autopilot_drafts_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "marketing_autopilot_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketing_autopilot_drafts"
ADD CONSTRAINT "marketing_autopilot_drafts_run_id_fkey"
FOREIGN KEY ("run_id") REFERENCES "marketing_autopilot_draft_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

