-- Prompt 8: bind Lead + Chatbot CSKH to Funnel recommendation
ALTER TABLE "funnel_recommendations"
  ADD COLUMN IF NOT EXISTS "chatbot_bot_id" TEXT;

ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "funnel_recommendation_id" TEXT;

CREATE INDEX IF NOT EXISTS "funnel_recommendations_chatbot_bot_id_idx"
  ON "funnel_recommendations"("chatbot_bot_id");

CREATE INDEX IF NOT EXISTS "leads_funnel_recommendation_id_idx"
  ON "leads"("funnel_recommendation_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'funnel_recommendations_chatbot_bot_id_fkey'
  ) THEN
    ALTER TABLE "funnel_recommendations"
      ADD CONSTRAINT "funnel_recommendations_chatbot_bot_id_fkey"
      FOREIGN KEY ("chatbot_bot_id") REFERENCES "chatbot_bots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_funnel_recommendation_id_fkey'
  ) THEN
    ALTER TABLE "leads"
      ADD CONSTRAINT "leads_funnel_recommendation_id_fkey"
      FOREIGN KEY ("funnel_recommendation_id") REFERENCES "funnel_recommendations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
