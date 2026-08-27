# WAVE 2 Report — Database / Redis / BullMQ / Load

**Date:** 2026-08-26  
**Release:** `/var/www/marketingaut_usr/data/releases/autopilot-homepage-20260824_192247`  
**Method:** step → verify → deploy (no architecture rewrite, no production data deletes)

## Gate summary

```text
DB_POOL = PASS
PGBOUNCER = PASS
QUERY_BOUNDS = PASS
INDEXES = PASS
REDIS = PASS
BULLMQ = PASS
LOAD_100 = PASS
LOAD_500 = PASS
E2E = PASS
WAVE_2 = PASS
```

## Root cause (pre-WAVE2)

1. **Connection exhaustion risk:** Prisma pools uncapped against Postgres `max_connections=100` (API + worker + scripts could storm).
2. **No PgBouncer** on the live path; first PgBouncer attempt used wrong Docker network (`172.17.0.1:5434` vs postgres on `marketingautoazcom_default` / `172.18.0.2`).
3. **Hot unbounded queries:** email audience preview, CRM/customer-360 includes, sales stock N+1, sales orders without take.
4. **Missing evidence-based indexes:** `role_permissions(permission_id)`, `auth_sessions(user_id, revoked_at)`.
5. **Redis:** `maxmemory=0` (unbounded); BullMQ defaults incomplete; messaging scheduled scan used `Date.now()` in `jobId` → duplicate enqueue risk.

## Fixes shipped

| Area | Change |
|------|--------|
| Prisma pool | `packages/database/src/prisma-url.ts` + apply in DB package / API PrismaService / worker |
| Ecosystem | `ecosystem.config.cjs` → `127.0.0.1:6432`, `pgbouncer=true`, `connection_limit` API=12 / worker=8 |
| PgBouncer | `docker-compose.pgbouncer.yml` on `marketingautoazcom_default` → `marketingspa-postgres-dev:5432` |
| Queries | customer-360 takes; email HARD_CAP/preview cap; sales orders take 5000; `stockBreakdownMany` |
| Indexes | `20260826_wave2_indexes` applied live |
| Redis | runtime `maxmemory 512mb` + `noeviction`; compose `command` for persistence on recreate |
| BullMQ | queue default attempts/backoff/removeOn*; stable `mc-plan-scheduled-${id}` jobId |

## Benchmark before → after

| Metric | Before (audit) | After |
|--------|----------------|-------|
| App DB URL | direct `:5434`, no `connection_limit` | PgBouncer `:6432`, limits 12/8 |
| Postgres backends (idle load) | ~16–27 mixed | ~4–13 via pgbouncer client `172.18.0.4` |
| Health LOAD 100 / 10s | n/a | **0% err**, p50 **78ms**, p95 **118ms**, p99 **183ms** |
| Health LOAD 500 / 10s | n/a | **0% err**, p50 **358ms**, p95 **446ms**, p99 **506ms** |
| Redis memory | ~98MB, maxmemory 0 | ~99MB / **512MB** cap |
| Queue wait/active | empty | empty (historical failed retained under removeOnFail policy) |

Load tests hit **localhost `127.0.0.1:4000` only** (not public HTTPS).

## Verification run

- `test-pgbouncer.cjs` → PASS (20 concurrent selects)
- `test-wave1-security.ts` → CREDIT_RACE + CORS/SSRF PASS
- `test-wave2-precheck.ts` → PASS
- `test-platform-admin-rbac.ts` → **8/8**
- Worker singleton: second start blocked (`singleton busy`)
- Typecheck database/worker/api → exit 0; build database/worker/api → OK
- PM2 `api` + `worker` restarted with pool URL; `pm2 save` done

## Capacity estimate (honest)

| Concurrent users | Assessment |
|------------------|------------|
| **100** | Comfortable on health + current pool (evidence PASS) |
| **500** | Health endpoint stable; authenticated CRM/email/ads paths will be tighter — OK for light traffic, watch p95 |
| **1000** | Provisional — need more API instances or higher PgBouncer `DEFAULT_POOL_SIZE` + read replicas before claiming |
| **5000** | Not supported on single API/worker/Postgres without horizontal scale |

## Remaining bottlenecks

1. Historical BullMQ **completed/failed** key growth (e.g. auto-post completed ~34k) — policy trims new jobs; optional offline prune later.
2. Backup cron still failing (code 2) — pre-existing, not WAVE2 scope.
3. PgBouncer healthcheck previously probed user `postgres` (noise); compose updated to use app user — recreate container to apply.
4. Redis `CONFIG REWRITE` unavailable (no config file); **compose `command`** persists maxmemory on container recreate.
5. Some list endpoints still org-scoped without hard caps beyond UI defaults — monitor as data grows.

## Files / config touched (release tree)

- `ecosystem.config.cjs`
- `docker-compose.pgbouncer.yml`
- `docker-compose.dev.yml`
- `packages/database/src/prisma-url.ts`, `packages/database/src/index.ts`
- `packages/database/prisma/migrations/20260826_wave2_indexes/migration.sql`
- `scripts/apply-wave2-indexes.cjs`, `scripts/test-pgbouncer.cjs`, `scripts/wave2-load-smoke.cjs`
- `apps/api/src/prisma/prisma.service.ts`
- `apps/api/src/queue/queue.module.ts`
- `apps/api/src/crm/customer-360.service.ts`
- `apps/api/src/email-marketing/email-marketing.service.ts`
- `apps/api/src/sales/reports.service.ts`, `apps/api/src/sales/inventory.service.ts`
- `apps/worker/src/index.ts`
- `apps/worker/src/processors/messaging-campaign-scheduled-scan.ts`
