-- Additive schema align for Marketing Autopilot outcome loop.
-- Do NOT edit 20260822160000 — it was already applied (checksum locked) on Dev.
-- Safe on clean DBs and on DBs that already ran 22160000.

CREATE INDEX IF NOT EXISTS "marketing_autopilot_outcome_loops_organization_id_project_i_idx"
  ON "marketing_autopilot_outcome_loops"("organization_id", "project_id");

DO $$ BEGIN
  ALTER TABLE "marketing_autopilot_optimization_proposals"
    ADD CONSTRAINT "marketing_autopilot_optimization_proposals_approved_by_id_fkey"
    FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
