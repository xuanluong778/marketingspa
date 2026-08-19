-- Canvas workflow runtime: idempotent per-node execution logs (ACTIVE funnel only)

CREATE TYPE "FunnelRuntimeLogStatus" AS ENUM ('PENDING', 'SCHEDULED', 'SUCCESS', 'FAILED', 'SKIPPED');

CREATE TABLE IF NOT EXISTS "funnel_runtime_logs" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "funnel_id" TEXT NOT NULL,
  "lead_id" TEXT NOT NULL,
  "node_id" TEXT NOT NULL,
  "edge_id" TEXT,
  "event" TEXT NOT NULL,
  "branch" TEXT,
  "status" "FunnelRuntimeLogStatus" NOT NULL DEFAULT 'PENDING',
  "published_version" INTEGER NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "result" JSONB,
  "scheduled_for" TIMESTAMP(3),
  "executed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "funnel_runtime_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "funnel_runtime_logs_organization_id_idempotency_key_key"
  ON "funnel_runtime_logs"("organization_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "funnel_runtime_logs_organization_id_funnel_id_created_at_idx"
  ON "funnel_runtime_logs"("organization_id", "funnel_id", "created_at");

CREATE INDEX IF NOT EXISTS "funnel_runtime_logs_organization_id_lead_id_created_at_idx"
  ON "funnel_runtime_logs"("organization_id", "lead_id", "created_at");

ALTER TABLE "funnel_runtime_logs"
  ADD CONSTRAINT "funnel_runtime_logs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "funnel_runtime_logs"
  ADD CONSTRAINT "funnel_runtime_logs_funnel_id_fkey"
  FOREIGN KEY ("funnel_id") REFERENCES "funnel_recommendations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "funnel_runtime_logs"
  ADD CONSTRAINT "funnel_runtime_logs_lead_id_fkey"
  FOREIGN KEY ("lead_id") REFERENCES "leads"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
