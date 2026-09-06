-- Inbox list / unread summary: order by last_user_message_at
CREATE INDEX IF NOT EXISTS "chatbot_conversations_organization_id_last_user_message_at_idx"
  ON "chatbot_conversations"("organization_id", "last_user_message_at");

-- Unread COUNT join on direction + created_at
CREATE INDEX IF NOT EXISTS "chatbot_messages_conversation_id_direction_created_at_idx"
  ON "chatbot_messages"("conversation_id", "direction", "created_at");
