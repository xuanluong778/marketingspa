-- Work management collab: comments, attachments, review flow, notifications

ALTER TABLE "work_tasks"
  ADD COLUMN IF NOT EXISTS "revision_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_submitted_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "last_submitted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_reviewed_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "last_reviewed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_review_note" TEXT,
  ADD COLUMN IF NOT EXISTS "last_review_action" VARCHAR(32);

CREATE TABLE IF NOT EXISTS "work_task_comments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mention_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "edited_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "work_task_comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "work_attachments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "task_id" TEXT,
    "original_name" VARCHAR(500) NOT NULL,
    "stored_name" VARCHAR(80) NOT NULL,
    "file_key" VARCHAR(400) NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "uploaded_by_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "work_attachments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "work_task_status_histories" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "from_column_key" VARCHAR(32),
    "to_column_key" VARCHAR(32) NOT NULL,
    "from_column_id" TEXT,
    "to_column_id" TEXT NOT NULL,
    "action" VARCHAR(32) NOT NULL,
    "actor_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "work_task_status_histories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "work_task_review_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "submitted_by_id" TEXT,
    "reviewed_by_id" TEXT,
    "note" TEXT,
    "revision_number" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "work_task_review_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "work_notifications" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "type" VARCHAR(32) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "body" TEXT,
    "task_id" TEXT,
    "project_id" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "work_notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "work_task_comments_organization_id_task_id_created_at_idx" ON "work_task_comments"("organization_id", "task_id", "created_at");
CREATE INDEX IF NOT EXISTS "work_task_comments_parent_id_idx" ON "work_task_comments"("parent_id");
CREATE INDEX IF NOT EXISTS "work_task_comments_author_id_idx" ON "work_task_comments"("author_id");

CREATE UNIQUE INDEX IF NOT EXISTS "work_attachments_organization_id_stored_name_key" ON "work_attachments"("organization_id", "stored_name");
CREATE INDEX IF NOT EXISTS "work_attachments_organization_id_project_id_deleted_at_idx" ON "work_attachments"("organization_id", "project_id", "deleted_at");
CREATE INDEX IF NOT EXISTS "work_attachments_task_id_deleted_at_idx" ON "work_attachments"("task_id", "deleted_at");
CREATE INDEX IF NOT EXISTS "work_attachments_uploaded_by_id_idx" ON "work_attachments"("uploaded_by_id");

CREATE INDEX IF NOT EXISTS "work_task_status_histories_task_id_created_at_idx" ON "work_task_status_histories"("task_id", "created_at");
CREATE INDEX IF NOT EXISTS "work_task_status_histories_organization_id_created_at_idx" ON "work_task_status_histories"("organization_id", "created_at");

CREATE INDEX IF NOT EXISTS "work_task_review_events_task_id_created_at_idx" ON "work_task_review_events"("task_id", "created_at");
CREATE INDEX IF NOT EXISTS "work_task_review_events_organization_id_created_at_idx" ON "work_task_review_events"("organization_id", "created_at");

CREATE INDEX IF NOT EXISTS "work_notifications_recipient_id_is_read_created_at_idx" ON "work_notifications"("recipient_id", "is_read", "created_at");
CREATE INDEX IF NOT EXISTS "work_notifications_organization_id_created_at_idx" ON "work_notifications"("organization_id", "created_at");

DO $$ BEGIN
  ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_last_submitted_by_id_fkey"
    FOREIGN KEY ("last_submitted_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_last_reviewed_by_id_fkey"
    FOREIGN KEY ("last_reviewed_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_task_comments" ADD CONSTRAINT "work_task_comments_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_task_comments" ADD CONSTRAINT "work_task_comments_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "work_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_task_comments" ADD CONSTRAINT "work_task_comments_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "work_task_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_task_comments" ADD CONSTRAINT "work_task_comments_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_attachments" ADD CONSTRAINT "work_attachments_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_attachments" ADD CONSTRAINT "work_attachments_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "work_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_attachments" ADD CONSTRAINT "work_attachments_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "work_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_attachments" ADD CONSTRAINT "work_attachments_uploaded_by_id_fkey"
    FOREIGN KEY ("uploaded_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_task_status_histories" ADD CONSTRAINT "work_task_status_histories_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_task_status_histories" ADD CONSTRAINT "work_task_status_histories_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "work_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_task_status_histories" ADD CONSTRAINT "work_task_status_histories_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_task_review_events" ADD CONSTRAINT "work_task_review_events_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_task_review_events" ADD CONSTRAINT "work_task_review_events_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "work_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_task_review_events" ADD CONSTRAINT "work_task_review_events_submitted_by_id_fkey"
    FOREIGN KEY ("submitted_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_task_review_events" ADD CONSTRAINT "work_task_review_events_reviewed_by_id_fkey"
    FOREIGN KEY ("reviewed_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_notifications" ADD CONSTRAINT "work_notifications_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_notifications" ADD CONSTRAINT "work_notifications_recipient_id_fkey"
    FOREIGN KEY ("recipient_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_notifications" ADD CONSTRAINT "work_notifications_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
