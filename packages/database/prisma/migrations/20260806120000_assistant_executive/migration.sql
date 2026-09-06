-- AI Assistant / Trợ lý điều hành — sessions, messages, audit (tách chatbot_*)

CREATE TABLE IF NOT EXISTS "assistant_sessions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" VARCHAR(200),
    "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "assistant_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "assistant_sessions_organization_id_user_id_updated_at_idx"
  ON "assistant_sessions"("organization_id", "user_id", "updated_at");

CREATE INDEX IF NOT EXISTS "assistant_sessions_organization_id_status_updated_at_idx"
  ON "assistant_sessions"("organization_id", "status", "updated_at");

CREATE TABLE IF NOT EXISTS "assistant_messages" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" VARCHAR(16) NOT NULL,
    "content" TEXT NOT NULL,
    "tool_name" VARCHAR(80),
    "tool_call_id" VARCHAR(80),
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "assistant_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "assistant_messages_session_id_created_at_idx"
  ON "assistant_messages"("session_id", "created_at");

CREATE INDEX IF NOT EXISTS "assistant_messages_organization_id_session_id_created_at_idx"
  ON "assistant_messages"("organization_id", "session_id", "created_at");

CREATE TABLE IF NOT EXISTS "assistant_audit_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT,
    "request_id" VARCHAR(64) NOT NULL,
    "tool_name" VARCHAR(80),
    "action" VARCHAR(40) NOT NULL,
    "ok" BOOLEAN,
    "error_code" VARCHAR(40),
    "duration_ms" INTEGER,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "assistant_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "assistant_audit_logs_organization_id_created_at_idx"
  ON "assistant_audit_logs"("organization_id", "created_at");

CREATE INDEX IF NOT EXISTS "assistant_audit_logs_organization_id_user_id_created_at_idx"
  ON "assistant_audit_logs"("organization_id", "user_id", "created_at");

CREATE INDEX IF NOT EXISTS "assistant_audit_logs_request_id_idx"
  ON "assistant_audit_logs"("request_id");

CREATE INDEX IF NOT EXISTS "assistant_audit_logs_session_id_created_at_idx"
  ON "assistant_audit_logs"("session_id", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assistant_sessions_organization_id_fkey'
  ) THEN
    ALTER TABLE "assistant_sessions"
      ADD CONSTRAINT "assistant_sessions_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assistant_sessions_user_id_fkey'
  ) THEN
    ALTER TABLE "assistant_sessions"
      ADD CONSTRAINT "assistant_sessions_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assistant_messages_organization_id_fkey'
  ) THEN
    ALTER TABLE "assistant_messages"
      ADD CONSTRAINT "assistant_messages_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assistant_messages_session_id_fkey'
  ) THEN
    ALTER TABLE "assistant_messages"
      ADD CONSTRAINT "assistant_messages_session_id_fkey"
      FOREIGN KEY ("session_id") REFERENCES "assistant_sessions"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assistant_messages_user_id_fkey'
  ) THEN
    ALTER TABLE "assistant_messages"
      ADD CONSTRAINT "assistant_messages_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assistant_audit_logs_organization_id_fkey'
  ) THEN
    ALTER TABLE "assistant_audit_logs"
      ADD CONSTRAINT "assistant_audit_logs_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assistant_audit_logs_user_id_fkey'
  ) THEN
    ALTER TABLE "assistant_audit_logs"
      ADD CONSTRAINT "assistant_audit_logs_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assistant_audit_logs_session_id_fkey'
  ) THEN
    ALTER TABLE "assistant_audit_logs"
      ADD CONSTRAINT "assistant_audit_logs_session_id_fkey"
      FOREIGN KEY ("session_id") REFERENCES "assistant_sessions"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
