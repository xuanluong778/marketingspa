-- Assistant controlled writes: pending confirmation + staff_read_at for mark-read.

ALTER TABLE "chatbot_conversations" ADD COLUMN IF NOT EXISTS "staff_read_at" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "assistant_pending_actions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT,
    "request_id" VARCHAR(64) NOT NULL,
    "tool_name" VARCHAR(80) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PROPOSED',
    "confirm_secret_hash" VARCHAR(64) NOT NULL,
    "propose_idempotency_key" VARCHAR(120),
    "execute_idempotency_key" VARCHAR(120),
    "args_json" JSONB NOT NULL,
    "preview_json" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "executed_at" TIMESTAMP(3),
    "result_meta" JSONB,
    "error_code" VARCHAR(40),
    "error_message" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_pending_actions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "assistant_pending_actions_organization_id_user_id_propose_idemp_key"
  ON "assistant_pending_actions"("organization_id", "user_id", "propose_idempotency_key");

CREATE INDEX IF NOT EXISTS "assistant_pending_actions_organization_id_user_id_status_expires_at_idx"
  ON "assistant_pending_actions"("organization_id", "user_id", "status", "expires_at");

CREATE INDEX IF NOT EXISTS "assistant_pending_actions_confirm_secret_hash_idx"
  ON "assistant_pending_actions"("confirm_secret_hash");

CREATE INDEX IF NOT EXISTS "assistant_pending_actions_session_id_created_at_idx"
  ON "assistant_pending_actions"("session_id", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assistant_pending_actions_organization_id_fkey'
  ) THEN
    ALTER TABLE "assistant_pending_actions"
      ADD CONSTRAINT "assistant_pending_actions_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assistant_pending_actions_user_id_fkey'
  ) THEN
    ALTER TABLE "assistant_pending_actions"
      ADD CONSTRAINT "assistant_pending_actions_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assistant_pending_actions_session_id_fkey'
  ) THEN
    ALTER TABLE "assistant_pending_actions"
      ADD CONSTRAINT "assistant_pending_actions_session_id_fkey"
      FOREIGN KEY ("session_id") REFERENCES "assistant_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
