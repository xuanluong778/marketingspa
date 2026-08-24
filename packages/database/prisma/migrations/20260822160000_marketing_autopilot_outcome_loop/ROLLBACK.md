# Rollback: marketing_autopilot_outcome_loop

## Before deploy (Production)

1. `pg_dump -Fc $DATABASE_URL > backup_pre_outcome_loop_$(date +%Y%m%d).dump`
2. Verify backup: `pg_restore -l backup_pre_outcome_loop_*.dump | head`

## Deploy

```bash
pnpm --filter @marketingspa/database exec prisma migrate deploy
```

## Rollback SQL (additive-only — safe to run if feature disabled)

Run only if Outcome Loop must be reverted without restoring full backup:

```sql
DROP TABLE IF EXISTS "marketing_autopilot_outcome_mutation_locks" CASCADE;
DROP TABLE IF EXISTS "marketing_autopilot_stop_loss_events" CASCADE;
DROP TABLE IF EXISTS "marketing_autopilot_optimization_proposals" CASCADE;
DROP TABLE IF EXISTS "marketing_autopilot_outcome_loops" CASCADE;
ALTER TABLE "marketing_autopilot_outcome_tracks" DROP COLUMN IF EXISTS "mission_id";
ALTER TABLE "marketing_autopilot_guardrails" DROP COLUMN IF EXISTS "autopilot_mode";
ALTER TABLE "marketing_autopilot_guardrails" DROP COLUMN IF EXISTS "full_autopilot_enabled";
-- Enum values STALE/DIAGNOSIS cannot be removed in PostgreSQL without recreate — leave in place.
```

## Full restore

```bash
pg_restore -c -d $DATABASE_URL backup_pre_outcome_loop_*.dump
```
