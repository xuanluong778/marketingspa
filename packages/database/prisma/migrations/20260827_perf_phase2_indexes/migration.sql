-- Performance Phase 2: list/KPI indexes (additive only)
CREATE INDEX IF NOT EXISTS leads_organization_id_created_at_idx
  ON leads (organization_id, created_at);

CREATE INDEX IF NOT EXISTS leads_organization_id_pipeline_status_created_at_idx
  ON leads (organization_id, pipeline_status, created_at);

CREATE INDEX IF NOT EXISTS customers_organization_id_is_active_created_at_idx
  ON customers (organization_id, is_active, created_at);

CREATE INDEX IF NOT EXISTS payments_organization_id_status_paid_at_idx
  ON payments (organization_id, status, paid_at);

CREATE INDEX IF NOT EXISTS sales_products_organization_id_updated_at_idx
  ON sales_products (organization_id, updated_at);
