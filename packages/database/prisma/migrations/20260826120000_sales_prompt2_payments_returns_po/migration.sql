-- Prompt 2 additive: payment, returns, supplier/PO, reconciliation audit, PARTIALLY_RETURNED

-- Enums
ALTER TYPE "SalesOrderStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_RETURNED';

DO $$ BEGIN
  CREATE TYPE "SalesPaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SalesPaymentKind" AS ENUM ('PAYMENT', 'REFUND');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SalesReturnDocStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SalesPurchaseOrderStatus" AS ENUM ('DRAFT', 'ORDERED', 'PARTIAL_RECEIVED', 'RECEIVED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SalesReconciliationStatus" AS ENUM ('APPLIED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- SalesOrder payment columns
ALTER TABLE "sales_orders"
  ADD COLUMN IF NOT EXISTS "payment_status" "SalesPaymentStatus" NOT NULL DEFAULT 'UNPAID',
  ADD COLUMN IF NOT EXISTS "amount_paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "payment_method" TEXT,
  ADD COLUMN IF NOT EXISTS "paid_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "transaction_ref" TEXT;

CREATE INDEX IF NOT EXISTS "sales_orders_organization_id_payment_status_idx"
  ON "sales_orders"("organization_id", "payment_status");

-- Order item returned qty
ALTER TABLE "sales_order_items"
  ADD COLUMN IF NOT EXISTS "returned_qty" INTEGER NOT NULL DEFAULT 0;

-- SalesPayment
CREATE TABLE IF NOT EXISTS "sales_payments" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "kind" "SalesPaymentKind" NOT NULL DEFAULT 'PAYMENT',
  "amount" DECIMAL(12,2) NOT NULL,
  "method" TEXT,
  "transaction_ref" TEXT,
  "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  "performed_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "sales_payments_organization_id_order_id_created_at_idx"
  ON "sales_payments"("organization_id", "order_id", "created_at");
CREATE INDEX IF NOT EXISTS "sales_payments_organization_id_paid_at_idx"
  ON "sales_payments"("organization_id", "paid_at");

ALTER TABLE "sales_payments" DROP CONSTRAINT IF EXISTS "sales_payments_organization_id_fkey";
ALTER TABLE "sales_payments"
  ADD CONSTRAINT "sales_payments_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_payments" DROP CONSTRAINT IF EXISTS "sales_payments_order_id_fkey";
ALTER TABLE "sales_payments"
  ADD CONSTRAINT "sales_payments_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SalesReturn
CREATE TABLE IF NOT EXISTS "sales_returns" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "status" "SalesReturnDocStatus" NOT NULL DEFAULT 'DRAFT',
  "reason" TEXT,
  "note" TEXT,
  "refund_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "processed_by_id" TEXT,
  "confirmed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sales_returns_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sales_returns_organization_id_code_key"
  ON "sales_returns"("organization_id", "code");
CREATE INDEX IF NOT EXISTS "sales_returns_organization_id_order_id_status_idx"
  ON "sales_returns"("organization_id", "order_id", "status");

ALTER TABLE "sales_returns" DROP CONSTRAINT IF EXISTS "sales_returns_organization_id_fkey";
ALTER TABLE "sales_returns"
  ADD CONSTRAINT "sales_returns_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_returns" DROP CONSTRAINT IF EXISTS "sales_returns_order_id_fkey";
ALTER TABLE "sales_returns"
  ADD CONSTRAINT "sales_returns_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "sales_return_items" (
  "id" TEXT NOT NULL,
  "return_id" TEXT NOT NULL,
  "order_item_id" TEXT NOT NULL,
  "product_id" TEXT,
  "quantity" INTEGER NOT NULL,
  "refund_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "reason" TEXT,
  CONSTRAINT "sales_return_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sales_return_items_return_id_order_item_id_key"
  ON "sales_return_items"("return_id", "order_item_id");
CREATE INDEX IF NOT EXISTS "sales_return_items_order_item_id_idx"
  ON "sales_return_items"("order_item_id");

ALTER TABLE "sales_return_items" DROP CONSTRAINT IF EXISTS "sales_return_items_return_id_fkey";
ALTER TABLE "sales_return_items"
  ADD CONSTRAINT "sales_return_items_return_id_fkey"
  FOREIGN KEY ("return_id") REFERENCES "sales_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_return_items" DROP CONSTRAINT IF EXISTS "sales_return_items_order_item_id_fkey";
ALTER TABLE "sales_return_items"
  ADD CONSTRAINT "sales_return_items_order_item_id_fkey"
  FOREIGN KEY ("order_item_id") REFERENCES "sales_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Supplier + PO
CREATE TABLE IF NOT EXISTS "sales_suppliers" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "tax_code" TEXT,
  "note" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sales_suppliers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "sales_suppliers_organization_id_name_idx"
  ON "sales_suppliers"("organization_id", "name");
CREATE INDEX IF NOT EXISTS "sales_suppliers_organization_id_is_active_idx"
  ON "sales_suppliers"("organization_id", "is_active");

ALTER TABLE "sales_suppliers" DROP CONSTRAINT IF EXISTS "sales_suppliers_organization_id_fkey";
ALTER TABLE "sales_suppliers"
  ADD CONSTRAINT "sales_suppliers_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "sales_purchase_orders" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "supplier_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "status" "SalesPurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "expected_date" TIMESTAMP(3),
  "note" TEXT,
  "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "created_by_id" TEXT,
  "ordered_at" TIMESTAMP(3),
  "received_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sales_purchase_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sales_purchase_orders_organization_id_code_key"
  ON "sales_purchase_orders"("organization_id", "code");
CREATE INDEX IF NOT EXISTS "sales_purchase_orders_organization_id_status_created_at_idx"
  ON "sales_purchase_orders"("organization_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "sales_purchase_orders_supplier_id_idx"
  ON "sales_purchase_orders"("supplier_id");

ALTER TABLE "sales_purchase_orders" DROP CONSTRAINT IF EXISTS "sales_purchase_orders_organization_id_fkey";
ALTER TABLE "sales_purchase_orders"
  ADD CONSTRAINT "sales_purchase_orders_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_purchase_orders" DROP CONSTRAINT IF EXISTS "sales_purchase_orders_supplier_id_fkey";
ALTER TABLE "sales_purchase_orders"
  ADD CONSTRAINT "sales_purchase_orders_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "sales_suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "sales_purchase_order_items" (
  "id" TEXT NOT NULL,
  "purchase_order_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "product_name" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "received_qty" INTEGER NOT NULL DEFAULT 0,
  "unit_cost" DECIMAL(12,2) NOT NULL,
  "line_total" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "sales_purchase_order_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sales_purchase_order_items_purchase_order_id_product_id_key"
  ON "sales_purchase_order_items"("purchase_order_id", "product_id");
CREATE INDEX IF NOT EXISTS "sales_purchase_order_items_product_id_idx"
  ON "sales_purchase_order_items"("product_id");

ALTER TABLE "sales_purchase_order_items" DROP CONSTRAINT IF EXISTS "sales_purchase_order_items_purchase_order_id_fkey";
ALTER TABLE "sales_purchase_order_items"
  ADD CONSTRAINT "sales_purchase_order_items_purchase_order_id_fkey"
  FOREIGN KEY ("purchase_order_id") REFERENCES "sales_purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_purchase_order_items" DROP CONSTRAINT IF EXISTS "sales_purchase_order_items_product_id_fkey";
ALTER TABLE "sales_purchase_order_items"
  ADD CONSTRAINT "sales_purchase_order_items_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "sales_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reconciliation audit
CREATE TABLE IF NOT EXISTS "sales_stock_reconciliations" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "status" "SalesReconciliationStatus" NOT NULL DEFAULT 'APPLIED',
  "reason" TEXT,
  "performed_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_stock_reconciliations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sales_stock_reconciliations_organization_id_code_key"
  ON "sales_stock_reconciliations"("organization_id", "code");
CREATE INDEX IF NOT EXISTS "sales_stock_reconciliations_organization_id_created_at_idx"
  ON "sales_stock_reconciliations"("organization_id", "created_at");

ALTER TABLE "sales_stock_reconciliations" DROP CONSTRAINT IF EXISTS "sales_stock_reconciliations_organization_id_fkey";
ALTER TABLE "sales_stock_reconciliations"
  ADD CONSTRAINT "sales_stock_reconciliations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "sales_stock_reconciliation_lines" (
  "id" TEXT NOT NULL,
  "reconciliation_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "before_qty" INTEGER NOT NULL,
  "expected_qty" INTEGER NOT NULL,
  "delta" INTEGER NOT NULL,
  "action" TEXT NOT NULL DEFAULT 'SYNC_STOCK_QTY_TO_BATCH_SUM',
  CONSTRAINT "sales_stock_reconciliation_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "sales_stock_reconciliation_lines_reconciliation_id_idx"
  ON "sales_stock_reconciliation_lines"("reconciliation_id");
CREATE INDEX IF NOT EXISTS "sales_stock_reconciliation_lines_product_id_idx"
  ON "sales_stock_reconciliation_lines"("product_id");

ALTER TABLE "sales_stock_reconciliation_lines" DROP CONSTRAINT IF EXISTS "sales_stock_reconciliation_lines_reconciliation_id_fkey";
ALTER TABLE "sales_stock_reconciliation_lines"
  ADD CONSTRAINT "sales_stock_reconciliation_lines_reconciliation_id_fkey"
  FOREIGN KEY ("reconciliation_id") REFERENCES "sales_stock_reconciliations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_stock_reconciliation_lines" DROP CONSTRAINT IF EXISTS "sales_stock_reconciliation_lines_product_id_fkey";
ALTER TABLE "sales_stock_reconciliation_lines"
  ADD CONSTRAINT "sales_stock_reconciliation_lines_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "sales_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
