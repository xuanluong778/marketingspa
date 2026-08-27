-- AlterEnum
CREATE TYPE "FunnelBlueprintStatus" AS ENUM ('DRAFT', 'APPLIED', 'DISCARDED');

-- CreateTable
CREATE TABLE "funnel_blueprints" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "created_by_id" TEXT,
    "name" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "draft" JSONB NOT NULL,
    "status" "FunnelBlueprintStatus" NOT NULL DEFAULT 'DRAFT',
    "source" TEXT NOT NULL DEFAULT 'ai',
    "summary" TEXT,
    "applied_at" TIMESTAMP(3),
    "applied_meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "funnel_blueprints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "funnel_blueprints_organization_id_status_created_at_idx" ON "funnel_blueprints"("organization_id", "status", "created_at");

-- AddForeignKey
ALTER TABLE "funnel_blueprints" ADD CONSTRAINT "funnel_blueprints_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
