CREATE TABLE "marketing_context_snapshots" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "created_by_id" TEXT,
    "time_range_from" TIMESTAMP(3) NOT NULL,
    "time_range_to" TIMESTAMP(3) NOT NULL,
    "engine_version" TEXT NOT NULL DEFAULT 'v1',
    "metrics_json" JSONB NOT NULL DEFAULT '{}',
    "insights_json" JSONB NOT NULL DEFAULT '[]',
    "sources_json" JSONB NOT NULL DEFAULT '[]',
    "snapshot_json" JSONB NOT NULL DEFAULT '{}',
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_context_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "marketing_context_snapshots_organization_id_created_at_idx"
ON "marketing_context_snapshots"("organization_id", "created_at");

CREATE INDEX "marketing_context_snapshots_organization_id_expires_at_idx"
ON "marketing_context_snapshots"("organization_id", "expires_at");

ALTER TABLE "marketing_context_snapshots"
ADD CONSTRAINT "marketing_context_snapshots_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketing_context_snapshots"
ADD CONSTRAINT "marketing_context_snapshots_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
