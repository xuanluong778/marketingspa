-- Email contact audience fields: source, tags, crm stage

ALTER TABLE "email_contacts" ADD COLUMN IF NOT EXISTS "source" TEXT;
ALTER TABLE "email_contacts" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "email_contacts" ADD COLUMN IF NOT EXISTS "crm_stage" TEXT;

CREATE INDEX IF NOT EXISTS "email_contacts_organization_id_source_idx" ON "email_contacts"("organization_id", "source");
CREATE INDEX IF NOT EXISTS "email_contacts_organization_id_crm_stage_idx" ON "email_contacts"("organization_id", "crm_stage");
