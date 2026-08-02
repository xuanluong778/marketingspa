# P0 Security & Tenant Isolation Audit

**Date:** 2026-07-21  
**Scope:** MarketingSpa monorepo (`data/www`) — API, Web, Worker, Prisma  
**Status:** Hardening implemented (P0)

---

## Executive summary

This pass addresses cross-tenant IDOR risks, refresh-token exposure in `localStorage`, missing auth lifecycle flows, weak Socket.IO tenant binding, and inconsistent queue ownership checks. Backend enforcement is the source of truth; frontend permission helpers are additive only.

---

## Findings (before fix)

| Severity | Finding |
|----------|---------|
| **Critical** | Refresh tokens stored in `localStorage` and sent in JSON body — XSS could steal long-lived sessions |
| **Critical** | Socket.IO joined org rooms via client `query.organizationId` without JWT verification |
| **High** | Create/update paths accepted foreign keys (`branchId`, `customerId`, `leadId`, `adAccountId`, …) without org ownership checks |
| **High** | Chatbot Facebook page `upsert` on global `pageId` could rebind page across organizations |
| **High** | BullMQ jobs sometimes lacked `organizationId`; HRM attendance rebuild silently skipped when Redis down |
| **Medium** | No DB-backed session revocation / logout-all / password reset / email verify |
| **Medium** | CRM controllers lacked `PermissionsGuard` (only HRM had RBAC at controller level) |
| **Medium** | `TenantGuard` returned 403 on org spoof — leaks existence vs 404 policy |
| **Medium** | No request ID propagation; health check missing worker signal |
| **Low** | Login endpoints had no rate limiting |

---

## Changes implemented

### 1. Tenant ownership layer

- New [`TenantOwnershipService`](apps/api/src/common/services/tenant-ownership.service.ts) — validates branches, customers, leads, employees, services, funnel stages, ad accounts/campaigns, chatbot bots, RAG KB.
- Applied to: `customers`, `leads`, `appointments`, `finance`, `marketing`, `campaigns` create/update paths.
- [`TenantGuard`](apps/api/src/common/guards/tenant.guard.ts) now returns **404** on cross-tenant org spoof.

### 2. Auth & session (HttpOnly refresh)

- Prisma models: `AuthSession`, `AuthToken`, `LoginAttempt`; `User.emailVerifiedAt`.
- Migration: [`20260721100000_p0_security_auth`](packages/database/prisma/migrations/20260721100000_p0_security_auth/migration.sql)
- Refresh token in **HttpOnly cookie** (`ms_refresh_token`, path `/api/v1/auth`).
- DB-backed session rotation + revocation on logout / logout-all / password reset.
- New endpoints: `forgot-password`, `reset-password`, `verify-email`, `resend-verification`, `change-password`, `logout-all`.
- Login rate limit: 5 failures / 15 min per email (+ IP bucket).
- Web client: [`auth-storage.ts`](apps/web/src/lib/auth-storage.ts), [`api-client.ts`](apps/web/src/lib/api-client.ts) use `credentials: 'include'`; refresh token removed from JS storage.

### 3. RBAC

- `PermissionsGuard` + `@RequirePermissions` on **customers** and **leads** controllers.
- Frontend: `hasPermission()` helper in [`use-auth.ts`](apps/web/src/hooks/use-auth.ts) for UI gating (backend still enforces).

### 4. Queue & worker

- [`QueueEnqueueService`](apps/api/src/common/services/queue-enqueue.service.ts) — requires `organizationId`, fails with 503 if Redis unavailable (no inline fallback).
- HRM attendance rebuild, campaigns, auto-post scheduling use enqueue service.
- Worker heartbeat key `marketingspa:worker:heartbeat` for health checks.
- Job processors validate org ownership (`auto-post`, `automation-message`).

### 5. WebSocket

- [`EventsGateway`](apps/api/src/events/events.gateway.ts) requires JWT in `handshake.auth.token`; org room from token payload only.
- Web [`realtime-provider.tsx`](apps/web/src/providers/realtime-provider.tsx) sends access token via `auth`.

### 6. Observability

- Request ID middleware (`x-request-id`) in [`main.ts`](apps/api/src/main.ts).
- Audit log supports `requestId` field.
- Health: database + redis + **worker** heartbeat in [`health.controller.ts`](apps/api/src/health/health.controller.ts).

### 7. Chatbot cross-tenant fix

- Facebook page connect blocks upsert when `pageId` belongs to another organization (404).

---

## Files changed (primary)

| Area | Files |
|------|-------|
| Schema | `packages/database/prisma/schema.prisma`, migration `20260721100000_p0_security_auth` |
| Common | `common.module.ts`, `tenant-ownership.service.ts`, `queue-enqueue.service.ts`, `rate-limit.service.ts`, `tenant.guard.ts`, `request-id.middleware.ts` |
| Auth | `auth.service.ts`, `auth.controller.ts`, `auth.module.ts`, `auth-cookie.util.ts`, `auth-mail.service.ts`, `dto/auth-security.dto.ts` |
| Domain | `customers/*`, `leads/*`, `appointments/*`, `finance/*`, `marketing/*`, `campaigns/*`, `chatbot-cskh/*`, `hrm/hrm-attendance.service.ts`, `auto-post/*` |
| Realtime | `events.gateway.ts`, `events.module.ts` |
| Worker | `index.ts`, `processors/auto-post.ts`, `processors/jobs.ts` |
| Web | `auth-storage.ts`, `api-client.ts`, `use-auth.ts`, `types/api.ts`, `realtime-provider.tsx` |
| Tests | `scripts/test-p0-security.ts` |
| Docs | `docs/P0_SECURITY_TENANT_AUDIT.md` |

---

## Tests executed

```bash
# From data/www
pnpm db:generate
node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec prisma migrate deploy
node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec prisma validate
pnpm build
pnpm test:p0-security
pnpm test:hrm-attendance
pnpm test:hrm-leave
pnpm test:hrm-shifts
```

---

## Residual risks & follow-ups

| Risk | Notes |
|------|-------|
| Access token still in `localStorage` | Short TTL (15m default); moving to memory-only would need SSR/cookie strategy |
| Email delivery | Forgot-password / verify-email log links via `AuthMailService`; production needs SMTP/provider env |
| `HRM_PERMISSIONS_ENFORCE=false` | Shadow mode still bypasses permission guard when set — remove in production |
| Branch user-scope | Branch validated as org-owned FK, not per-user branch ACL (by design for this P0) |
| Rate limit | In-memory per process; multi-instance needs Redis-backed limiter |
| Appointments/finance RBAC | Controller-level permissions not yet added (tenant FK validation added) |
| Cookie `Secure` flag | Requires HTTPS in production (`COOKIE_SECURE=true`) |

---

## Deployment notes

1. Run migration before API restart.
2. Set `JWT_REFRESH_SECRET` (distinct from `JWT_SECRET`).
3. Production cookies: `NODE_ENV=production` or `COOKIE_SECURE=true`, optional `COOKIE_DOMAIN=.marketingautoaz.com`.
4. Ensure nginx forwards `/api/v1/auth/*` with cookies unchanged.
5. Restart worker so heartbeat + job validation apply.
