-- Email Marketing (org-scoped, multi-tenant)

CREATE TYPE "EmailCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "EmailRecipientStatus" AS ENUM ('PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'FAILED', 'UNSUBSCRIBED', 'SKIPPED');
CREATE TYPE "EmailEventType" AS ENUM ('SENT', 'DELIVERED', 'OPEN', 'CLICK', 'BOUNCE', 'UNSUBSCRIBE', 'COMPLAINT', 'FAILED');
CREATE TYPE "EmailContactStatus" AS ENUM ('SUBSCRIBED', 'UNSUBSCRIBED', 'BOUNCED');
CREATE TYPE "EmailDomainStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');
CREATE TYPE "EmailSuppressionReason" AS ENUM ('UNSUBSCRIBE', 'BOUNCE', 'COMPLAINT', 'MANUAL');
CREATE TYPE "EmailAutomationTrigger" AS ENUM ('NEW_CONTACT', 'LIST_JOIN', 'SCHEDULED');
CREATE TYPE "EmailAutomationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED');

CREATE TABLE "email_sender_domains" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "from_name" TEXT NOT NULL,
  "from_email" TEXT NOT NULL,
  "reply_to" TEXT,
  "status" "EmailDomainStatus" NOT NULL DEFAULT 'PENDING',
  "dkim_host" TEXT,
  "dkim_value" TEXT,
  "spf_value" TEXT,
  "verified_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "email_sender_domains_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_templates" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "preview_text" TEXT,
  "html_body" TEXT NOT NULL,
  "text_body" TEXT,
  "category" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_contacts" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "phone" TEXT,
  "customer_id" TEXT,
  "lead_id" TEXT,
  "status" "EmailContactStatus" NOT NULL DEFAULT 'SUBSCRIBED',
  "custom_fields" JSONB NOT NULL DEFAULT '{}',
  "unsubscribed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "email_contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_lists" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "email_lists_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_list_members" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "list_id" TEXT NOT NULL,
  "contact_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_list_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_segments" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rules" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "email_segments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_campaigns" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "subject" TEXT,
  "template_id" TEXT,
  "list_id" TEXT,
  "segment_id" TEXT,
  "sender_domain_id" TEXT,
  "status" "EmailCampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "scheduled_at" TIMESTAMP(3),
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "total_recipients" INTEGER NOT NULL DEFAULT 0,
  "queued_count" INTEGER NOT NULL DEFAULT 0,
  "sent_count" INTEGER NOT NULL DEFAULT 0,
  "delivered_count" INTEGER NOT NULL DEFAULT 0,
  "open_count" INTEGER NOT NULL DEFAULT 0,
  "click_count" INTEGER NOT NULL DEFAULT 0,
  "bounce_count" INTEGER NOT NULL DEFAULT 0,
  "fail_count" INTEGER NOT NULL DEFAULT 0,
  "unsubscribe_count" INTEGER NOT NULL DEFAULT 0,
  "created_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "email_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_campaign_recipients" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "campaign_id" TEXT NOT NULL,
  "contact_id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "status" "EmailRecipientStatus" NOT NULL DEFAULT 'PENDING',
  "skip_reason" TEXT,
  "last_error" TEXT,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "queued_at" TIMESTAMP(3),
  "sent_at" TIMESTAMP(3),
  "opened_at" TIMESTAMP(3),
  "clicked_at" TIMESTAMP(3),
  "bounced_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "email_campaign_recipients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "campaign_id" TEXT,
  "recipient_id" TEXT,
  "contact_id" TEXT,
  "type" "EmailEventType" NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_suppressions" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "reason" "EmailSuppressionReason" NOT NULL,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_suppressions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_automations" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "trigger" "EmailAutomationTrigger" NOT NULL,
  "status" "EmailAutomationStatus" NOT NULL DEFAULT 'DRAFT',
  "template_id" TEXT,
  "list_id" TEXT,
  "delay_minutes" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "email_automations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_sender_domains_organization_id_domain_key" ON "email_sender_domains"("organization_id", "domain");
CREATE INDEX "email_sender_domains_organization_id_status_idx" ON "email_sender_domains"("organization_id", "status");
CREATE INDEX "email_templates_organization_id_is_active_idx" ON "email_templates"("organization_id", "is_active");
CREATE UNIQUE INDEX "email_contacts_organization_id_email_key" ON "email_contacts"("organization_id", "email");
CREATE INDEX "email_contacts_organization_id_status_idx" ON "email_contacts"("organization_id", "status");
CREATE INDEX "email_lists_organization_id_idx" ON "email_lists"("organization_id");
CREATE UNIQUE INDEX "email_list_members_list_id_contact_id_key" ON "email_list_members"("list_id", "contact_id");
CREATE INDEX "email_list_members_organization_id_list_id_idx" ON "email_list_members"("organization_id", "list_id");
CREATE INDEX "email_list_members_contact_id_idx" ON "email_list_members"("contact_id");
CREATE INDEX "email_segments_organization_id_idx" ON "email_segments"("organization_id");
CREATE INDEX "email_campaigns_organization_id_status_idx" ON "email_campaigns"("organization_id", "status");
CREATE INDEX "email_campaigns_organization_id_scheduled_at_idx" ON "email_campaigns"("organization_id", "scheduled_at");
CREATE UNIQUE INDEX "email_campaign_recipients_campaign_id_contact_id_key" ON "email_campaign_recipients"("campaign_id", "contact_id");
CREATE INDEX "email_campaign_recipients_organization_id_campaign_id_idx" ON "email_campaign_recipients"("organization_id", "campaign_id");
CREATE INDEX "email_campaign_recipients_campaign_id_status_idx" ON "email_campaign_recipients"("campaign_id", "status");
CREATE INDEX "email_events_organization_id_type_occurred_at_idx" ON "email_events"("organization_id", "type", "occurred_at");
CREATE INDEX "email_events_campaign_id_type_idx" ON "email_events"("campaign_id", "type");
CREATE INDEX "email_events_contact_id_idx" ON "email_events"("contact_id");
CREATE UNIQUE INDEX "email_suppressions_organization_id_email_key" ON "email_suppressions"("organization_id", "email");
CREATE INDEX "email_suppressions_organization_id_reason_idx" ON "email_suppressions"("organization_id", "reason");
CREATE INDEX "email_automations_organization_id_status_idx" ON "email_automations"("organization_id", "status");
CREATE INDEX "email_automations_organization_id_trigger_idx" ON "email_automations"("organization_id", "trigger");

ALTER TABLE "email_sender_domains" ADD CONSTRAINT "email_sender_domains_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_contacts" ADD CONSTRAINT "email_contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_lists" ADD CONSTRAINT "email_lists_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_list_members" ADD CONSTRAINT "email_list_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_list_members" ADD CONSTRAINT "email_list_members_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "email_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_list_members" ADD CONSTRAINT "email_list_members_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "email_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_segments" ADD CONSTRAINT "email_segments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "email_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "email_segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_sender_domain_id_fkey" FOREIGN KEY ("sender_domain_id") REFERENCES "email_sender_domains"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "email_campaign_recipients" ADD CONSTRAINT "email_campaign_recipients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_campaign_recipients" ADD CONSTRAINT "email_campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "email_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_campaign_recipients" ADD CONSTRAINT "email_campaign_recipients_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "email_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "email_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "email_campaign_recipients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "email_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "email_suppressions" ADD CONSTRAINT "email_suppressions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_automations" ADD CONSTRAINT "email_automations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_automations" ADD CONSTRAINT "email_automations_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "email_automations" ADD CONSTRAINT "email_automations_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "email_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;
