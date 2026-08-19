-- AI Funnel Generator recommendation sessions (preview only)
CREATE TABLE "funnel_recommendations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "created_by_id" TEXT,
    "prompt" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ai',
    "selected_slug" TEXT,
    "selected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "funnel_recommendations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "funnel_recommendations_organization_id_created_at_idx"
  ON "funnel_recommendations"("organization_id", "created_at");

ALTER TABLE "funnel_recommendations"
  ADD CONSTRAINT "funnel_recommendations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
