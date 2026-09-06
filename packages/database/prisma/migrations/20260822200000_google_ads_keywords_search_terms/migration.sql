-- Google Ads keywords + search term daily stats
CREATE TABLE "ad_keywords" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "ad_account_id" TEXT NOT NULL,
    "ad_campaign_id" TEXT NOT NULL,
    "ad_set_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "match_type" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "status" TEXT NOT NULL DEFAULT 'ENABLED',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_keywords_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ad_search_term_stats" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "ad_campaign_id" TEXT NOT NULL,
    "ad_set_id" TEXT,
    "search_term" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "spend" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "conversions" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "conversion_value" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "ctr" DECIMAL(18,8),
    "cpc" DECIMAL(18,8),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_search_term_stats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ad_keywords_organization_id_external_id_key" ON "ad_keywords"("organization_id", "external_id");
CREATE INDEX "ad_keywords_organization_id_ad_set_id_idx" ON "ad_keywords"("organization_id", "ad_set_id");

CREATE UNIQUE INDEX "ad_search_term_stats_ad_campaign_id_search_term_date_key" ON "ad_search_term_stats"("ad_campaign_id", "search_term", "date");
CREATE INDEX "ad_search_term_stats_organization_id_date_idx" ON "ad_search_term_stats"("organization_id", "date");

ALTER TABLE "ad_keywords" ADD CONSTRAINT "ad_keywords_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_keywords" ADD CONSTRAINT "ad_keywords_ad_account_id_fkey" FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_keywords" ADD CONSTRAINT "ad_keywords_ad_campaign_id_fkey" FOREIGN KEY ("ad_campaign_id") REFERENCES "ad_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_keywords" ADD CONSTRAINT "ad_keywords_ad_set_id_fkey" FOREIGN KEY ("ad_set_id") REFERENCES "ad_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ad_search_term_stats" ADD CONSTRAINT "ad_search_term_stats_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_search_term_stats" ADD CONSTRAINT "ad_search_term_stats_ad_campaign_id_fkey" FOREIGN KEY ("ad_campaign_id") REFERENCES "ad_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_search_term_stats" ADD CONSTRAINT "ad_search_term_stats_ad_set_id_fkey" FOREIGN KEY ("ad_set_id") REFERENCES "ad_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
