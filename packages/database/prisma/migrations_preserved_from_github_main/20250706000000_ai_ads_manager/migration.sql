-- AI Ads Manager tables (user-scoped)

CREATE TYPE "AdConnectionProvider" AS ENUM ('META', 'GOOGLE', 'GMAIL');
CREATE TYPE "AdConnectionStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'TOKEN_EXPIRED', 'INSUFFICIENT_PERMISSIONS', 'ERROR');
CREATE TYPE "AdAutomationRuleType" AS ENUM ('PAUSE_SPEND_NO_CONVERSION', 'PAUSE_CPA_THRESHOLD', 'PAUSE_ROAS_THRESHOLD', 'ALERT_CTR_LOW', 'ALERT_CPM_HIGH', 'ALERT_CPA_INCREASE', 'ALERT_ROAS_DROP');
CREATE TYPE "AdAutomationAction" AS ENUM ('PAUSE', 'ENABLE', 'ALERT', 'RECOMMEND');
CREATE TYPE "AdDraftStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'REJECTED');
CREATE TYPE "AdEmailReportSchedule" AS ENUM ('DAILY', 'WEEKLY', 'ON_ALERT');

CREATE TABLE "ad_connections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "provider" "AdConnectionProvider" NOT NULL,
    "status" "AdConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "encrypted_credentials" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "external_account_id" TEXT,
    "external_account_name" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "last_sync_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ad_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ad_manager_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ad_manager_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ad_manager_campaigns" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AdCampaignStatus" NOT NULL DEFAULT 'ACTIVE',
    "budget" DECIMAL(14,2),
    "objective" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ad_manager_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ad_insights" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "campaign_id" TEXT,
    "platform" "AdPlatform" NOT NULL,
    "external_campaign_id" TEXT NOT NULL,
    "campaign_name" TEXT NOT NULL,
    "date_from" DATE NOT NULL,
    "date_to" DATE NOT NULL,
    "spend" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "revenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "ctr" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "cpc" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "cpm" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "frequency" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "conversions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "leads" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cpa" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "cpl" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "roas" DECIMAL(14,4),
    "efficiency_score" INTEGER,
    "ai_suggestion" TEXT,
    "raw_metrics" JSONB NOT NULL DEFAULT '{}',
    "synced_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ad_insights_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ad_manager_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "auto_mode_enabled" BOOLEAN NOT NULL DEFAULT false,
    "daily_budget_limit" DECIMAL(14,2),
    "max_toggles_per_day" INTEGER NOT NULL DEFAULT 10,
    "toggles_today" INTEGER NOT NULL DEFAULT 0,
    "toggles_reset_date" DATE,
    "emergency_stop" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ad_manager_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ad_automation_rules" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rule_type" "AdAutomationRuleType" NOT NULL,
    "platform" "AdPlatform",
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "threshold" DECIMAL(14,4),
    "spend_threshold" DECIMAL(14,2),
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ad_automation_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ad_automation_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "rule_id" TEXT,
    "campaign_id" TEXT,
    "platform" "AdPlatform" NOT NULL,
    "external_campaign_id" TEXT,
    "campaign_name" TEXT,
    "action" "AdAutomationAction" NOT NULL,
    "auto_mode" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ad_automation_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ad_ai_recommendations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "campaign_id" TEXT,
    "platform" "AdPlatform",
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ad_ai_recommendations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ad_email_reports" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "schedule" "AdEmailReportSchedule" NOT NULL DEFAULT 'DAILY',
    "recipient_email" TEXT NOT NULL,
    "report_on_loss" BOOLEAN NOT NULL DEFAULT true,
    "report_on_low_roas" BOOLEAN NOT NULL DEFAULT true,
    "report_on_auto_pause" BOOLEAN NOT NULL DEFAULT true,
    "last_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ad_email_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ad_drafts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "status" "AdDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "objective" TEXT,
    "budget" DECIMAL(14,2),
    "audience" TEXT,
    "content" TEXT,
    "headline" TEXT,
    "cta" TEXT,
    "landing_page" TEXT,
    "creative" JSONB NOT NULL DEFAULT '{}',
    "ai_generated" BOOLEAN NOT NULL DEFAULT true,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ad_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ad_connections_user_id_provider_key" ON "ad_connections"("user_id", "provider");
CREATE INDEX "ad_connections_organization_id_idx" ON "ad_connections"("organization_id");
CREATE UNIQUE INDEX "ad_manager_accounts_user_id_platform_external_id_key" ON "ad_manager_accounts"("user_id", "platform", "external_id");
CREATE INDEX "ad_manager_accounts_organization_id_idx" ON "ad_manager_accounts"("organization_id");
CREATE UNIQUE INDEX "ad_manager_campaigns_user_id_platform_external_id_key" ON "ad_manager_campaigns"("user_id", "platform", "external_id");
CREATE INDEX "ad_manager_campaigns_organization_id_status_idx" ON "ad_manager_campaigns"("organization_id", "status");
CREATE INDEX "ad_manager_campaigns_account_id_idx" ON "ad_manager_campaigns"("account_id");
CREATE UNIQUE INDEX "ad_insights_user_id_platform_external_campaign_id_date_from_date_to_key" ON "ad_insights"("user_id", "platform", "external_campaign_id", "date_from", "date_to");
CREATE INDEX "ad_insights_organization_id_date_from_idx" ON "ad_insights"("organization_id", "date_from");
CREATE INDEX "ad_insights_campaign_id_idx" ON "ad_insights"("campaign_id");
CREATE UNIQUE INDEX "ad_manager_settings_user_id_key" ON "ad_manager_settings"("user_id");
CREATE INDEX "ad_manager_settings_organization_id_idx" ON "ad_manager_settings"("organization_id");
CREATE INDEX "ad_automation_rules_user_id_enabled_idx" ON "ad_automation_rules"("user_id", "enabled");
CREATE INDEX "ad_automation_logs_user_id_created_at_idx" ON "ad_automation_logs"("user_id", "created_at");
CREATE INDEX "ad_ai_recommendations_user_id_dismissed_idx" ON "ad_ai_recommendations"("user_id", "dismissed");
CREATE INDEX "ad_email_reports_user_id_idx" ON "ad_email_reports"("user_id");
CREATE INDEX "ad_drafts_user_id_status_idx" ON "ad_drafts"("user_id", "status");

ALTER TABLE "ad_connections" ADD CONSTRAINT "ad_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_manager_accounts" ADD CONSTRAINT "ad_manager_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_manager_campaigns" ADD CONSTRAINT "ad_manager_campaigns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_manager_campaigns" ADD CONSTRAINT "ad_manager_campaigns_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ad_manager_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_insights" ADD CONSTRAINT "ad_insights_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_insights" ADD CONSTRAINT "ad_insights_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "ad_manager_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ad_manager_settings" ADD CONSTRAINT "ad_manager_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_automation_rules" ADD CONSTRAINT "ad_automation_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_automation_logs" ADD CONSTRAINT "ad_automation_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_automation_logs" ADD CONSTRAINT "ad_automation_logs_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "ad_automation_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ad_automation_logs" ADD CONSTRAINT "ad_automation_logs_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "ad_manager_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ad_ai_recommendations" ADD CONSTRAINT "ad_ai_recommendations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_ai_recommendations" ADD CONSTRAINT "ad_ai_recommendations_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "ad_manager_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ad_email_reports" ADD CONSTRAINT "ad_email_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_drafts" ADD CONSTRAINT "ad_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
