-- Phase 3 OAuth hardening:
-- - Scope active connection by (user_id, organization_id)
-- - Scope fanpage token rows by (connection_id, page_id)
-- - Add pending OAuth connection storage (no overwrite of active until page selection success)

-- Active connection: replace unique(user_id) with unique(user_id, organization_id)
DROP INDEX IF EXISTS "auto_post_facebook_connections_user_id_key";
CREATE UNIQUE INDEX IF NOT EXISTS "auto_post_facebook_connections_user_id_organization_id_key"
  ON "auto_post_facebook_connections"("user_id", "organization_id");

-- Active pages: replace unique(user_id, page_id) with unique(connection_id, page_id)
DROP INDEX IF EXISTS "auto_post_facebook_pages_user_id_page_id_key";
CREATE UNIQUE INDEX IF NOT EXISTS "auto_post_facebook_pages_connection_id_page_id_key"
  ON "auto_post_facebook_pages"("connection_id", "page_id");

-- Pending OAuth connection
CREATE TABLE IF NOT EXISTS "auto_post_facebook_oauth_pending_connections" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "encrypted_access_token" TEXT NOT NULL,
  "token_expires_at" TIMESTAMP(3),
  "facebook_user_id" TEXT,
  "facebook_user_name" TEXT,
  "scopes" TEXT[] NOT NULL DEFAULT '{}'::text[],
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "auto_post_facebook_oauth_pending_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "auto_post_facebook_oauth_pending_connections_user_id_organization_id_key"
  ON "auto_post_facebook_oauth_pending_connections"("user_id", "organization_id");

CREATE INDEX IF NOT EXISTS "auto_post_facebook_oauth_pending_connections_organization_id_idx"
  ON "auto_post_facebook_oauth_pending_connections"("organization_id");

