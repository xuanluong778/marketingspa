-- Prompt 16: Funnel publish lifecycle + versioning

CREATE TYPE "FunnelPublishStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

ALTER TABLE "funnel_recommendations"
  ADD COLUMN IF NOT EXISTS "status" "FunnelPublishStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS "published_spec" JSONB,
  ADD COLUMN IF NOT EXISTS "published_version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "published_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "paused_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cloned_from_id" TEXT;

CREATE INDEX IF NOT EXISTS "funnel_recommendations_organization_id_status_idx"
  ON "funnel_recommendations"("organization_id", "status");

CREATE INDEX IF NOT EXISTS "funnel_recommendations_cloned_from_id_idx"
  ON "funnel_recommendations"("cloned_from_id");

ALTER TABLE "funnel_recommendations"
  ADD CONSTRAINT "funnel_recommendations_cloned_from_id_fkey"
  FOREIGN KEY ("cloned_from_id") REFERENCES "funnel_recommendations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "funnel_versions" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "funnel_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "spec" JSONB NOT NULL,
  "summary" VARCHAR(500),
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "funnel_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "funnel_versions_funnel_id_version_key"
  ON "funnel_versions"("funnel_id", "version");

CREATE INDEX IF NOT EXISTS "funnel_versions_organization_id_funnel_id_idx"
  ON "funnel_versions"("organization_id", "funnel_id");

ALTER TABLE "funnel_versions"
  ADD CONSTRAINT "funnel_versions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "funnel_versions"
  ADD CONSTRAINT "funnel_versions_funnel_id_fkey"
  FOREIGN KEY ("funnel_id") REFERENCES "funnel_recommendations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
