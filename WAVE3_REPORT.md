# WAVE 3 Report — Backup / Recovery / Readiness / Monitoring

**Date:** 2026-08-26  
**Release:** `/var/www/marketingaut_usr/data/releases/autopilot-homepage-20260824_192247`  
**Constraint:** Wave 0–2 left intact (PgBouncer, pool limits, singleton, query bounds).

## Gate summary

```text
BACKUP_AUTOMATION = PASS
RESTORE_DRILL = PASS
READINESS = PASS
MONITORING = PASS
LOG_ROTATION = PASS
REDIS_ALERTING = PASS
QUEUE_RETENTION = PASS
WAVE_3 = PASS
```

## Root cause (pre-WAVE3)

1. Daily BullMQ backup job failed (exit 2): worker resolved `backup-postgres.sh` to `apps/scripts/…` (wrong root) and Prisma `DATABASE_URL` went through **PgBouncer :6432**, which `pg_dump` cannot use.
2. `/api/v1/health` mixed liveness + dependency checks and always returned 200.
3. No host cron, no restore drill, no 5xx/Redis/queue/disk alerts, no logrotate.
4. Redis `maxmemory 512mb` was runtime-only (`Cmd=["redis-server"]`); compose had the flags but the live container did not.
5. BullMQ completed history unbounded (auto-post tens of thousands).

## What changed

| Area | Change |
|------|--------|
| Backup | `scripts/backup-postgres.sh` dumps **direct Postgres** (docker exec, never :6432), retention 14d, second copy `postgres-offsite`, optional R2, `last-status.json`, alert log + webhook |
| Worker | Finds repo-root script; `BACKUP_DATABASE_URL` from original `.env` (not PgBouncer) |
| Cron | `/etc/cron.d/marketingautoaz-wave3` — dump 02:05, monitor */5, queue prune Sun 03:30 |
| Restore | `scripts/restore-postgres-drill.sh` → isolated `--network none` container `restore_drill` |
| Health | `/health` + `/api/v1/health` = process alive; `/ready` + `/api/v1/ready` = PG+Redis, **503** if down |
| Monitor | `scripts/ops-monitor.cjs` — 5xx, CPU/RAM/disk, PG conns, Redis %, BullMQ, PM2 restarts |
| Logs | `/etc/logrotate.d/marketingautoaz-pm2` + ecosystem `max_size/retain/compress`; exception filter redacts secrets |
| Redis | Recreated with **same volume**; `Cmd=["redis-server","--maxmemory","512mb","--maxmemory-policy","noeviction"]` |
| Queues | Shared `BULLMQ_JOB_RETENTION`; worker+API defaults; `bullmq-cleanup.cjs` completed/failed only |

## Test evidence

- **Backup:** `marketingspa_20260826_225820.dump` (1.5MB) in `/var/www/marketingaut_usr/data/backups/postgres` + offsite copy; `last-status.json` ok=true
- **Restore drill:** `{"ok":true,"orgs":36,"tables":218,"targetDb":"restore_drill"}` — production DB not touched; drill container removed
- **Ready:** HTTP 200 `checks.postgres=true redis=true worker=true`; health JSON is liveness-only `{status:ok}`
- **WAVE3 script:** 5/5 PASS (redact, retention consts, health, ready, backup file)
- **WAVE1:** CREDIT_RACE + CORS/SSRF PASS
- **RBAC:** platform-admin **8/8**
- **Monitor:** `ok=true ready=200 redisPct=4.1 pg=8 alerts=0`
- **Queue prune:** delayed jobs still 1 on auto-post + backup; completed trimmed to retention cap
- **API/worker build:** exit 0; PM2 api+worker online

## Files / config

- `scripts/backup-postgres.sh`, `scripts/restore-postgres-drill.sh`, `scripts/lib/pg-dump-env.cjs`
- `scripts/ops-monitor.cjs`, `scripts/bullmq-cleanup.cjs`, `scripts/test-wave3.ts`
- `scripts/logrotate-pm2.conf`, `scripts/install-wave3-cron.sh`
- `apps/api/src/health/*`, `apps/api/src/main.ts`, `apps/api/src/common/filters/http-exception.filter.ts`
- `apps/api/src/common/utils/redact-log.util.ts`, `apps/api/src/queue/queue.module.ts`
- `apps/worker/src/index.ts`, `apps/worker/src/processors/jobs.ts`
- `packages/shared/src/constants.ts` (`BULLMQ_JOB_RETENTION`, `REDIS_MEMORY_ALERT_PCT`)
- `ecosystem.config.cjs`, `docker-compose.dev.yml`, `docker-compose.yml`
- `.env` / `.env.example` — `BACKUP_DIR` absolute, retention 14
- Host: `/etc/cron.d/marketingautoaz-wave3`, `/etc/logrotate.d/marketingautoaz-pm2`

## Remaining risks

1. **No off-server object storage yet** — R2/S3 env unset; second copy is on the **same host** (`postgres-offsite`). Disk failure still loses both copies until `BACKUP_R2_*` is set.
2. **`ALERT_WEBHOOK_URL` unset** — failures go to `alerts.log` / ops JSON only; no Slack/pager until webhook is configured.
3. Redis recreate restored the old **worker singleton** key from RDB; cleared manually. Procedure: after Redis restore, `DEL marketingspa:worker:singleton` then start worker.
4. PM2 worker `restart_time=5` is from that singleton race, not an ongoing crash loop.
5. Historical BullMQ **completed** jobs were pruned (policy); delayed/active/wait were not.
