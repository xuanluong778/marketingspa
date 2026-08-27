# WAVE 5 Report — Responsive + Final SaaS Readiness

**Date:** 2026-08-27  
**Release:** `/var/www/marketingaut_usr/data/releases/autopilot-homepage-20260824_192247`  
**Constraint:** theme/design tokens unchanged; load test localhost only (not public HTTPS).

## Gate summary

```text
RESPONSIVE_MOBILE = PASS
RESPONSIVE_TABLET = PASS
RESPONSIVE_DESKTOP = PASS
SECURITY = PASS
TENANT_ISOLATION = PASS
DATABASE_SCALE = PASS
QUEUE_SCALE = PASS
BACKUP_RECOVERY = PASS
FRONTEND_SPEED = PASS
LOAD_100 = PASS
LOAD_500 = PASS
LOAD_1000 = PASS
SAAS_READY = FAIL
```

`SAAS_READY` stays **FAIL** because P1 production risks remain (off-host backup, no HA, nested upload CVE). No P0 hole found in auth/tenant/credit/RBAC in this regression.

## Responsive (real Playwright Chromium)

Viewports **360 / 390 / 768 / 1024 / 1440**. Routes: Overview, CRM hub, Leads/Kanban, Ads, Messaging hub, Messages inbox, Sales hub, Sales orders, HRM hub, HRM attendance, Funnel.

**55/55 pages: 0 horizontal overflow, 0 header overflow** (`scripts/wave5-viewport-audit.cjs`).

Fixes (same palette `#0A3D30` / `#F97316`):

| Area | Change |
|------|--------|
| Header | Hide plan chips below `md`; credit compact on xs; 44px menu/avatar/messages |
| Sidebar | 44px submenu chevron; sheet `min(18rem, 85vw)` |
| Dialog/Sheet | `max-h` + scroll; dialog `calc(100vw-1.5rem)`; 44px close on mobile |
| Tabs | Wrap + `min-h-10` (Ads 6 tabs no longer clip) |
| Tables | `overflow-x-auto` + `max-w-full`; wide sales tables already wrapped |
| Forms | Inbox/CRM filters `w-full min-w-0` on 360 |
| Kanban | Intentional column scroll; 44px card menu on mobile |
| Main | `min-w-0 overflow-x-hidden`; `html/body overflow-x: clip` |

## Regression

| Gate | Evidence |
|------|----------|
| Auth/JWT + credit concurrency | WAVE1 CREDIT_RACE 40× same key → 1 txn |
| SSRF / CORS / webhook HMAC | WAVE1 4/4 |
| Tenant isolation | `test-p0-security` PASS; sales e2e tenant PASS |
| RBAC | Platform admin 8/8; sales RBAC PASS |
| Billing/credit | SePay 10/10 (replay, concurrent txid, fake 401) |
| Sales/inventory | 23/23 e2e (oversell, FEFO, return, PO) |
| Uploads | WAVE2 precheck MIME/ext/signed-url PASS |
| Automation security | PASS |
| DB/PgBouncer | 20 concurrent selects, 36 orgs; pg_stat_activity=12 under load |
| Backup/restore | WAVE3 ready + `last-status.json` dump `marketingspa_20260827_020501.dump` |
| Readiness | `/health` liveness; `/ready` postgres+redis+worker |
| Queue | Worker singleton Redis key EXISTS=1; auto-post wait=0 during load |
| Frontend build | `next build` 15.5.21 exit 0 |

Stale static check `test-ads-sync-queue.ts` looks for `sync-jobs` on the old Facebook controller; live routes are on `ai-ads-manager` (`GET sync-jobs`). Not a runtime outage.

## Load (localhost `GET /api/v1/health`, 8s)

| VUs | n | err | p50 | p95 | p99 | PG | Redis | RAM |
|-----|---|-----|-----|-----|-----|----|-------|-----|
| **100** | 11402 | **0%** | 66 ms | **102 ms** | 125 ms | 12 | 24M/512M | ~21% |
| **500** | 13213 | **0%** | 297 ms | **362 ms** | 449 ms | 12 | 24M/512M | ~21% |
| **1000** | 13638 | **0%** | 597 ms | **672 ms** | 1097 ms | 12 | 24M/512M | ~21.5% |

After 1000: `/ready` still 200. Queues did not back up. This is **health**, not authenticated CRM/Ads dashboard mix.

## Capacity estimate

| Concurrent users | Verdict |
|------------------|---------|
| **100** | Comfortable (health p95 ~100 ms; WAVE4 app JS still heavy) |
| **500** | OK for health/light API; watch authenticated p95 |
| **1000** | Health holds (p95 ~670 ms); mixed app traffic will feel slow on **one** Node API |
| **5000** | **Not ready** — single `api`/`web`/`worker`, Prisma+PgBouncer caps (12+8), no horizontal scale |

## TOP remaining risks (why SAAS_READY = FAIL)

1. **P1 data:** Postgres dump + offsite copy are on the **same host**; `BACKUP_R2_*` unset. Disk/host loss = both copies.
2. **P1 ops:** `ALERT_WEBHOOK_URL` unset — no pager. Single PM2 processes, no multi-instance HA.
3. **P1 nested CVE:** `multer` 1.x High via Nest uploads (major 2.x not taken). `sharp` / Prisma `deepmerge-ts` High left by WAVE4 policy.
4. **P2 UX:** App shell still ~2.1 MB uncompressed JS (`/leads` `/settings` First Load ~580 kB). WAVE4 did not shrink login JS.
5. **P2 ads sync test file** is outdated vs `ai-ads-manager` routes — fix the test or it will keep failing CI if wired.

## Files

- Layout/shell: `topbar.tsx`, `app-shell.tsx`, `sidebar.tsx`, `header-credit-chip.tsx`, `messages-header-icon.tsx`
- Primitives: `dialog.tsx`, `sheet.tsx`, `tabs.tsx`, `table.tsx`, `dropdown-menu.tsx`, `page-header.tsx`
- Pages: Ads tabs, chatbot filters, CRM filters, overview grid, sales reports, kanban, `globals.css`
- `scripts/wave5-viewport-audit.cjs`, `scripts/wave5-load-smoke.cjs`
