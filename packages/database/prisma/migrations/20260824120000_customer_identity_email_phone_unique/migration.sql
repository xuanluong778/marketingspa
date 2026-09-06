-- Harden CustomerIdentity uniqueness for EMAIL/PHONE.
-- channel_account_ref is already NOT NULL DEFAULT ''; Postgres NULL-unique bypass does not apply.
-- Residual risk: same EMAIL/PHONE value with different channel_account_ref would still pass
-- the 4-column unique. Block that with a partial unique + CHECK (EMAIL/PHONE ⇒ ref='').

UPDATE "customer_identities"
SET "channel_account_ref" = ''
WHERE "channel_account_ref" IS NULL;

UPDATE "customer_identities"
SET "channel_account_ref" = ''
WHERE "kind" IN ('EMAIL'::"CustomerIdentityKind", 'PHONE'::"CustomerIdentityKind")
  AND "channel_account_ref" <> '';

-- Fail migration loudly if duplicates already exist (should be empty in production).
DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT 1
    FROM "customer_identities"
    WHERE "kind" IN ('EMAIL'::"CustomerIdentityKind", 'PHONE'::"CustomerIdentityKind")
    GROUP BY "organization_id", "kind", "value_normalized"
    HAVING COUNT(*) > 1
  ) d;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'customer_identities EMAIL/PHONE duplicates exist (% groups) — resolve before unique index', dup_count;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "customer_identities_email_phone_org_value_uidx"
  ON "customer_identities" ("organization_id", "kind", "value_normalized")
  WHERE "kind" IN ('EMAIL'::"CustomerIdentityKind", 'PHONE'::"CustomerIdentityKind");

ALTER TABLE "customer_identities"
  DROP CONSTRAINT IF EXISTS "customer_identities_email_phone_ref_empty_chk";

ALTER TABLE "customer_identities"
  ADD CONSTRAINT "customer_identities_email_phone_ref_empty_chk"
  CHECK (
    "kind" NOT IN ('EMAIL'::"CustomerIdentityKind", 'PHONE'::"CustomerIdentityKind")
    OR "channel_account_ref" = ''
  );
