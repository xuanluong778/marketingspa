-- Marketing SPA Pro pricing: 6m 5.500.000đ, 12m 8.500.000đ (savings 2.500.000đ)
UPDATE "subscription_plans"
SET
  "price_monthly" = 916667,
  "price_vnd" = 5500000
WHERE "code" = 'msp-pro-6m';

UPDATE "subscription_plans"
SET
  "price_monthly" = 708333,
  "price_vnd" = 8500000,
  "savings_amount" = 2500000
WHERE "code" = 'msp-pro-12m';
