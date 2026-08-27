-- Customer 360 SSOT — additive identities + transactional outbox + normalized contact fields.
-- Does NOT change Facebook OAuth / webhook / Auto Post tables.

CREATE TYPE "CustomerIdentityKind" AS ENUM ('EMAIL', 'PHONE', 'ZALO', 'FACEBOOK');
CREATE TYPE "CustomerOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "phone_normalized" TEXT,
  ADD COLUMN IF NOT EXISTS "email_normalized" TEXT;

CREATE INDEX IF NOT EXISTS "customers_organization_id_phone_normalized_idx"
  ON "customers"("organization_id", "phone_normalized");
CREATE INDEX IF NOT EXISTS "customers_organization_id_email_normalized_idx"
  ON "customers"("organization_id", "email_normalized");

-- Backfill normalized columns (VN phone: 84xxxxxxxxx → 0xxxxxxxxx). Never merge rows.
UPDATE "customers"
SET "email_normalized" = LOWER(TRIM("email"))
WHERE "email" IS NOT NULL AND TRIM("email") <> '' AND "email" LIKE '%@%';

UPDATE "customers"
SET "phone_normalized" = CASE
  WHEN regexp_replace("phone", '\D', '', 'g') LIKE '84%'
    AND length(regexp_replace("phone", '\D', '', 'g')) >= 11
    THEN '0' || substring(regexp_replace("phone", '\D', '', 'g') from 3)
  WHEN regexp_replace("phone", '\D', '', 'g') LIKE '0%'
    AND length(regexp_replace("phone", '\D', '', 'g')) >= 10
    THEN regexp_replace("phone", '\D', '', 'g')
  WHEN length(regexp_replace("phone", '\D', '', 'g')) BETWEEN 9 AND 11
    THEN CASE
      WHEN regexp_replace("phone", '\D', '', 'g') LIKE '0%' THEN regexp_replace("phone", '\D', '', 'g')
      ELSE '0' || regexp_replace("phone", '\D', '', 'g')
    END
  ELSE NULL
END
WHERE "phone" IS NOT NULL AND TRIM("phone") <> '';

CREATE TABLE IF NOT EXISTS "customer_identities" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "kind" "CustomerIdentityKind" NOT NULL,
  "value_normalized" TEXT NOT NULL,
  "value_raw" TEXT,
  "channel_account_ref" TEXT NOT NULL DEFAULT '',
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "verified_at" TIMESTAMP(3),
  "source" TEXT NOT NULL DEFAULT 'crm',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_identities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_identities_org_kind_value_ref_key"
  ON "customer_identities"("organization_id", "kind", "value_normalized", "channel_account_ref");
CREATE INDEX IF NOT EXISTS "customer_identities_organization_id_customer_id_idx"
  ON "customer_identities"("organization_id", "customer_id");
CREATE INDEX IF NOT EXISTS "customer_identities_organization_id_kind_value_normalized_idx"
  ON "customer_identities"("organization_id", "kind", "value_normalized");

ALTER TABLE "customer_identities"
  ADD CONSTRAINT "customer_identities_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_identities"
  ADD CONSTRAINT "customer_identities_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "customer_outbox_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "status" "CustomerOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "processed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_outbox_events_organization_id_idempotency_key_key"
  ON "customer_outbox_events"("organization_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "customer_outbox_events_status_created_at_idx"
  ON "customer_outbox_events"("status", "created_at");
CREATE INDEX IF NOT EXISTS "customer_outbox_events_organization_id_customer_id_created_at_idx"
  ON "customer_outbox_events"("organization_id", "customer_id", "created_at");

ALTER TABLE "customer_outbox_events"
  ADD CONSTRAINT "customer_outbox_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_outbox_events"
  ADD CONSTRAINT "customer_outbox_events_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Identity backfill: oldest active customer wins a value; others are NOT merged.
INSERT INTO "customer_identities" (
  "id", "organization_id", "customer_id", "kind", "value_normalized", "value_raw",
  "channel_account_ref", "is_primary", "source", "created_at", "updated_at"
)
SELECT gen_random_uuid()::text, s."organization_id", s."id", 'EMAIL'::"CustomerIdentityKind",
  s."email_normalized", s."email", '', true, 'backfill', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT ON ("organization_id", "email_normalized")
    "id", "organization_id", "email", "email_normalized"
  FROM "customers"
  WHERE "email_normalized" IS NOT NULL
    AND "is_active" = true
    AND "merged_into_id" IS NULL
  ORDER BY "organization_id", "email_normalized", "created_at" ASC
) s
ON CONFLICT ("organization_id", "kind", "value_normalized", "channel_account_ref") DO NOTHING;

INSERT INTO "customer_identities" (
  "id", "organization_id", "customer_id", "kind", "value_normalized", "value_raw",
  "channel_account_ref", "is_primary", "source", "created_at", "updated_at"
)
SELECT gen_random_uuid()::text, s."organization_id", s."id", 'PHONE'::"CustomerIdentityKind",
  s."phone_normalized", s."phone", '', true, 'backfill', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT ON ("organization_id", "phone_normalized")
    "id", "organization_id", "phone", "phone_normalized"
  FROM "customers"
  WHERE "phone_normalized" IS NOT NULL
    AND "is_active" = true
    AND "merged_into_id" IS NULL
  ORDER BY "organization_id", "phone_normalized", "created_at" ASC
) s
ON CONFLICT ("organization_id", "kind", "value_normalized", "channel_account_ref") DO NOTHING;

-- Additive Facebook/Zalo identities from already-linked messaging contacts (no auto-merge).
INSERT INTO "customer_identities" (
  "id", "organization_id", "customer_id", "kind", "value_normalized", "value_raw",
  "channel_account_ref", "is_primary", "verified_at", "source", "created_at", "updated_at"
)
SELECT gen_random_uuid()::text, m."organization_id", m."customer_id",
  CASE WHEN m."channel"::text = 'ZALO' THEN 'ZALO'::"CustomerIdentityKind"
       ELSE 'FACEBOOK'::"CustomerIdentityKind" END,
  m."external_user_id",
  m."external_user_id",
  COALESCE(NULLIF(split_part(m."integration_scope_key", ':', 2), ''), ''),
  false,
  m."phone_verified_at",
  'backfill_messaging',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "messaging_contact_identities" m
WHERE m."customer_id" IS NOT NULL
  AND m."merged_into_id" IS NULL
  AND m."channel" IN ('ZALO', 'MESSENGER')
ON CONFLICT ("organization_id", "kind", "value_normalized", "channel_account_ref") DO NOTHING;

-- EmailContact FK (additive). Clear orphans first — never invent links.
UPDATE "email_contacts" e
SET "customer_id" = NULL
WHERE e."customer_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "customers" c WHERE c."id" = e."customer_id");

CREATE INDEX IF NOT EXISTS "email_contacts_organization_id_customer_id_idx"
  ON "email_contacts"("organization_id", "customer_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_contacts_customer_id_fkey'
  ) THEN
    ALTER TABLE "email_contacts"
      ADD CONSTRAINT "email_contacts_customer_id_fkey"
      FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
