-- Additive: Marketing Mission Asset + Outcome Track recommendation linkage
-- Production: prisma migrate deploy

ALTER TABLE "marketing_mission_assets"
  ADD COLUMN IF NOT EXISTS "asset_type" TEXT,
  ADD COLUMN IF NOT EXISTS "recommendation_id" TEXT,
  ADD COLUMN IF NOT EXISTS "edit_url" TEXT;

CREATE INDEX IF NOT EXISTS "marketing_mission_assets_mission_id_recommendation_id_idx"
  ON "marketing_mission_assets"("mission_id", "recommendation_id");

CREATE INDEX IF NOT EXISTS "marketing_mission_assets_mission_id_asset_type_idx"
  ON "marketing_mission_assets"("mission_id", "asset_type");

ALTER TABLE "marketing_autopilot_outcome_tracks"
  ADD COLUMN IF NOT EXISTS "recommendation_id" TEXT;

CREATE INDEX IF NOT EXISTS "marketing_autopilot_outcome_tracks_recommendation_id_idx"
  ON "marketing_autopilot_outcome_tracks"("recommendation_id");
