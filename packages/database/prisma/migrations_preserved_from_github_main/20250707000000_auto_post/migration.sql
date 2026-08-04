-- Auto Post Facebook Fanpage MVP

CREATE TYPE "AutoPostStatus" AS ENUM (
  'DRAFT',
  'PENDING',
  'SCHEDULED',
  'PUBLISHING',
  'PUBLISHED',
  'FAILED',
  'CANCELLED'
);

CREATE TYPE "AutoPostType" AS ENUM (
  'SPA_SALES',
  'BRAND_BUILDING',
  'CUSTOMER_FEEDBACK',
  'PROMOTION',
  'BEAUTY_KNOWLEDGE',
  'OLD_CUSTOMER_CARE',
  'OPENING_EVENT',
  'INBOX_BOOKING'
);

CREATE TYPE "AutoPostFacebookConnectionStatus" AS ENUM (
  'CONNECTED',
  'DISCONNECTED',
  'TOKEN_EXPIRED',
  'ERROR'
);

CREATE TABLE "auto_post_facebook_connections" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "encrypted_access_token" TEXT NOT NULL,
  "token_expires_at" TIMESTAMP(3),
  "facebook_user_id" TEXT,
  "facebook_user_name" TEXT,
  "status" "AutoPostFacebookConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
  "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "auto_post_facebook_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auto_post_facebook_pages" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "connection_id" TEXT NOT NULL,
  "page_id" TEXT NOT NULL,
  "page_name" TEXT NOT NULL,
  "page_picture_url" TEXT,
  "encrypted_page_access_token" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "auto_post_facebook_pages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auto_posts" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "fanpage_id" TEXT,
  "fanpage_page_id" TEXT,
  "fanpage_name" TEXT,
  "post_type" "AutoPostType" NOT NULL,
  "topic" TEXT NOT NULL,
  "caption" TEXT NOT NULL,
  "image_url" TEXT,
  "link_url" TEXT,
  "hashtags" TEXT,
  "cta" TEXT,
  "spa_service" TEXT,
  "target_audience" TEXT,
  "tone" TEXT,
  "promotion" TEXT,
  "status" "AutoPostStatus" NOT NULL DEFAULT 'DRAFT',
  "scheduled_at" TIMESTAMP(3),
  "published_at" TIMESTAMP(3),
  "facebook_post_id" TEXT,
  "error_message" TEXT,
  "approved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "auto_posts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auto_post_api_logs" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "post_id" TEXT,
  "action" TEXT NOT NULL,
  "status_code" INTEGER,
  "error_code" TEXT,
  "message" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "auto_post_api_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auto_post_publish_logs" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "post_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "facebook_post_id" TEXT,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "auto_post_publish_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auto_post_facebook_connections_user_id_key" ON "auto_post_facebook_connections"("user_id");
CREATE INDEX "auto_post_facebook_connections_organization_id_idx" ON "auto_post_facebook_connections"("organization_id");

CREATE UNIQUE INDEX "auto_post_facebook_pages_user_id_page_id_key" ON "auto_post_facebook_pages"("user_id", "page_id");
CREATE INDEX "auto_post_facebook_pages_user_id_idx" ON "auto_post_facebook_pages"("user_id");

CREATE INDEX "auto_posts_user_id_status_idx" ON "auto_posts"("user_id", "status");
CREATE INDEX "auto_posts_user_id_created_at_idx" ON "auto_posts"("user_id", "created_at");
CREATE INDEX "auto_posts_status_scheduled_at_idx" ON "auto_posts"("status", "scheduled_at");

CREATE INDEX "auto_post_api_logs_user_id_created_at_idx" ON "auto_post_api_logs"("user_id", "created_at");
CREATE INDEX "auto_post_api_logs_post_id_idx" ON "auto_post_api_logs"("post_id");

CREATE INDEX "auto_post_publish_logs_user_id_created_at_idx" ON "auto_post_publish_logs"("user_id", "created_at");
CREATE INDEX "auto_post_publish_logs_post_id_idx" ON "auto_post_publish_logs"("post_id");

ALTER TABLE "auto_post_facebook_connections" ADD CONSTRAINT "auto_post_facebook_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "auto_post_facebook_pages" ADD CONSTRAINT "auto_post_facebook_pages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auto_post_facebook_pages" ADD CONSTRAINT "auto_post_facebook_pages_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "auto_post_facebook_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "auto_posts" ADD CONSTRAINT "auto_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auto_posts" ADD CONSTRAINT "auto_posts_fanpage_id_fkey" FOREIGN KEY ("fanpage_id") REFERENCES "auto_post_facebook_pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "auto_post_api_logs" ADD CONSTRAINT "auto_post_api_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auto_post_api_logs" ADD CONSTRAINT "auto_post_api_logs_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "auto_posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "auto_post_publish_logs" ADD CONSTRAINT "auto_post_publish_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auto_post_publish_logs" ADD CONSTRAINT "auto_post_publish_logs_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "auto_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
