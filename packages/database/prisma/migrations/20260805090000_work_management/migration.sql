-- Work management: projects, kanban columns, tasks, assignees, watchers, checklist

CREATE TABLE IF NOT EXISTS "work_projects" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "work_projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "work_board_columns" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "key" VARCHAR(32) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "work_board_columns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "work_tasks" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "column_id" TEXT NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT,
    "assigner_id" TEXT,
    "created_by_id" TEXT,
    "start_date" DATE,
    "deadline" DATE,
    "priority" VARCHAR(16) NOT NULL DEFAULT 'MEDIUM',
    "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "progress" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "copied_from_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "work_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "work_task_assignees" (
    "task_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "work_task_assignees_pkey" PRIMARY KEY ("task_id","employee_id")
);

CREATE TABLE IF NOT EXISTS "work_task_watchers" (
    "task_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "work_task_watchers_pkey" PRIMARY KEY ("task_id","employee_id")
);

CREATE TABLE IF NOT EXISTS "work_checklist_items" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "is_done" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "work_checklist_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "work_projects_organization_id_is_archived_idx" ON "work_projects"("organization_id", "is_archived");
CREATE UNIQUE INDEX IF NOT EXISTS "work_board_columns_project_id_key_key" ON "work_board_columns"("project_id", "key");
CREATE INDEX IF NOT EXISTS "work_board_columns_project_id_sort_order_idx" ON "work_board_columns"("project_id", "sort_order");
CREATE INDEX IF NOT EXISTS "work_tasks_organization_id_project_id_deleted_at_idx" ON "work_tasks"("organization_id", "project_id", "deleted_at");
CREATE INDEX IF NOT EXISTS "work_tasks_project_id_column_id_sort_order_idx" ON "work_tasks"("project_id", "column_id", "sort_order");
CREATE INDEX IF NOT EXISTS "work_tasks_organization_id_is_archived_deleted_at_idx" ON "work_tasks"("organization_id", "is_archived", "deleted_at");
CREATE INDEX IF NOT EXISTS "work_tasks_assigner_id_idx" ON "work_tasks"("assigner_id");
CREATE INDEX IF NOT EXISTS "work_task_assignees_employee_id_idx" ON "work_task_assignees"("employee_id");
CREATE INDEX IF NOT EXISTS "work_task_watchers_employee_id_idx" ON "work_task_watchers"("employee_id");
CREATE INDEX IF NOT EXISTS "work_checklist_items_task_id_sort_order_idx" ON "work_checklist_items"("task_id", "sort_order");

DO $$ BEGIN
  ALTER TABLE "work_projects" ADD CONSTRAINT "work_projects_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_board_columns" ADD CONSTRAINT "work_board_columns_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "work_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "work_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_column_id_fkey"
    FOREIGN KEY ("column_id") REFERENCES "work_board_columns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_assigner_id_fkey"
    FOREIGN KEY ("assigner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_task_assignees" ADD CONSTRAINT "work_task_assignees_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "work_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_task_assignees" ADD CONSTRAINT "work_task_assignees_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_task_watchers" ADD CONSTRAINT "work_task_watchers_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "work_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_task_watchers" ADD CONSTRAINT "work_task_watchers_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_checklist_items" ADD CONSTRAINT "work_checklist_items_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "work_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
