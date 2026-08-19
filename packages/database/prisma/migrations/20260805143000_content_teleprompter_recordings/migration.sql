-- Teleprompter browser recordings: metadata only (blob on disk/object storage)

CREATE TABLE IF NOT EXISTS "content_teleprompter_recordings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "teleprompter_source_id" TEXT,
    "title" VARCHAR(500) NOT NULL,
    "recording_type" VARCHAR(40) NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "size" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "storage_key" VARCHAR(500) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "content_teleprompter_recordings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "content_teleprompter_recordings_organization_id_user_id_deleted_at_created_at_idx"
  ON "content_teleprompter_recordings"("organization_id", "user_id", "deleted_at", "created_at");

CREATE INDEX IF NOT EXISTS "content_teleprompter_recordings_organization_id_status_deleted_at_idx"
  ON "content_teleprompter_recordings"("organization_id", "status", "deleted_at");

CREATE INDEX IF NOT EXISTS "content_teleprompter_recordings_teleprompter_source_id_idx"
  ON "content_teleprompter_recordings"("teleprompter_source_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_teleprompter_recordings_organization_id_fkey'
  ) THEN
    ALTER TABLE "content_teleprompter_recordings"
      ADD CONSTRAINT "content_teleprompter_recordings_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_teleprompter_recordings_user_id_fkey'
  ) THEN
    ALTER TABLE "content_teleprompter_recordings"
      ADD CONSTRAINT "content_teleprompter_recordings_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_teleprompter_recordings_teleprompter_source_id_fkey'
  ) THEN
    ALTER TABLE "content_teleprompter_recordings"
      ADD CONSTRAINT "content_teleprompter_recordings_teleprompter_source_id_fkey"
      FOREIGN KEY ("teleprompter_source_id") REFERENCES "content_teleprompter_sources"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
