-- CreateEnum
CREATE TYPE "SalesStockMovementType" AS ENUM ('INBOUND', 'OUTBOUND', 'ADJUST', 'RETURN_IN');

-- CreateTable
CREATE TABLE "sales_product_categories" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_product_categories_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "sales_products" ADD COLUMN IF NOT EXISTS "barcode" TEXT;
ALTER TABLE "sales_products" ADD COLUMN IF NOT EXISTS "category_id" TEXT;
ALTER TABLE "sales_products" ADD COLUMN IF NOT EXISTS "min_stock_qty" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "sales_stock_batches" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "batch_code" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "remaining_quantity" INTEGER NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiry_date" DATE,
    "unit_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_stock_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_stock_movements" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "type" "SalesStockMovementType" NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,
    "note" TEXT,
    "performed_by_id" TEXT,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_stock_movement_lines" (
    "id" TEXT NOT NULL,
    "movement_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "sales_stock_movement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_product_categories_organization_id_idx" ON "sales_product_categories"("organization_id");
CREATE UNIQUE INDEX "sales_product_categories_organization_id_name_key" ON "sales_product_categories"("organization_id", "name");

CREATE UNIQUE INDEX "sales_products_organization_id_barcode_key" ON "sales_products"("organization_id", "barcode");
CREATE INDEX "sales_products_category_id_idx" ON "sales_products"("category_id");

CREATE UNIQUE INDEX "sales_stock_batches_organization_id_product_id_batch_code_key" ON "sales_stock_batches"("organization_id", "product_id", "batch_code");
CREATE INDEX "sales_stock_batches_organization_id_product_id_expiry_date_idx" ON "sales_stock_batches"("organization_id", "product_id", "expiry_date");
CREATE INDEX "sales_stock_batches_product_id_remaining_quantity_idx" ON "sales_stock_batches"("product_id", "remaining_quantity");

CREATE INDEX "sales_stock_movements_organization_id_created_at_idx" ON "sales_stock_movements"("organization_id", "created_at");
CREATE INDEX "sales_stock_movements_organization_id_type_idx" ON "sales_stock_movements"("organization_id", "type");
CREATE INDEX "sales_stock_movements_product_id_created_at_idx" ON "sales_stock_movements"("product_id", "created_at");
CREATE INDEX "sales_stock_movements_reference_type_reference_id_idx" ON "sales_stock_movements"("reference_type", "reference_id");

CREATE INDEX "sales_stock_movement_lines_movement_id_idx" ON "sales_stock_movement_lines"("movement_id");
CREATE INDEX "sales_stock_movement_lines_batch_id_idx" ON "sales_stock_movement_lines"("batch_id");

-- AddForeignKey
ALTER TABLE "sales_product_categories" ADD CONSTRAINT "sales_product_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sales_products" ADD CONSTRAINT "sales_products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "sales_product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sales_stock_batches" ADD CONSTRAINT "sales_stock_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_stock_batches" ADD CONSTRAINT "sales_stock_batches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "sales_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sales_stock_movements" ADD CONSTRAINT "sales_stock_movements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_stock_movements" ADD CONSTRAINT "sales_stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "sales_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sales_stock_movement_lines" ADD CONSTRAINT "sales_stock_movement_lines_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "sales_stock_movements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_stock_movement_lines" ADD CONSTRAINT "sales_stock_movement_lines_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "sales_stock_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: opening batches for existing positive stock
INSERT INTO "sales_stock_batches" (
  "id", "organization_id", "product_id", "batch_code", "quantity", "remaining_quantity",
  "imported_at", "expiry_date", "unit_cost", "created_at", "updated_at"
)
SELECT
  md5(random()::text || clock_timestamp()::text || p."id"),
  p."organization_id",
  p."id",
  'OPENING-' || substr(replace(p."id", '-', ''), 1, 8),
  p."stock_qty",
  p."stock_qty",
  NOW(),
  NULL,
  p."cost_price",
  NOW(),
  NOW()
FROM "sales_products" p
WHERE p."stock_qty" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "sales_stock_batches" b WHERE b."product_id" = p."id"
  );
