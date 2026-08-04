# SaaS production readiness audit — MarketingAutoAZ

**Date:** 2026-08-03  
**Branch:** `audit/saas-production-readiness`  
**Rollback tag:** `audit/saas-production-readiness-rollback` (`788e2bcc5245d989eea962421b4fa2e409cebd21`)  
**Deploy:** **NONE** — live PM2 API (`pid 634554`) / web (`pid 637080`), DB, Redis, uploads, `.env`, Nginx **not restarted / not mutated**

---

## Final verdict: **NO-GO** (canary not recommended)

Blocking for GO / canary:

1. **`facebook-policy` remains compile stubs** (source unrecoverable on this host) — returns `null`; `test:facebook-policy` cannot PASS.
2. **Multiple production UI surfaces are `StubPage` / `return null`** (CRM leads chrome, HRM leave/OT dialogs, OTP form, admin user detail, etc.).
3. **Google Ads API controller/service empty** (`url: ''`).
4. **Audit fixes are on branch only** — not applied to live `dist` (intentional; no deploy).
5. Heavy AI / `publishNow` still synchronous on API (queue migration deferred to avoid API contract change).

Read-path load (100 VU / 2 min) and builds PASS; treat as evidence of baseline capacity, **not** full SaaS readiness.

---

## PASS / FAIL gates

| Gate | Result |
|------|--------|
| Branch + rollback; no prod deploy | **PASS** |
| Live PM2 / DB / Redis / `.env` / Nginx untouched | **PASS** (same PIDs) |
| Prisma validate | **PASS** |
| API build (`nest build`) | **PASS** |
| Worker `tsc --noEmit` | **PASS** |
| Web `next build` | **PASS** |
| Health + meta-reviewer smoke | **PASS** |
| Load 100 VU / 2 min, error &lt; 0.5% | **PASS** (0% errors) |
| Load 100 VU / 15 min, error &lt; 0.5% | **PASS** (errorRate 0.111%) |
| Tenant isolation (known P0 IDOR fixed in branch) | **PARTIAL** (CRM fixed in source; live still old until deploy) |
| `facebook-policy` not stub | **FAIL** |
| No StubPage in critical UX | **FAIL** |
| Messaging workers registered | **PASS in branch** (not live until worker restart) |
| Propose canary | **NO** |

---

## Issues by severity

### P0 (blocking)

| ID | Issue | Status |
|----|-------|--------|
| P0-1 | CRM funnel stage / assignment-rule update by id without `organizationId` (IDOR) | **Fixed in branch** `c5a37b2` |
| P0-2 | Lead claim accepts foreign `employeeId` | **Fixed in branch** `c5a37b2` |
| P0-3 | Messenger/Zalo webhook signature missing → forgeable / fail-open | **Fixed in branch** `91d0a69` |
| P0-4 | Messaging (+ offline-conversion) BullMQ workers never started | **Fixed in branch** `85aba56` |
| P0-5 | `facebook-policy` full engine missing (stubs only) | **Open — unrecoverable** |
| P0-6 | Stubbed CRM/HRM/OTP/admin UI mounted in app | **Open** |
| P0-7 | Google Ads OAuth/API empty | **Open** |

### P1

| ID | Issue | Status |
|----|-------|--------|
| P1-1 | ADS_SYNC BullMQ `lockDuration` too short vs 300s timeout | **Fixed** `85aba56` |
| P1-2 | Video transcription `jobId` used `Date.now()` (broke idempotency) | **Fixed** `85aba56` |
| P1-3 | DATABASE_URL no `connection_limit` (live `.env` untouched) | **Documented** in `.env.example` only |
| P1-4 | OpenAI / publishNow / chatbot AI inline on HTTP | **Open** (contract-sensitive) |
| P1-5 | RBAC missing on finance/CRM/billing/content many routes | **Open** |
| P1-6 | Simulated automation / offline conversion SENT semantics | **Open** |
| P1-7 | Unbounded `findMany` (customer 360, attribution, FB ads list, …) | **Open** |
| P1-8 | Missing compound indexes (`AutoPost` org+status, …) | **Open** (additive migration later) |

### P2

| ID | Issue | Status |
|----|-------|--------|
| P2-1 | `as any` in 3 API files | Open |
| P2-2 | Sentry placeholder | Open |
| P2-3 | Mock Zalo/SMS/Email connectors | Open |
| P2-4 | Chatbot `allowedDomains` empty = open | Open |
| P2-5 | Facebook Ads OAuth state not one-time DB consume | Open |

---

## Files changed (this audit)

| Commit | Scope | Files |
|--------|-------|-------|
| `c5a37b2` | P0 tenant | `crm/pipeline.service.ts`, `crm/lead-assignment.service.ts`, `docs/.../ROLLBACK.md` |
| `91d0a69` | P0 webhooks | `messaging-provider.registry.ts`, `messaging-webhook-ingress.service.ts` |
| `85aba56` | P0/P1 worker | `apps/worker/src/index.ts`, `video-transcription.service.ts`, `.env.example` |
| *(report commit)* | docs/scripts | `docs/saas-production-readiness/*`, `scripts/load-test-saas-readiness.cjs` |

**Not changed:** live `.env`, PM2 ecosystem running processes, Nginx, Redis data, Postgres data, uploads.

---

## Build / test evidence

```text
prisma validate → schema valid
@marketingspa/api build → exit 0
@marketingspa/worker tsc --noEmit → exit 0
@marketingspa/web build → exit 0
GET /api/v1/health → 200 { database:true, redis:true, worker:true }
meta-reviewer:smoke → ALL_PASS
```

---

## Load metrics (100 VU)

### 2 minutes (complete)

| Metric | Value |
|--------|-------|
| Requests | 31,706 |
| Errors | 0 (0%) |
| p50 / p95 / p99 | 371 / 519 / 592 ms |
| max | 3200 ms |
| Host RAM avail | ~6.7 GB / 12 GB |
| loadavg end | 5.19 / 2.78 / 1.64 |
| est. established PG+Redis sockets (sample) | ~219 |
| Gate error &lt; 0.5% | **PASS** |

File: `docs/saas-production-readiness/load-test-metrics.json`

### 15 minutes (complete)

| Metric | Value |
|--------|-------|
| Requests | 248,169 |
| OK / fail | 247,893 / 276 |
| errorRate | **0.1112%** (&lt; 0.5% gate) |
| p50 / p95 / p99 | 358 / 471 / 520 ms |
| max | 4309 ms |
| Gate | **PASS** |

File: `docs/saas-production-readiness/load-test-metrics-15m.json`

Live API PID unchanged after load (`634554`). Health still 200.
---

## Rollback

```bash
cd /var/www/marketingaut_usr/data/www/marketingautoaz.com
git checkout audit/saas-production-readiness-rollback
# or reset this branch only:
# git reset --hard audit/saas-production-readiness-rollback
```

Live runtime was never switched to these commits — rollback of **process** is N/A; rollback of **git** restores pre-audit SHA `788e2bc`.

Per-commit revert if needed:

```bash
git revert 85aba56   # worker
git revert 91d0a69   # webhooks
git revert c5a37b2   # CRM tenant
```

---

## Path to GO / canary

1. Restore **facebook-policy** from an external developer backup; `pnpm test:facebook-policy` PASS.
2. Restore StubPage UIs (leads/HRM/OTP/admin) or hide routes.
3. Implement or hide Google Ads connect.
4. Deploy **API + worker** from this branch (canary org allowlist) after staging soak — apply CRM/webhook/worker fixes.
5. Add Prisma `connection_limit` via controlled `.env` change + PgBouncer plan.
6. Complete **100 VU / 15 min** with `gates.pass`, capture DB `pg_stat_activity`, Redis clients, BullMQ lag.
7. Queue AI/publishNow behind BullMQ with non-breaking job+poll contract (separate PR).
8. Only then propose canary.

---

## Conclusion

# **NO-GO**

Branch hardens real P0 tenant + webhook + worker registration issues without touching production runtime. SaaS canary is **not** justified while `facebook-policy` is stubbed, critical UI stubs remain, and fixes are undeployed.
