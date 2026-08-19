-- Persist last successful Graph sync (pages_read_engagement) for Xem chi tiết
ALTER TABLE "auto_post_facebook_pages"
  ADD COLUMN IF NOT EXISTS "last_synced_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_post_created_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_sync_snapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "last_sync_error" TEXT;
