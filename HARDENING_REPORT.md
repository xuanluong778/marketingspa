# Final Hardening — Marketing Auto AZ

Date: 2026-08-27  
Release: `/var/www/marketingaut_usr/data/releases/autopilot-homepage-20260824_192247`

```text
OFFSITE_BACKUP = PASS
EXTERNAL_ALERTING = PASS
MULTER_SECURITY = PASS
API_MULTI_INSTANCE = PASS
SOCKET_SCALE = PASS
LOAD_100 = PASS
LOAD_500 = PASS
LOAD_1000 = PASS
REGRESSION = PASS
SAAS_READY = PASS
```

`SAAS_READY = PASS` because all four P1s passed and authenticated business load had **0% errors** at 100 / 500 / 1000 concurrent (no 5xx / timeouts). p95 at 500+ is slow — see remaining risks.

## 1. Offsite backup

- `pg_dump` still via docker exec on `marketingspa-postgres-dev` (never :6432).
- Dump encrypted AES-256-GCM (`MAAZ1` envelope) with key file `data/backups/.backup-key` mode `600`.
- Remote copy is **off this VPS**: encrypted attachment to the SMTP mailbox, retrieved over IMAP for restore.
- S3/R2 SigV4 uploader and SSH `scp` are wired; **R2/S3 keys and a second VPS were not present**, so live channel is SMTP/IMAP.
- Retention: `BACKUP_RETENTION_DAYS=14` (inside 14–30). IMAP purge + local `find -mtime`.
- Fail path: offsite upload failure marks backup fail and sends `BACKUP_FAIL` alert.
- Restore drill `--from-offsite`: isolated `--network none` container `restore_drill` (not production DB).

Evidence: `{"ok":true,"orgs":36,"tables":218,"dump":"marketingspa_20260827_100144.dump","targetDb":"restore_drill"}`

## 2. External alerting

- Channel live: **Email** (SMTP). Telegram/Slack webhook supported when env is set.
- Cooldown so `*/5` cron does not spam. PM2 restart alerts are **delta**, not lifetime counts.
- Payload is level/code/metric only — no tokens, passwords, or customer records.
- Test: `HARDENING_ALERT_TEST` → `{"ok":true,"channels":["email"]}`.

## 3. Multer High

- Direct pin + `pnpm.overrides`: `multer@2.2.0`.
- Runtime `require('multer')` from API = **2.2.0**. Nest `platform-express` resolves the same copy.
- `pnpm audit --prod`: **multer not listed**. Remaining High: `sharp` (Next), `deepmerge-ts` (Prisma) — not upload.
- No `audit fix --force`.
- Upload policy unchanged (MIME/ext/size/random name/path traversal/private vs public).
- Live upload e2e: HRM, KB, Email, Content, Work, Chatbot — evil `../.exe` → 400; no 500.

## 4. API multi-instance + load

| Item | Value |
| --- | --- |
| API | PM2 **cluster × 2**, `dist/main.js`, port 4000 |
| Worker | fork **× 1**, `WORKER_SINGLETON_GUARD=1` (Redis EXISTS=1) |
| Prisma per API | `connection_limit=6` via PgBouncer :6432 |
| Prisma worker | `connection_limit=8` |
| Total Prisma clients | 2×6 + 8 = **20** (matches PgBouncer `DEFAULT_POOL_SIZE=20`) |
| Socket.IO | `@socket.io/redis-adapter` enabled on both workers; nginx stays single upstream 4000 (no sticky needed) |
| Cron | none on API; worker remains singleton |

Socket evidence: two clients both received Redis-published `lead:new`.

Load was **localhost authenticated business paths**, not `/health` only: `/auth/me`, Overview (pipeline-counts, finance dashboard, stale leads), CRM customers/leads, Sales orders/products, Messaging campaigns. `/ai-ads-manager/dashboard` was not 2xx for the reviewer account so it was excluded from the hammer (connections/campaigns not mixed in).

| Conc. | req | err% | p50 | p95 | p99 | CPU load1 | RAM | PG conns | Redis | queue wait |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 100 / 10s | 1722 | 0 | 594ms | 793ms | 940ms | 0.48→2.4 | 16.8→17.2% | 12→18 | ~24M / 512M | 0 |
| 500 / 8s | 1636 | 0 | 2805ms | 3720ms | 4376ms | 2.29→4.31 | 17.2→18% | 18→19 | ~23M | 0 |
| 1000 / 6s | 1644 | 0 | 4846ms | 7266ms | 8026ms | 4.31→5.82 | 17.9→18.7% | 19 | ~23M | 0 |

After load: `/ready` 200, postgres/redis/worker true. API RSS ~500MB × 2 (heap grew under load; processes still online).

LOAD_500 / LOAD_1000 pass on **error rate**. They do **not** meet a sub-second p95 SLO.

## Regression

| Gate | Result |
| --- | --- |
| API typecheck/build (`nest build`) | PASS |
| WAVE1 CORS / SSRF / webhook HMAC / credit race N=40 | PASS |
| P0 tenant/security | PASS |
| Platform admin RBAC 8/8 | PASS |
| Upload unit + live e2e | PASS |
| Sales/inventory 23/23 | PASS |
| Worker singleton | PASS (1 fork, Redis lock) |
| Backup + restore from offsite | PASS |
| `/health` + `/ready` | PASS |
| Meta reviewer smoke | PASS |

## Files / config changed

- `scripts/backup-postgres.sh`, `scripts/restore-postgres-drill.sh`
- `scripts/lib/backup-crypto.cjs`, `s3-compat.cjs`, `backup-offsite-upload.cjs`, `backup-offsite-fetch.cjs`, `ops-mail.py`, `send-ops-alert.cjs`, `patch-hardening-env.cjs`
- `scripts/ops-monitor.cjs`
- `scripts/hardening-load-smoke.cjs`, `test-upload-security-e2e.cjs`, `test-socket-redis-adapter.cjs`
- `ecosystem.config.cjs` (API cluster 2, pools 6/8, worker fork 1)
- `apps/api/src/main.ts`, `apps/api/src/events/redis-io.adapter.ts`
- `apps/api/package.json`, root `package.json` + lockfile
- `.env.example`; `.env` keys added (no secret rotation): `ALERT_EMAIL_TO`, `BACKUP_ENCRYPTION_KEY_FILE`, `BACKUP_OFFSITE_REQUIRED`, `BACKUP_IMAP_HOST`, `SOCKET_REDIS_ADAPTER`

## Dependency changed

- `multer` `1.4.5-lts.1` → **`2.2.0`** (override)
- Added `@socket.io/redis-adapter` `^8.3.0`

## Remaining risks

1. **R2/S3 still unset.** Offsite is encrypted Gmail SMTP/IMAP (~20MB cap). Add `BACKUP_R2_*` before dumps grow; do not treat same-host `postgres-offsite/` as offsite.
2. **Telegram/Slack unused** until bot token / webhook is provided. Email works.
3. **p95 at 500–1000 concurrent is 3.7–7.3s** with 20 PG server connections. Raise API instances only together with PgBouncer `DEFAULT_POOL_SIZE` / Postgres `max_connections`.
4. Ads dashboard was not in the 2xx load mix for the reviewer user.
5. Unrelated audit High: Next `sharp`, Prisma `deepmerge-ts`.
6. API RSS ~500MB/instance after load — watch memory if clustering to 3+.
