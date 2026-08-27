-- Gift/paid plan creditGrant: 6 tháng 30.000, 12 tháng 75.000 (cấu hình DB, không hard-code UI)
UPDATE "subscription_plans"
SET "credit_grant" = 30000
WHERE "code" = 'msp-pro-6m';

UPDATE "subscription_plans"
SET "credit_grant" = 75000
WHERE "code" = 'msp-pro-12m';
