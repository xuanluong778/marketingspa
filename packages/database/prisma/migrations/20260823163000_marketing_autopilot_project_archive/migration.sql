-- Soft archive for Marketing Autopilot projects (no cascade delete of missions/assets)
ALTER TABLE "marketing_autopilot_projects"
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archived_by_id" TEXT;

CREATE INDEX IF NOT EXISTS "marketing_autopilot_projects_organization_id_deleted_at_idx"
  ON "marketing_autopilot_projects"("organization_id", "deleted_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketing_autopilot_projects_archived_by_id_fkey'
  ) THEN
    ALTER TABLE "marketing_autopilot_projects"
      ADD CONSTRAINT "marketing_autopilot_projects_archived_by_id_fkey"
      FOREIGN KEY ("archived_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
