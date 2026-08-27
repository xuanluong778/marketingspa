-- CreateEnum
CREATE TYPE "GoogleAdsCampaignDraftStatus" AS ENUM ('DRAFT', 'PREVIEWED', 'PENDING_APPROVAL', 'APPROVED', 'DEPLOYING', 'DEPLOYED', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GoogleAdsCampaignDeployStatus" AS ENUM ('PENDING', 'DEPLOYING', 'SUCCEEDED', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "google_ads_campaign_drafts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "login_customer_id" TEXT,
    "status" "GoogleAdsCampaignDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "brief" JSONB NOT NULL,
    "structured_draft" JSONB NOT NULL,
    "validation" JSONB NOT NULL DEFAULT '{}',
    "daily_budget" DECIMAL(14,2) NOT NULL,
    "monthly_estimate" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "approved_at" TIMESTAMP(3),
    "approved_by_user_id" TEXT,
    "previewed_at" TIMESTAMP(3),
    "idempotency_key" TEXT NOT NULL,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_ads_campaign_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_ads_campaign_deployments" (
    "id" TEXT NOT NULL,
    "draft_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "status" "GoogleAdsCampaignDeployStatus" NOT NULL DEFAULT 'PENDING',
    "idempotency_key" TEXT NOT NULL,
    "created_resources" JSONB NOT NULL DEFAULT '{}',
    "last_completed_step" TEXT,
    "last_error" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "provider_write_enabled" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_ads_campaign_deployments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "google_ads_campaign_drafts_idempotency_key_key" ON "google_ads_campaign_drafts"("idempotency_key");
CREATE INDEX "google_ads_campaign_drafts_organization_id_status_created_at_idx" ON "google_ads_campaign_drafts"("organization_id", "status", "created_at");
CREATE INDEX "google_ads_campaign_drafts_organization_id_customer_id_idx" ON "google_ads_campaign_drafts"("organization_id", "customer_id");
CREATE UNIQUE INDEX "google_ads_campaign_deployments_idempotency_key_key" ON "google_ads_campaign_deployments"("idempotency_key");
CREATE INDEX "google_ads_campaign_deployments_organization_id_status_idx" ON "google_ads_campaign_deployments"("organization_id", "status");
CREATE INDEX "google_ads_campaign_deployments_draft_id_idx" ON "google_ads_campaign_deployments"("draft_id");

ALTER TABLE "google_ads_campaign_drafts" ADD CONSTRAINT "google_ads_campaign_drafts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "google_ads_campaign_drafts" ADD CONSTRAINT "google_ads_campaign_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "google_ads_campaign_drafts" ADD CONSTRAINT "google_ads_campaign_drafts_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "google_ads_campaign_deployments" ADD CONSTRAINT "google_ads_campaign_deployments_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "google_ads_campaign_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "google_ads_campaign_deployments" ADD CONSTRAINT "google_ads_campaign_deployments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
