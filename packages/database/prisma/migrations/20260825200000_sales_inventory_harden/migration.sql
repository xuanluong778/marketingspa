-- Harden sales inventory: non-negative stock, idempotent outbound/return, FEFO/alert indexes

-- Không cho tồn lô âm ở tầng DB
ALTER TABLE "sales_stock_batches"
  DROP CONSTRAINT IF EXISTS "sales_stock_batches_remaining_nonneg";
ALTER TABLE "sales_stock_batches"
  ADD CONSTRAINT "sales_stock_batches_remaining_nonneg"
  CHECK ("remaining_quantity" >= 0);

ALTER TABLE "sales_stock_batches"
  DROP CONSTRAINT IF EXISTS "sales_stock_batches_quantity_nonneg";
ALTER TABLE "sales_stock_batches"
  ADD CONSTRAINT "sales_stock_batches_quantity_nonneg"
  CHECK ("quantity" >= 0);

-- Idempotent: 1 OUTBOUND / (org, order, product)
CREATE UNIQUE INDEX IF NOT EXISTS "sales_stock_movements_sales_order_outbound_uidx"
ON "sales_stock_movements" ("organization_id", "reference_id", "product_id")
WHERE "type" = 'OUTBOUND'
  AND "reference_type" = 'SALES_ORDER'
  AND "reference_id" IS NOT NULL;

-- Idempotent: 1 RETURN_IN / outbound movement
CREATE UNIQUE INDEX IF NOT EXISTS "sales_stock_movements_return_of_uidx"
ON "sales_stock_movements" ("organization_id", "reference_id")
WHERE "type" = 'RETURN_IN'
  AND "reference_type" = 'RETURN_OF'
  AND "reference_id" IS NOT NULL;

-- FEFO lookup
CREATE INDEX IF NOT EXISTS "sales_stock_batches_organization_id_product_id_expiry_date_imported_at_idx"
ON "sales_stock_batches" ("organization_id", "product_id", "expiry_date", "imported_at");

-- Alert / stock scan
CREATE INDEX IF NOT EXISTS "sales_products_organization_id_stock_qty_min_stock_qty_idx"
ON "sales_products" ("organization_id", "stock_qty", "min_stock_qty");

-- Order export concurrency lookups
CREATE INDEX IF NOT EXISTS "sales_orders_organization_id_exported_at_idx"
ON "sales_orders" ("organization_id", "exported_at");

-- Movement history by org + reference
CREATE INDEX IF NOT EXISTS "sales_stock_movements_organization_id_reference_type_reference_id_idx"
ON "sales_stock_movements" ("organization_id", "reference_type", "reference_id");
