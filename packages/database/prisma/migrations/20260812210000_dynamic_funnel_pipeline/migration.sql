-- Dynamic FunnelPipeline + FunnelStage (backward-compatible with LeadPipelineStatus)

-- 1) Enums
CREATE TYPE "FunnelStageCategory" AS ENUM (
  'OPEN',
  'IN_PROGRESS',
  'QUALIFIED',
  'BOOKING',
  'WON',
  'LOST',
  'CUSTOM'
);

-- 2) Pipelines
CREATE TABLE "funnel_pipelines" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "position" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "funnel_pipelines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "funnel_pipelines_organization_id_is_default_idx"
  ON "funnel_pipelines"("organization_id", "is_default");
CREATE INDEX "funnel_pipelines_organization_id_position_idx"
  ON "funnel_pipelines"("organization_id", "position");

ALTER TABLE "funnel_pipelines"
  ADD CONSTRAINT "funnel_pipelines_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Default pipeline per organization
INSERT INTO "funnel_pipelines" (
  "id", "organization_id", "name", "description", "is_default", "is_active", "position", "created_at", "updated_at"
)
SELECT
  gen_random_uuid()::text,
  o."id",
  'Pipeline mặc định',
  'Migrated from legacy FunnelStage / LeadPipelineStatus',
  true,
  true,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "organizations" o
WHERE NOT EXISTS (
  SELECT 1 FROM "funnel_pipelines" fp
  WHERE fp."organization_id" = o."id" AND fp."is_default" = true
);

-- 3) Extend funnel_stages
ALTER TABLE "funnel_stages" ADD COLUMN IF NOT EXISTS "pipeline_id" TEXT;
ALTER TABLE "funnel_stages" ADD COLUMN IF NOT EXISTS "category" "FunnelStageCategory" NOT NULL DEFAULT 'OPEN';
ALTER TABLE "funnel_stages" ADD COLUMN IF NOT EXISTS "probability" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "funnel_stages" ADD COLUMN IF NOT EXISTS "sla_minutes" INTEGER;
ALTER TABLE "funnel_stages" ADD COLUMN IF NOT EXISTS "is_won" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "funnel_stages" ADD COLUMN IF NOT EXISTS "is_lost" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "funnel_stages" ADD COLUMN IF NOT EXISTS "legacy_status" "LeadPipelineStatus";

-- Backfill pipeline_id from org default pipeline
UPDATE "funnel_stages" fs
SET "pipeline_id" = fp."id"
FROM "funnel_pipelines" fp
WHERE fp."organization_id" = fs."organization_id"
  AND fp."is_default" = true
  AND fs."pipeline_id" IS NULL;

-- Convert code enum → text (nullable temporarily)
ALTER TABLE "funnel_stages" ALTER COLUMN "code" DROP DEFAULT;
ALTER TABLE "funnel_stages"
  ALTER COLUMN "code" TYPE TEXT USING CASE
    WHEN "code" IS NULL THEN NULL
    ELSE "code"::text
  END;

-- Backfill code for nulls from name heuristics / position
UPDATE "funnel_stages" SET "code" = 'NEW' WHERE "code" IS NULL AND (
  lower("name") LIKE '%mới%' OR lower("name") LIKE '%new%' OR "position" = 0
);
UPDATE "funnel_stages" SET "code" = 'CONTACTED' WHERE "code" IS NULL AND (
  lower("name") LIKE '%liên hệ%' OR lower("name") LIKE '%contact%'
);
UPDATE "funnel_stages" SET "code" = 'QUALIFIED' WHERE "code" IS NULL AND (
  lower("name") LIKE '%điều kiện%' OR lower("name") LIKE '%qualif%'
);
UPDATE "funnel_stages" SET "code" = 'BOOKED' WHERE "code" IS NULL AND (
  lower("name") LIKE '%đặt lịch%' OR lower("name") LIKE '%book%'
);
UPDATE "funnel_stages" SET "code" = 'CONFIRMED' WHERE "code" IS NULL AND (
  lower("name") LIKE '%xác nhận%' OR lower("name") LIKE '%confirm%'
);
UPDATE "funnel_stages" SET "code" = 'VISITED' WHERE "code" IS NULL AND (
  lower("name") LIKE '%đã đến%' OR lower("name") LIKE '%visit%'
);
UPDATE "funnel_stages" SET "code" = 'PURCHASED' WHERE "code" IS NULL AND (
  lower("name") LIKE '%mua%' OR lower("name") LIKE '%purchas%' OR lower("name") LIKE '%won%'
);
UPDATE "funnel_stages" SET "code" = 'LOST' WHERE "code" IS NULL AND (
  lower("name") LIKE '%mất%' OR lower("name") LIKE '%lost%'
);
UPDATE "funnel_stages"
SET "code" = 'STAGE_' || substr(replace("id", '-', ''), 1, 8)
WHERE "code" IS NULL OR trim("code") = '';

ALTER TABLE "funnel_stages" ALTER COLUMN "code" SET NOT NULL;

-- Deduplicate (pipeline_id, code) before unique index — keep earliest by position/created_at
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "pipeline_id", "code"
      ORDER BY "position" ASC, "created_at" ASC, "id" ASC
    ) AS rn
  FROM "funnel_stages"
  WHERE "pipeline_id" IS NOT NULL
)
UPDATE "funnel_stages" fs
SET "code" = fs."code" || '_DUP_' || substr(replace(fs."id", '-', ''), 1, 6)
FROM ranked r
WHERE fs."id" = r."id" AND r.rn > 1;

WITH ranked_name AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "pipeline_id", "name"
      ORDER BY "position" ASC, "created_at" ASC, "id" ASC
    ) AS rn
  FROM "funnel_stages"
  WHERE "pipeline_id" IS NOT NULL
)
UPDATE "funnel_stages" fs
SET "name" = fs."name" || ' (' || substr(replace(fs."id", '-', ''), 1, 4) || ')'
FROM ranked_name r
WHERE fs."id" = r."id" AND r.rn > 1;

-- legacy_status + category / won / lost / probability from code + old is_lost_stage
UPDATE "funnel_stages" SET
  "legacy_status" = CASE "code"
    WHEN 'NEW' THEN 'NEW'::"LeadPipelineStatus"
    WHEN 'CONTACTED' THEN 'CONTACTED'::"LeadPipelineStatus"
    WHEN 'QUALIFIED' THEN 'QUALIFIED'::"LeadPipelineStatus"
    WHEN 'BOOKED' THEN 'BOOKED'::"LeadPipelineStatus"
    WHEN 'CONFIRMED' THEN 'CONFIRMED'::"LeadPipelineStatus"
    WHEN 'VISITED' THEN 'VISITED'::"LeadPipelineStatus"
    WHEN 'PURCHASED' THEN 'PURCHASED'::"LeadPipelineStatus"
    WHEN 'LOST' THEN 'LOST'::"LeadPipelineStatus"
    ELSE NULL
  END,
  "category" = CASE "code"
    WHEN 'NEW' THEN 'OPEN'::"FunnelStageCategory"
    WHEN 'CONTACTED' THEN 'IN_PROGRESS'::"FunnelStageCategory"
    WHEN 'QUALIFIED' THEN 'QUALIFIED'::"FunnelStageCategory"
    WHEN 'BOOKED' THEN 'BOOKING'::"FunnelStageCategory"
    WHEN 'CONFIRMED' THEN 'BOOKING'::"FunnelStageCategory"
    WHEN 'VISITED' THEN 'BOOKING'::"FunnelStageCategory"
    WHEN 'PURCHASED' THEN 'WON'::"FunnelStageCategory"
    WHEN 'LOST' THEN 'LOST'::"FunnelStageCategory"
    ELSE 'CUSTOM'::"FunnelStageCategory"
  END,
  "probability" = CASE "code"
    WHEN 'NEW' THEN 10
    WHEN 'CONTACTED' THEN 20
    WHEN 'QUALIFIED' THEN 40
    WHEN 'BOOKED' THEN 50
    WHEN 'CONFIRMED' THEN 60
    WHEN 'VISITED' THEN 70
    WHEN 'PURCHASED' THEN 100
    WHEN 'LOST' THEN 0
    ELSE 0
  END,
  "sla_minutes" = CASE "code"
    WHEN 'NEW' THEN 15
    WHEN 'CONTACTED' THEN 60
    WHEN 'QUALIFIED' THEN 120
    WHEN 'BOOKED' THEN 1440
    WHEN 'CONFIRMED' THEN 720
    ELSE NULL
  END,
  "is_won" = ("code" = 'PURCHASED'),
  "is_lost" = ("code" = 'LOST' OR COALESCE("is_lost_stage", false));

-- Drop old unique (organization_id, name) — stages are unique per pipeline now
ALTER TABLE "funnel_stages" DROP CONSTRAINT IF EXISTS "funnel_stages_organization_id_name_key";

-- pipeline_id required after backfill (orphan stages without pipeline get a synthetic one)
INSERT INTO "funnel_pipelines" (
  "id", "organization_id", "name", "is_default", "is_active", "position", "created_at", "updated_at"
)
SELECT
  gen_random_uuid()::text,
  fs."organization_id",
  'Pipeline mặc định',
  true,
  true,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT "organization_id" FROM "funnel_stages" WHERE "pipeline_id" IS NULL
) fs
WHERE NOT EXISTS (
  SELECT 1 FROM "funnel_pipelines" fp
  WHERE fp."organization_id" = fs."organization_id" AND fp."is_default" = true
);

UPDATE "funnel_stages" fs
SET "pipeline_id" = fp."id"
FROM "funnel_pipelines" fp
WHERE fp."organization_id" = fs."organization_id"
  AND fp."is_default" = true
  AND fs."pipeline_id" IS NULL;

ALTER TABLE "funnel_stages" ALTER COLUMN "pipeline_id" SET NOT NULL;

ALTER TABLE "funnel_stages"
  ADD CONSTRAINT "funnel_stages_pipeline_id_fkey"
  FOREIGN KEY ("pipeline_id") REFERENCES "funnel_pipelines"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "funnel_stages_pipeline_id_code_key" ON "funnel_stages"("pipeline_id", "code");
CREATE UNIQUE INDEX "funnel_stages_pipeline_id_name_key" ON "funnel_stages"("pipeline_id", "name");
CREATE INDEX "funnel_stages_pipeline_id_position_idx" ON "funnel_stages"("pipeline_id", "position");

-- Drop legacy is_lost_stage (copied into is_lost)
ALTER TABLE "funnel_stages" DROP COLUMN IF EXISTS "is_lost_stage";

-- 4) Lead.pipeline_id (stage column already funnel_stage_id)
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "pipeline_id" TEXT;

UPDATE "leads" l
SET "pipeline_id" = fs."pipeline_id"
FROM "funnel_stages" fs
WHERE l."funnel_stage_id" = fs."id"
  AND l."pipeline_id" IS NULL;

UPDATE "leads" l
SET "pipeline_id" = fp."id"
FROM "funnel_pipelines" fp
WHERE fp."organization_id" = l."organization_id"
  AND fp."is_default" = true
  AND l."pipeline_id" IS NULL;

-- Fill missing stage from legacy pipeline_status
UPDATE "leads" l
SET "funnel_stage_id" = fs."id",
    "pipeline_id" = COALESCE(l."pipeline_id", fs."pipeline_id")
FROM "funnel_stages" fs
WHERE l."funnel_stage_id" IS NULL
  AND fs."organization_id" = l."organization_id"
  AND fs."legacy_status" = l."pipeline_status"
  AND fs."is_active" = true;

ALTER TABLE "leads"
  ADD CONSTRAINT "leads_pipeline_id_fkey"
  FOREIGN KEY ("pipeline_id") REFERENCES "funnel_pipelines"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "leads_organization_id_pipeline_id_funnel_stage_id_idx"
  ON "leads"("organization_id", "pipeline_id", "funnel_stage_id");
