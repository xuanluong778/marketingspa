-- Store AI-generated complete funnel specs (validated funnel-complete.v1)
ALTER TABLE "funnel_recommendations"
  ADD COLUMN IF NOT EXISTS "complete_spec" JSONB,
  ADD COLUMN IF NOT EXISTS "complete_source" TEXT,
  ADD COLUMN IF NOT EXISTS "complete_generated_at" TIMESTAMP(3);
