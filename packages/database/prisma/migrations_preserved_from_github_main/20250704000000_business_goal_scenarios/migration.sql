-- Business goal scenarios

CREATE TABLE IF NOT EXISTS "business_goal_scenarios" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "name" TEXT NOT NULL,
    "average_revenue_per_transaction" DECIMAL(14,2) NOT NULL,
    "current_transaction_count" INTEGER NOT NULL,
    "variable_cost_rate" DECIMAL(5,2) NOT NULL,
    "fixed_cost" DECIMAL(14,2) NOT NULL,
    "lead_conversion_rate" DECIMAL(5,2) NOT NULL,
    "target_profit" DECIMAL(14,2) NOT NULL,
    "calculated_revenue" DECIMAL(14,2) NOT NULL,
    "calculated_gross_profit" DECIMAL(14,2) NOT NULL,
    "calculated_net_profit" DECIMAL(14,2) NOT NULL,
    "break_even_transactions" INTEGER,
    "break_even_leads" INTEGER,
    "target_transactions" INTEGER,
    "target_leads" INTEGER,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_goal_scenarios_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "business_goal_scenarios_organization_id_created_at_idx"
    ON "business_goal_scenarios"("organization_id", "created_at");

CREATE INDEX IF NOT EXISTS "business_goal_scenarios_branch_id_idx"
    ON "business_goal_scenarios"("branch_id");

ALTER TABLE "business_goal_scenarios"
    ADD CONSTRAINT "business_goal_scenarios_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "business_goal_scenarios"
    ADD CONSTRAINT "business_goal_scenarios_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "business_goal_scenarios"
    ADD CONSTRAINT "business_goal_scenarios_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
