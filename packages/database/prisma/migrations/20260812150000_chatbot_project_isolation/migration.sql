-- Chatbot CSKH Project isolation: KB ↔ bot + inbox indexes
-- Safe / additive — không xoá conversation/message

ALTER TABLE "rag_knowledge_bases"
  ADD COLUMN IF NOT EXISTS "bot_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rag_knowledge_bases_bot_id_fkey'
  ) THEN
    ALTER TABLE "rag_knowledge_bases"
      ADD CONSTRAINT "rag_knowledge_bases_bot_id_fkey"
      FOREIGN KEY ("bot_id") REFERENCES "chatbot_bots"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "rag_knowledge_bases_organization_id_bot_id_idx"
  ON "rag_knowledge_bases"("organization_id", "bot_id");

CREATE INDEX IF NOT EXISTS "rag_knowledge_bases_bot_id_idx"
  ON "rag_knowledge_bases"("bot_id");

CREATE INDEX IF NOT EXISTS "chatbot_conversations_organization_id_bot_id_updated_at_idx"
  ON "chatbot_conversations"("organization_id", "bot_id", "updated_at");

CREATE INDEX IF NOT EXISTS "chatbot_conversations_organization_id_bot_id_channel_channel_ref_idx"
  ON "chatbot_conversations"("organization_id", "bot_id", "channel", "channel_ref");
