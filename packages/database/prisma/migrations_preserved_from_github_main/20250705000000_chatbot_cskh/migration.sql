-- Chatbot CSKH tables

CREATE TYPE "ChatbotBotStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED');
CREATE TYPE "ChatbotChannelType" AS ENUM ('WEBSITE_WIDGET', 'FACEBOOK', 'ZALO', 'TELEGRAM', 'API');
CREATE TYPE "ChatbotChannelStatus" AS ENUM ('PENDING', 'CONNECTED', 'DISCONNECTED');
CREATE TYPE "ChatbotSourceType" AS ENUM ('FAQ', 'URL', 'FILE', 'MANUAL');
CREATE TYPE "ChatbotConversationStatus" AS ENUM ('OPEN', 'CLOSED', 'NEEDS_STAFF');
CREATE TYPE "ChatbotLeadStatus" AS ENUM ('NEW', 'CONTACTED', 'CONVERTED', 'LOST');

CREATE TABLE "chatbot_bots" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "bot_name" TEXT NOT NULL,
    "website_url" TEXT,
    "business_name" TEXT,
    "industry" TEXT,
    "hotline" TEXT,
    "main_services" TEXT,
    "consultation_tone" TEXT NOT NULL DEFAULT 'friendly',
    "greeting" VARCHAR(500),
    "allowed_domains" VARCHAR(2000),
    "status" "ChatbotBotStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatbot_bots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chatbot_knowledge_sources" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "source_type" "ChatbotSourceType" NOT NULL,
    "title" TEXT NOT NULL,
    "url" VARCHAR(2000),
    "content" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "crawl_error" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatbot_knowledge_sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chatbot_channels" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "bot_id" TEXT,
    "name" TEXT NOT NULL,
    "channel_type" "ChatbotChannelType" NOT NULL,
    "status" "ChatbotChannelStatus" NOT NULL DEFAULT 'PENDING',
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatbot_channels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chatbot_conversations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "visitor_name" TEXT,
    "visitor_phone" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'website',
    "external_user_id" TEXT,
    "channel_ref" TEXT,
    "status" "ChatbotConversationStatus" NOT NULL DEFAULT 'OPEN',
    "last_user_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatbot_conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chatbot_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chatbot_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chatbot_leads" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "name" TEXT,
    "phone" TEXT,
    "need" TEXT,
    "page_url" VARCHAR(2000),
    "status" "ChatbotLeadStatus" NOT NULL DEFAULT 'NEW',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chatbot_leads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chatbot_usage" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "bot_id" TEXT,
    "month" VARCHAR(7) NOT NULL,
    "ai_replies" INTEGER NOT NULL DEFAULT 0,
    "credits_used" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatbot_usage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chatbot_org_settings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    "system_prompt" TEXT,
    "greeting" VARCHAR(500),
    "fallback_reply" TEXT,
    "monthly_limit" INTEGER NOT NULL DEFAULT 1000,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatbot_org_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chatbot_facebook_pages" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "page_name" TEXT NOT NULL,
    "page_access_token_encrypted" TEXT NOT NULL,
    "ai_enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "webhook_subscribed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatbot_facebook_pages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "chatbot_conversations_bot_id_session_id_key" ON "chatbot_conversations"("bot_id", "session_id");
CREATE INDEX "chatbot_bots_organization_id_status_idx" ON "chatbot_bots"("organization_id", "status");
CREATE INDEX "chatbot_knowledge_sources_bot_id_status_idx" ON "chatbot_knowledge_sources"("bot_id", "status");
CREATE INDEX "chatbot_knowledge_sources_organization_id_idx" ON "chatbot_knowledge_sources"("organization_id");
CREATE INDEX "chatbot_channels_organization_id_channel_type_idx" ON "chatbot_channels"("organization_id", "channel_type");
CREATE INDEX "chatbot_conversations_organization_id_updated_at_idx" ON "chatbot_conversations"("organization_id", "updated_at");
CREATE INDEX "chatbot_messages_conversation_id_created_at_idx" ON "chatbot_messages"("conversation_id", "created_at");
CREATE INDEX "chatbot_leads_organization_id_created_at_idx" ON "chatbot_leads"("organization_id", "created_at");
CREATE INDEX "chatbot_leads_bot_id_idx" ON "chatbot_leads"("bot_id");
CREATE UNIQUE INDEX "chatbot_usage_organization_id_month_bot_id_key" ON "chatbot_usage"("organization_id", "month", "bot_id");
CREATE INDEX "chatbot_usage_organization_id_month_idx" ON "chatbot_usage"("organization_id", "month");
CREATE UNIQUE INDEX "chatbot_org_settings_organization_id_key" ON "chatbot_org_settings"("organization_id");
CREATE UNIQUE INDEX "chatbot_facebook_pages_page_id_key" ON "chatbot_facebook_pages"("page_id");
CREATE INDEX "chatbot_facebook_pages_organization_id_idx" ON "chatbot_facebook_pages"("organization_id");

ALTER TABLE "chatbot_bots" ADD CONSTRAINT "chatbot_bots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chatbot_knowledge_sources" ADD CONSTRAINT "chatbot_knowledge_sources_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chatbot_knowledge_sources" ADD CONSTRAINT "chatbot_knowledge_sources_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "chatbot_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chatbot_channels" ADD CONSTRAINT "chatbot_channels_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chatbot_channels" ADD CONSTRAINT "chatbot_channels_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "chatbot_bots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "chatbot_conversations" ADD CONSTRAINT "chatbot_conversations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chatbot_conversations" ADD CONSTRAINT "chatbot_conversations_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "chatbot_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chatbot_messages" ADD CONSTRAINT "chatbot_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chatbot_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chatbot_leads" ADD CONSTRAINT "chatbot_leads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chatbot_leads" ADD CONSTRAINT "chatbot_leads_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "chatbot_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chatbot_leads" ADD CONSTRAINT "chatbot_leads_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chatbot_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "chatbot_usage" ADD CONSTRAINT "chatbot_usage_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chatbot_usage" ADD CONSTRAINT "chatbot_usage_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "chatbot_bots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "chatbot_org_settings" ADD CONSTRAINT "chatbot_org_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chatbot_facebook_pages" ADD CONSTRAINT "chatbot_facebook_pages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chatbot_facebook_pages" ADD CONSTRAINT "chatbot_facebook_pages_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "chatbot_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
