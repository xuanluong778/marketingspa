CREATE TABLE "marketing_autopilot_projects" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ANALYZED',
    "product_name" TEXT NOT NULL,
    "product_price" DECIMAL(15,2) NOT NULL,
    "customer_profile" TEXT NOT NULL,
    "target_area" TEXT NOT NULL,
    "monthly_budget" DECIMAL(15,2) NOT NULL,
    "primary_goal" TEXT NOT NULL,
    "input_snapshot" JSONB NOT NULL DEFAULT '{}',
    "analysis_summary" TEXT NOT NULL DEFAULT '',
    "analysis_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_autopilot_projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "marketing_autopilot_analyses" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "engine" TEXT NOT NULL DEFAULT 'heuristic',
    "summary" TEXT NOT NULL,
    "recommendation_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_autopilot_analyses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "marketing_autopilot_projects_organization_id_created_at_idx"
ON "marketing_autopilot_projects"("organization_id", "created_at");

CREATE INDEX "marketing_autopilot_projects_organization_id_status_idx"
ON "marketing_autopilot_projects"("organization_id", "status");

CREATE INDEX "marketing_autopilot_projects_created_by_id_idx"
ON "marketing_autopilot_projects"("created_by_id");

CREATE INDEX "marketing_autopilot_analyses_project_id_created_at_idx"
ON "marketing_autopilot_analyses"("project_id", "created_at");

CREATE INDEX "marketing_autopilot_analyses_organization_id_created_at_idx"
ON "marketing_autopilot_analyses"("organization_id", "created_at");

CREATE INDEX "marketing_autopilot_analyses_created_by_id_idx"
ON "marketing_autopilot_analyses"("created_by_id");

ALTER TABLE "marketing_autopilot_projects"
ADD CONSTRAINT "marketing_autopilot_projects_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketing_autopilot_projects"
ADD CONSTRAINT "marketing_autopilot_projects_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketing_autopilot_analyses"
ADD CONSTRAINT "marketing_autopilot_analyses_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "marketing_autopilot_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketing_autopilot_analyses"
ADD CONSTRAINT "marketing_autopilot_analyses_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketing_autopilot_analyses"
ADD CONSTRAINT "marketing_autopilot_analyses_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
