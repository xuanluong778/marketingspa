-- CreditPackage + optional planId on payment_orders (subscription XOR credit purchase)
CREATE TYPE "CreditPackageStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "credit_packages" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "credits" DECIMAL(12,2) NOT NULL,
  "price_vnd" DECIMAL(14,0) NOT NULL,
  "status" "CreditPackageStatus" NOT NULL DEFAULT 'ACTIVE',
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "credit_packages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "credit_packages_code_key" ON "credit_packages"("code");
CREATE INDEX "credit_packages_status_sort_order_idx" ON "credit_packages"("status", "sort_order");

INSERT INTO "credit_packages" ("id", "code", "name", "credits", "price_vnd", "status", "sort_order", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'credit-500',  'AI Credit 500',  500,   99000,  'ACTIVE', 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'credit-1500', 'AI Credit 1500', 1500,  249000, 'ACTIVE', 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'credit-5000', 'AI Credit 5000', 5000,  699000, 'ACTIVE', 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

ALTER TABLE "payment_orders"
  ALTER COLUMN "plan_id" DROP NOT NULL;

ALTER TABLE "payment_orders"
  ADD COLUMN IF NOT EXISTS "credit_package_id" TEXT;

ALTER TABLE "payment_orders"
  ADD CONSTRAINT "payment_orders_credit_package_id_fkey"
  FOREIGN KEY ("credit_package_id") REFERENCES "credit_packages"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "payment_orders_credit_package_id_idx"
  ON "payment_orders"("credit_package_id");

ALTER TABLE "payment_orders"
  ADD CONSTRAINT "payment_orders_plan_xor_credit_chk"
  CHECK (
    ("plan_id" IS NOT NULL AND "credit_package_id" IS NULL)
    OR ("plan_id" IS NULL AND "credit_package_id" IS NOT NULL)
  );
