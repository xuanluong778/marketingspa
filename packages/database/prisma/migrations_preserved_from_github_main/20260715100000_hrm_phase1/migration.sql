-- HRM Phase 1: employee profile fields, departments, contracts, documents, account invites

CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'PROBATION');
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'PROBATION', 'ON_LEAVE', 'TERMINATED');
CREATE TYPE "HrmDocumentType" AS ENUM ('CONTRACT', 'ID_CARD', 'CERTIFICATE', 'OTHER');
CREATE TYPE "EmploymentContractType" AS ENUM ('PROBATION', 'FIXED', 'INDEFINITE');
CREATE TYPE "EmploymentContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED');

CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "parent_id" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "employees"
    ADD COLUMN IF NOT EXISTS "department_id" TEXT,
    ADD COLUMN IF NOT EXISTS "manager_id" TEXT,
    ADD COLUMN IF NOT EXISTS "code" TEXT,
    ADD COLUMN IF NOT EXISTS "employment_type" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    ADD COLUMN IF NOT EXISTS "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN IF NOT EXISTS "avatar_url" TEXT,
    ADD COLUMN IF NOT EXISTS "date_of_birth" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "legal_id_number" TEXT,
    ADD COLUMN IF NOT EXISTS "address" TEXT,
    ADD COLUMN IF NOT EXISTS "start_date" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "end_date" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "metadata" JSONB;

UPDATE "employees" SET "start_date" = "hired_at" WHERE "start_date" IS NULL AND "hired_at" IS NOT NULL;
UPDATE "employees" SET "status" = 'TERMINATED' WHERE "is_active" = false;

CREATE TABLE "employment_contracts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "employee_id" TEXT NOT NULL,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "contract_type" "EmploymentContractType" NOT NULL DEFAULT 'FIXED',
    "status" "EmploymentContractStatus" NOT NULL DEFAULT 'DRAFT',
    "salary_base" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "signed_at" TIMESTAMP(3),
    "file_url" TEXT,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "previous_contract_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "employment_contracts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employee_documents" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "employee_id" TEXT NOT NULL,
    "type" "HrmDocumentType" NOT NULL DEFAULT 'OTHER',
    "title" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_key" TEXT,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "issued_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "uploaded_by_id" TEXT,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employee_account_invites" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "employee_account_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "departments_organization_id_code_key" ON "departments"("organization_id", "code");
CREATE INDEX "departments_organization_id_idx" ON "departments"("organization_id");
CREATE INDEX "departments_branch_id_idx" ON "departments"("branch_id");

CREATE UNIQUE INDEX "employees_organization_id_code_key" ON "employees"("organization_id", "code");
CREATE INDEX "employees_department_id_idx" ON "employees"("department_id");
CREATE INDEX "employees_organization_id_status_idx" ON "employees"("organization_id", "status");

CREATE INDEX "employment_contracts_organization_id_employee_id_idx" ON "employment_contracts"("organization_id", "employee_id");
CREATE INDEX "employment_contracts_employee_id_status_idx" ON "employment_contracts"("employee_id", "status");

CREATE INDEX "employee_documents_organization_id_employee_id_idx" ON "employee_documents"("organization_id", "employee_id");
CREATE INDEX "employee_documents_employee_id_type_idx" ON "employee_documents"("employee_id", "type");

CREATE INDEX "employee_account_invites_organization_id_employee_id_idx" ON "employee_account_invites"("organization_id", "employee_id");
CREATE INDEX "employee_account_invites_token_hash_idx" ON "employee_account_invites"("token_hash");

ALTER TABLE "departments" ADD CONSTRAINT "departments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "departments" ADD CONSTRAINT "departments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "departments" ADD CONSTRAINT "departments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "employment_contracts" ADD CONSTRAINT "employment_contracts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employment_contracts" ADD CONSTRAINT "employment_contracts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employment_contracts" ADD CONSTRAINT "employment_contracts_previous_contract_id_fkey" FOREIGN KEY ("previous_contract_id") REFERENCES "employment_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employment_contracts" ADD CONSTRAINT "employment_contracts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "employee_account_invites" ADD CONSTRAINT "employee_account_invites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_account_invites" ADD CONSTRAINT "employee_account_invites_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_account_invites" ADD CONSTRAINT "employee_account_invites_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_account_invites" ADD CONSTRAINT "employee_account_invites_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
