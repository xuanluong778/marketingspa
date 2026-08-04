-- Automation & integrations MVP placeholder

-- MessageChannel: MESSENGER
ALTER TYPE "MessageChannel" ADD VALUE IF NOT EXISTS 'MESSENGER';

-- AutomationTriggerType: new triggers
ALTER TYPE "AutomationTriggerType" ADD VALUE IF NOT EXISTS 'APPOINTMENT_CREATED';
ALTER TYPE "AutomationTriggerType" ADD VALUE IF NOT EXISTS 'APPOINTMENT_24H_BEFORE';
ALTER TYPE "AutomationTriggerType" ADD VALUE IF NOT EXISTS 'APPOINTMENT_2H_BEFORE';
ALTER TYPE "AutomationTriggerType" ADD VALUE IF NOT EXISTS 'NO_SHOW';

-- AutomationLogStatus: SENT
ALTER TYPE "AutomationLogStatus" ADD VALUE IF NOT EXISTS 'SENT';

-- Integration enums
CREATE TYPE "IntegrationProvider" AS ENUM ('META_ADS', 'GOOGLE_ADS', 'ZALO_OA', 'SMS', 'EMAIL');
CREATE TYPE "IntegrationStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'ERROR');

-- AutomationFlow: channel + delay
ALTER TABLE "automation_flows" ADD COLUMN IF NOT EXISTS "channel" "MessageChannel";
ALTER TABLE "automation_flows" ADD COLUMN IF NOT EXISTS "delay_minutes" INTEGER NOT NULL DEFAULT 0;

-- AutomationLog: channel + rendered content
ALTER TABLE "automation_logs" ADD COLUMN IF NOT EXISTS "channel" "MessageChannel";
ALTER TABLE "automation_logs" ADD COLUMN IF NOT EXISTS "rendered_content" TEXT;

-- Integrations table
CREATE TABLE IF NOT EXISTS "integrations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "encrypted_credentials" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "last_tested_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "integrations_organization_id_provider_key"
  ON "integrations"("organization_id", "provider");
CREATE INDEX IF NOT EXISTS "integrations_organization_id_idx"
  ON "integrations"("organization_id");

ALTER TABLE "integrations"
  ADD CONSTRAINT "integrations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
