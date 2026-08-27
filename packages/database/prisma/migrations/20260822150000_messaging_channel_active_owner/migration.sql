-- Allow DISCONNECTED history in org A while org B holds ACTIVE connection for same OA.
-- Enforce at most one ACTIVE row per (channel, account_ref) globally.

DROP INDEX IF EXISTS "messaging_channel_connections_channel_account_ref_key";

CREATE UNIQUE INDEX "messaging_channel_connections_channel_account_ref_active_key"
ON "messaging_channel_connections" ("channel", "account_ref")
WHERE "status" = 'ACTIVE';
