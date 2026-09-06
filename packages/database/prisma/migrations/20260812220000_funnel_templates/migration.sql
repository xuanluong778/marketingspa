-- Funnel Template Engine (system catalog + org clones)

CREATE TABLE "funnel_templates" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "source_template_id" TEXT,
    "created_by_id" TEXT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "goal" JSONB NOT NULL,
    "required_inputs" JSONB NOT NULL DEFAULT '[]',
    "nodes" JSONB NOT NULL DEFAULT '[]',
    "connections" JSONB NOT NULL DEFAULT '[]',
    "recommended_automation" JSONB NOT NULL DEFAULT '[]',
    "definition" JSONB NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "funnel_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "funnel_templates_organization_id_is_active_idx"
  ON "funnel_templates"("organization_id", "is_active");
CREATE INDEX "funnel_templates_slug_idx" ON "funnel_templates"("slug");
CREATE INDEX "funnel_templates_is_system_slug_idx" ON "funnel_templates"("is_system", "slug");

-- System templates: unique slug
CREATE UNIQUE INDEX "funnel_templates_system_slug_key"
  ON "funnel_templates"("slug")
  WHERE "organization_id" IS NULL AND "is_system" = true;

-- Org clones: unique (org, slug)
CREATE UNIQUE INDEX "funnel_templates_org_slug_key"
  ON "funnel_templates"("organization_id", "slug")
  WHERE "organization_id" IS NOT NULL;

ALTER TABLE "funnel_templates"
  ADD CONSTRAINT "funnel_templates_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "funnel_templates"
  ADD CONSTRAINT "funnel_templates_source_template_id_fkey"
  FOREIGN KEY ("source_template_id") REFERENCES "funnel_templates"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
