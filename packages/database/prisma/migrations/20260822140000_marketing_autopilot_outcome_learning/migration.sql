-- Marketing Autopilot Outcome Learning (ADD-ONLY tables)

CREATE TYPE "MarketingAutopilotOutcomeActionType" AS ENUM ('STRATEGY', 'DRAFT');
CREATE TYPE "MarketingAutopilotOutcomeTrackStatus" AS ENUM ('OPEN', 'EVALUATING', 'COMPLETED');
CREATE TYPE "MarketingAutopilotOutcomeEvalStatus" AS ENUM ('PENDING', 'DONE', 'SKIPPED');
CREATE TYPE "MarketingAutopilotLearningCategory" AS ENUM (
  'OFFER',
  'SEGMENT',
  'CONTENT_CHANNEL',
  'METRIC_BASELINE',
  'TACTIC_SUCCESS',
  'TACTIC_FAILED'
);

CREATE TABLE "marketing_autopilot_outcome_tracks" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "analysis_id" TEXT,
    "draft_run_id" TEXT,
    "draft_id" TEXT,
    "action_type" "MarketingAutopilotOutcomeActionType" NOT NULL,
    "draft_type" "MarketingAutopilotDraftType",
    "status" "MarketingAutopilotOutcomeTrackStatus" NOT NULL DEFAULT 'OPEN',
    "recommendation_json" JSONB NOT NULL DEFAULT '{}',
    "before_metrics_json" JSONB NOT NULL DEFAULT '{}',
    "before_snapshot_id" TEXT,
    "baseline_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "product_name" TEXT NOT NULL DEFAULT '',
    "customer_profile" TEXT NOT NULL DEFAULT '',
    "target_area" TEXT NOT NULL DEFAULT '',
    "primary_goal" TEXT NOT NULL DEFAULT '',
    "channels_json" JSONB NOT NULL DEFAULT '[]',
    "offer_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_autopilot_outcome_tracks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "marketing_autopilot_outcome_evaluations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "track_id" TEXT NOT NULL,
    "horizon_days" INTEGER NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "evaluated_at" TIMESTAMP(3),
    "status" "MarketingAutopilotOutcomeEvalStatus" NOT NULL DEFAULT 'PENDING',
    "after_metrics_json" JSONB NOT NULL DEFAULT '{}',
    "after_snapshot_id" TEXT,
    "outcome_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_autopilot_outcome_evaluations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "marketing_autopilot_business_learnings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "category" "MarketingAutopilotLearningCategory" NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "evidence_json" JSONB NOT NULL DEFAULT '{}',
    "confidence" TEXT NOT NULL DEFAULT 'LOW',
    "sample_size" INTEGER NOT NULL DEFAULT 1,
    "correlation_only" BOOLEAN NOT NULL DEFAULT true,
    "source_track_ids" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_autopilot_business_learnings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "marketing_autopilot_outcome_tracks_organization_id_status_baseline_at_idx"
ON "marketing_autopilot_outcome_tracks"("organization_id", "status", "baseline_at");

CREATE INDEX "marketing_autopilot_outcome_tracks_organization_id_project_id_created_at_idx"
ON "marketing_autopilot_outcome_tracks"("organization_id", "project_id", "created_at");

CREATE INDEX "marketing_autopilot_outcome_tracks_analysis_id_idx"
ON "marketing_autopilot_outcome_tracks"("analysis_id");

CREATE INDEX "marketing_autopilot_outcome_tracks_draft_run_id_idx"
ON "marketing_autopilot_outcome_tracks"("draft_run_id");

CREATE INDEX "marketing_autopilot_outcome_tracks_draft_id_idx"
ON "marketing_autopilot_outcome_tracks"("draft_id");

CREATE UNIQUE INDEX "marketing_autopilot_outcome_evaluations_track_id_horizon_days_key"
ON "marketing_autopilot_outcome_evaluations"("track_id", "horizon_days");

CREATE INDEX "marketing_autopilot_outcome_evaluations_organization_id_status_due_at_idx"
ON "marketing_autopilot_outcome_evaluations"("organization_id", "status", "due_at");

CREATE INDEX "marketing_autopilot_outcome_evaluations_track_id_horizon_days_idx"
ON "marketing_autopilot_outcome_evaluations"("track_id", "horizon_days");

CREATE UNIQUE INDEX "marketing_autopilot_business_learnings_organization_id_category_key_key"
ON "marketing_autopilot_business_learnings"("organization_id", "category", "key");

CREATE INDEX "marketing_autopilot_business_learnings_organization_id_is_active_category_idx"
ON "marketing_autopilot_business_learnings"("organization_id", "is_active", "category");

CREATE INDEX "marketing_autopilot_business_learnings_organization_id_last_observed_at_idx"
ON "marketing_autopilot_business_learnings"("organization_id", "last_observed_at");

ALTER TABLE "marketing_autopilot_outcome_tracks"
ADD CONSTRAINT "marketing_autopilot_outcome_tracks_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketing_autopilot_outcome_tracks"
ADD CONSTRAINT "marketing_autopilot_outcome_tracks_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketing_autopilot_outcome_tracks"
ADD CONSTRAINT "marketing_autopilot_outcome_tracks_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "marketing_autopilot_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketing_autopilot_outcome_tracks"
ADD CONSTRAINT "marketing_autopilot_outcome_tracks_analysis_id_fkey"
FOREIGN KEY ("analysis_id") REFERENCES "marketing_autopilot_analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "marketing_autopilot_outcome_tracks"
ADD CONSTRAINT "marketing_autopilot_outcome_tracks_draft_run_id_fkey"
FOREIGN KEY ("draft_run_id") REFERENCES "marketing_autopilot_draft_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "marketing_autopilot_outcome_tracks"
ADD CONSTRAINT "marketing_autopilot_outcome_tracks_draft_id_fkey"
FOREIGN KEY ("draft_id") REFERENCES "marketing_autopilot_drafts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "marketing_autopilot_outcome_evaluations"
ADD CONSTRAINT "marketing_autopilot_outcome_evaluations_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketing_autopilot_outcome_evaluations"
ADD CONSTRAINT "marketing_autopilot_outcome_evaluations_track_id_fkey"
FOREIGN KEY ("track_id") REFERENCES "marketing_autopilot_outcome_tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketing_autopilot_business_learnings"
ADD CONSTRAINT "marketing_autopilot_business_learnings_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
