-- Work management insights: time tracking, recurrence, audit, estimated time

ALTER TABLE "work_tasks"
  ADD COLUMN IF NOT EXISTS "estimated_minutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "recurrence_rule" VARCHAR(16),
  ADD COLUMN IF NOT EXISTS "recurrence_interval" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "recurrence_until" DATE,
  ADD COLUMN IF NOT EXISTS "recurrence_series_id" TEXT,
  ADD COLUMN IF NOT EXISTS "recurrence_occurrence_key" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "is_recurrence_template" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "last_reminder_sent_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_overdue_notified_at" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "work_tasks_organization_id_recurrence_occurrence_key_key"
  ON "work_tasks"("organization_id", "recurrence_occurrence_key");

CREATE INDEX IF NOT EXISTS "work_tasks_organization_id_deadline_idx" ON "work_tasks"("organization_id", "deadline");
CREATE INDEX IF NOT EXISTS "work_tasks_recurrence_series_id_idx" ON "work_tasks"("recurrence_series_id");

CREATE TABLE IF NOT EXISTS "work_time_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'STOPPED',
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "duration_seconds" INTEGER NOT NULL DEFAULT 0,
    "note" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "work_time_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "work_audit_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" VARCHAR(64) NOT NULL,
    "entity_type" VARCHAR(64) NOT NULL,
    "entity_id" TEXT,
    "task_id" TEXT,
    "project_id" TEXT,
    "summary" VARCHAR(500),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "work_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "work_time_logs_task_id_employee_id_status_idx" ON "work_time_logs"("task_id", "employee_id", "status");
CREATE INDEX IF NOT EXISTS "work_time_logs_organization_id_employee_id_created_at_idx" ON "work_time_logs"("organization_id", "employee_id", "created_at");
CREATE INDEX IF NOT EXISTS "work_audit_logs_organization_id_created_at_idx" ON "work_audit_logs"("organization_id", "created_at");
CREATE INDEX IF NOT EXISTS "work_audit_logs_task_id_created_at_idx" ON "work_audit_logs"("task_id", "created_at");
CREATE INDEX IF NOT EXISTS "work_audit_logs_project_id_created_at_idx" ON "work_audit_logs"("project_id", "created_at");
CREATE INDEX IF NOT EXISTS "work_audit_logs_actor_id_created_at_idx" ON "work_audit_logs"("actor_id", "created_at");

DO $$ BEGIN
  ALTER TABLE "work_time_logs" ADD CONSTRAINT "work_time_logs_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_time_logs" ADD CONSTRAINT "work_time_logs_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "work_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_time_logs" ADD CONSTRAINT "work_time_logs_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_audit_logs" ADD CONSTRAINT "work_audit_logs_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_audit_logs" ADD CONSTRAINT "work_audit_logs_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_audit_logs" ADD CONSTRAINT "work_audit_logs_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "work_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
