-- Google Ads Autopilot — additive models per org+customerId

CREATE TYPE "GoogleAdsAutopilotMode" AS ENUM ('MANUAL', 'GUARDED_AUTO');
CREATE TYPE "GoogleAdsAutopilotProposalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'AUTO_EXECUTED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "GoogleAdsAutopilotActionType" AS ENUM ('PAUSE_CAMPAIGN', 'ENABLE_CAMPAIGN', 'UPDATE_BUDGET', 'PAUSE_KEYWORD', 'ADD_NEGATIVE_KEYWORD');
CREATE TYPE "GoogleAdsAutopilotActionStatus" AS ENUM ('PENDING', 'WAITING_APPROVAL', 'EXECUTING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'SKIPPED_DISABLED');
CREATE TYPE "GoogleAdsAutopilotOutcomeVerdict" AS ENUM ('PENDING', 'POSITIVE', 'NEGATIVE', 'NEUTRAL');
CREATE TYPE "GoogleAdsAutopilotOutcomeHorizon" AS ENUM ('H24', 'D3', 'D7');

CREATE TABLE "google_ads_autopilot_configs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "login_customer_id" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "mode" "GoogleAdsAutopilotMode" NOT NULL DEFAULT 'MANUAL',
    "max_daily_budget" DECIMAL(14,2),
    "max_monthly_budget" DECIMAL(14,2),
    "max_budget_increase_pct" INTEGER NOT NULL DEFAULT 20,
    "max_budget_decrease_pct" INTEGER NOT NULL DEFAULT 20,
    "target_cpa" DECIMAL(14,4),
    "target_cpl" DECIMAL(14,4),
    "target_roas" DECIMAL(14,4),
    "stop_loss_daily_spend" DECIMAL(14,2),
    "min_spend_for_action" DECIMAL(14,2),
    "min_clicks_for_action" INTEGER,
    "min_conversions_for_action" INTEGER,
    "grace_period_hours" INTEGER NOT NULL DEFAULT 24,
    "max_actions_per_day" INTEGER NOT NULL DEFAULT 10,
    "actions_today" INTEGER NOT NULL DEFAULT 0,
    "actions_reset_date" DATE,
    "emergency_stop" BOOLEAN NOT NULL DEFAULT false,
    "write_whitelist_enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_scan_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_ads_autopilot_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "google_ads_autopilot_proposals" (
    "id" TEXT NOT NULL,
    "config_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "action_type" "GoogleAdsAutopilotActionType" NOT NULL,
    "status" "GoogleAdsAutopilotProposalStatus" NOT NULL DEFAULT 'PENDING',
    "risk_level" TEXT NOT NULL,
    "auto_eligible" BOOLEAN NOT NULL DEFAULT false,
    "campaign_id" TEXT,
    "external_campaign_id" TEXT,
    "keyword_resource" TEXT,
    "keyword_text" TEXT,
    "before_state" JSONB NOT NULL DEFAULT '{}',
    "after_state" JSONB NOT NULL DEFAULT '{}',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "policy_decision" JSONB NOT NULL DEFAULT '{}',
    "llm_analysis" JSONB,
    "reason" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "approved_by_user_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_ads_autopilot_proposals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "google_ads_autopilot_actions" (
    "id" TEXT NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "config_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "action_type" "GoogleAdsAutopilotActionType" NOT NULL,
    "status" "GoogleAdsAutopilotActionStatus" NOT NULL DEFAULT 'PENDING',
    "idempotency_key" TEXT NOT NULL,
    "before_state" JSONB NOT NULL DEFAULT '{}',
    "after_state" JSONB NOT NULL DEFAULT '{}',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "provider_write_enabled" BOOLEAN NOT NULL DEFAULT false,
    "provider_result" JSONB,
    "partial_state" JSONB,
    "last_error" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "bull_job_id" TEXT,
    "executed_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_ads_autopilot_actions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "google_ads_autopilot_outcomes" (
    "id" TEXT NOT NULL,
    "action_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "horizon" "GoogleAdsAutopilotOutcomeHorizon" NOT NULL,
    "verdict" "GoogleAdsAutopilotOutcomeVerdict" NOT NULL DEFAULT 'PENDING',
    "metrics_before" JSONB NOT NULL DEFAULT '{}',
    "metrics_after" JSONB NOT NULL DEFAULT '{}',
    "delta" JSONB,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "evaluated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "google_ads_autopilot_outcomes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "google_ads_autopilot_configs_organization_id_customer_id_key" ON "google_ads_autopilot_configs"("organization_id", "customer_id");
CREATE INDEX "google_ads_autopilot_configs_organization_id_enabled_idx" ON "google_ads_autopilot_configs"("organization_id", "enabled");

CREATE UNIQUE INDEX "google_ads_autopilot_proposals_idempotency_key_key" ON "google_ads_autopilot_proposals"("idempotency_key");
CREATE INDEX "google_ads_autopilot_proposals_organization_id_status_created_at_idx" ON "google_ads_autopilot_proposals"("organization_id", "status", "created_at");
CREATE INDEX "google_ads_autopilot_proposals_config_id_status_idx" ON "google_ads_autopilot_proposals"("config_id", "status");

CREATE UNIQUE INDEX "google_ads_autopilot_actions_proposal_id_key" ON "google_ads_autopilot_actions"("proposal_id");
CREATE UNIQUE INDEX "google_ads_autopilot_actions_idempotency_key_key" ON "google_ads_autopilot_actions"("idempotency_key");
CREATE INDEX "google_ads_autopilot_actions_organization_id_status_created_at_idx" ON "google_ads_autopilot_actions"("organization_id", "status", "created_at");
CREATE INDEX "google_ads_autopilot_actions_config_id_idx" ON "google_ads_autopilot_actions"("config_id");

CREATE UNIQUE INDEX "google_ads_autopilot_outcomes_action_id_horizon_key" ON "google_ads_autopilot_outcomes"("action_id", "horizon");
CREATE INDEX "google_ads_autopilot_outcomes_organization_id_verdict_scheduled_for_idx" ON "google_ads_autopilot_outcomes"("organization_id", "verdict", "scheduled_for");

ALTER TABLE "google_ads_autopilot_configs" ADD CONSTRAINT "google_ads_autopilot_configs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "google_ads_autopilot_proposals" ADD CONSTRAINT "google_ads_autopilot_proposals_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "google_ads_autopilot_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "google_ads_autopilot_proposals" ADD CONSTRAINT "google_ads_autopilot_proposals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "google_ads_autopilot_actions" ADD CONSTRAINT "google_ads_autopilot_actions_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "google_ads_autopilot_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "google_ads_autopilot_actions" ADD CONSTRAINT "google_ads_autopilot_actions_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "google_ads_autopilot_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "google_ads_autopilot_actions" ADD CONSTRAINT "google_ads_autopilot_actions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "google_ads_autopilot_outcomes" ADD CONSTRAINT "google_ads_autopilot_outcomes_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "google_ads_autopilot_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "google_ads_autopilot_outcomes" ADD CONSTRAINT "google_ads_autopilot_outcomes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
