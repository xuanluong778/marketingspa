-- Stocktake + SKU/barcode blank normalize + stockQty physical backfill

CREATE TYPE "SalesStocktakeStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

CREATE TABLE "sales_stocktakes" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "SalesStocktakeStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "performed_by_id" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "confirmed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_stocktakes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales_stocktake_lines" (
    "id" TEXT NOT NULL,
    "stocktake_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "system_qty" INTEGER NOT NULL,
    "counted_qty" INTEGER NOT NULL,
    "variance" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,

    CONSTRAINT "sales_stocktake_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sales_stocktakes_organization_id_code_key" ON "sales_stocktakes"("organization_id", "code");
CREATE INDEX "sales_stocktakes_organization_id_status_created_at_idx" ON "sales_stocktakes"("organization_id", "status", "created_at");

CREATE UNIQUE INDEX "sales_stocktake_lines_stocktake_id_product_id_key" ON "sales_stocktake_lines"("stocktake_id", "product_id");
CREATE INDEX "sales_stocktake_lines_product_id_idx" ON "sales_stocktake_lines"("product_id");

ALTER TABLE "sales_stocktakes" ADD CONSTRAINT "sales_stocktakes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_stocktake_lines" ADD CONSTRAINT "sales_stocktake_lines_stocktake_id_fkey" FOREIGN KEY ("stocktake_id") REFERENCES "sales_stocktakes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_stocktake_lines" ADD CONSTRAINT "sales_stocktake_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "sales_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Normalize blank SKU/barcode → NULL (unique allows multiple NULLs)
UPDATE "sales_products" SET "sku" = NULL WHERE "sku" IS NOT NULL AND btrim("sku") = '';
UPDATE "sales_products" SET "barcode" = NULL WHERE "barcode" IS NOT NULL AND btrim("barcode") = '';

-- Backfill stockQty = SUM(remaining) including expired
UPDATE "sales_products" p
SET "stock_qty" = COALESCE((
  SELECT SUM(b."remaining_quantity")
  FROM "sales_stock_batches" b
  WHERE b."product_id" = p."id"
    AND b."organization_id" = p."organization_id"
    AND b."remaining_quantity" > 0
), 0);
