-- Marketing Autopilot Outcome Loop (ADD-ONLY, backward-compatible)
-- Production: prisma migrate deploy
-- Rollback plan: see ROLLBACK.md in this folder — drop new tables/indexes only; do NOT drop outcome_tracks.

-- Extend learning categories (idempotent)
ALTER TYPE "MarketingAutopilotLearningCategory" ADD VALUE IF NOT EXISTS 'DIAGNOSIS';
ALTER TYPE "MarketingAutopilotLearningCategory" ADD VALUE IF NOT EXISTS 'OPTIMIZATION';
ALTER TYPE "MarketingAutopilotLearningCategory" ADD VALUE IF NOT EXISTS 'STOP_LOSS';

-- Extend optimization proposal status (idempotent)
ALTER TYPE "MarketingAutopilotOptimizationStatus" ADD VALUE IF NOT EXISTS 'STALE';

-- Outcome loop step enum
DO $$ BEGIN
  CREATE TYPE "MarketingAutopilotOutcomeLoopStep" AS ENUM (
    'RUN', 'MONITOR', 'DIAGNOSE', 'RECOMMEND', 'OPTIMIZE', 'LEARN'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Guardrail autopilot mode columns
ALTER TABLE "marketing_autopilot_guardrails"
  ADD COLUMN IF NOT EXISTS "autopilot_mode" TEXT NOT NULL DEFAULT 'APPROVAL_AUTOPILOT';
ALTER TABLE "marketing_autopilot_guardrails"
  ADD COLUMN IF NOT EXISTS "full_autopilot_enabled" BOOLEAN NOT NULL DEFAULT false;

-- Mission-scoped outcome track
ALTER TABLE "marketing_autopilot_outcome_tracks"
  ADD COLUMN IF NOT EXISTS "mission_id" TEXT;
CREATE INDEX IF NOT EXISTS "marketing_autopilot_outcome_tracks_mission_id_idx"
  ON "marketing_autopilot_outcome_tracks"("mission_id");
CREATE INDEX IF NOT EXISTS "marketing_autopilot_outcome_tracks_organization_id_mission_id_created_at_idx"
  ON "marketing_autopilot_outcome_tracks"("organization_id", "mission_id", "created_at");

-- Outcome loop state per mission
CREATE TABLE IF NOT EXISTS "marketing_autopilot_outcome_loops" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "mission_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "current_step" "MarketingAutopilotOutcomeLoopStep" NOT NULL DEFAULT 'RUN',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "autopilot_mode" TEXT NOT NULL DEFAULT 'APPROVAL_AUTOPILOT',
  "monitor_json" JSONB NOT NULL DEFAULT '{}',
  "diagnosis_json" JSONB NOT NULL DEFAULT '[]',
  "last_monitor_at" TIMESTAMP(3),
  "last_diagnose_at" TIMESTAMP(3),
  "last_recommend_at" TIMESTAMP(3),
  "last_optimize_at" TIMESTAMP(3),
  "last_learn_at" TIMESTAMP(3),
  "stop_loss_active" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "marketing_autopilot_outcome_loops_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "marketing_autopilot_outcome_loops_mission_id_key"
  ON "marketing_autopilot_outcome_loops"("mission_id");
CREATE INDEX IF NOT EXISTS "marketing_autopilot_outcome_loops_organization_id_current_step_status_idx"
  ON "marketing_autopilot_outcome_loops"("organization_id", "current_step", "status");

-- Optimization proposals
CREATE TABLE IF NOT EXISTS "marketing_autopilot_optimization_proposals" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "mission_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "diagnosis_kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "recommendation_json" JSONB NOT NULL DEFAULT '{}',
  "metrics_snapshot_json" JSONB NOT NULL DEFAULT '{}',
  "status" "MarketingAutopilotOptimizationStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
  "correlation_only" BOOLEAN NOT NULL DEFAULT true,
  "approved_by_id" TEXT,
  "approved_at" TIMESTAMP(3),
  "applied_at" TIMESTAMP(3),
  "blocked_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "marketing_autopilot_optimization_proposals_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "marketing_autopilot_optimization_proposals"
  ADD COLUMN IF NOT EXISTS "metrics_snapshot_json" JSONB NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS "marketing_autopilot_optimization_proposals_organization_id_mission_id_status_idx"
  ON "marketing_autopilot_optimization_proposals"("organization_id", "mission_id", "status");
CREATE INDEX IF NOT EXISTS "marketing_autopilot_optimization_proposals_mission_id_diagnosis_kind_idx"
  ON "marketing_autopilot_optimization_proposals"("mission_id", "diagnosis_kind");

-- Idempotency: one open proposal per diagnosis kind per mission
CREATE UNIQUE INDEX IF NOT EXISTS "marketing_autopilot_optimization_proposals_open_uniq"
  ON "marketing_autopilot_optimization_proposals"("organization_id", "mission_id", "diagnosis_kind")
  WHERE "status" IN ('PENDING_APPROVAL', 'APPROVED');

-- Stop-loss audit
CREATE TABLE IF NOT EXISTS "marketing_autopilot_stop_loss_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "mission_id" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "trigger_json" JSONB NOT NULL DEFAULT '{}',
  "paused_modules" JSONB NOT NULL DEFAULT '[]',
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_autopilot_stop_loss_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "marketing_autopilot_stop_loss_events_organization_id_mission_id_created_at_idx"
  ON "marketing_autopilot_stop_loss_events"("organization_id", "mission_id", "created_at");

-- Idempotency: one active stop-loss per reason per mission
CREATE UNIQUE INDEX IF NOT EXISTS "marketing_autopilot_stop_loss_active_uniq"
  ON "marketing_autopilot_stop_loss_events"("organization_id", "mission_id", "reason")
  WHERE "resolved_at" IS NULL;

-- Concurrency mutation locks
CREATE TABLE IF NOT EXISTS "marketing_autopilot_outcome_mutation_locks" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "lock_key" TEXT NOT NULL,
  "holder" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_autopilot_outcome_mutation_locks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "marketing_autopilot_outcome_mutation_locks_organization_id_lock_key_key"
  ON "marketing_autopilot_outcome_mutation_locks"("organization_id", "lock_key");
CREATE INDEX IF NOT EXISTS "marketing_autopilot_outcome_mutation_locks_expires_at_idx"
  ON "marketing_autopilot_outcome_mutation_locks"("expires_at");

-- FK constraints (skip if already exist — safe on re-run via DO blocks)
DO $$ BEGIN
  ALTER TABLE "marketing_autopilot_outcome_loops"
    ADD CONSTRAINT "marketing_autopilot_outcome_loops_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "marketing_autopilot_outcome_loops"
    ADD CONSTRAINT "marketing_autopilot_outcome_loops_mission_id_fkey"
    FOREIGN KEY ("mission_id") REFERENCES "marketing_missions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "marketing_autopilot_optimization_proposals"
    ADD CONSTRAINT "marketing_autopilot_optimization_proposals_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "marketing_autopilot_optimization_proposals"
    ADD CONSTRAINT "marketing_autopilot_optimization_proposals_mission_id_fkey"
    FOREIGN KEY ("mission_id") REFERENCES "marketing_missions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "marketing_autopilot_stop_loss_events"
    ADD CONSTRAINT "marketing_autopilot_stop_loss_events_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "marketing_autopilot_stop_loss_events"
    ADD CONSTRAINT "marketing_autopilot_stop_loss_events_mission_id_fkey"
    FOREIGN KEY ("mission_id") REFERENCES "marketing_missions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "marketing_autopilot_outcome_mutation_locks"
    ADD CONSTRAINT "marketing_autopilot_outcome_mutation_locks_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
