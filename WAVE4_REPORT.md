# WAVE 4 Report — Web speed + dependency audit

**Date:** 2026-08-26  
**Release:** `/var/www/marketingaut_usr/data/releases/autopilot-homepage-20260824_192247`  
**Constraint:** no business-logic / primary UI change; no `pnpm audit fix --force`; no untested major upgrades.

## Gate summary

```text
BUNDLE = PASS
API_WATERFALL = PASS
REACT_QUERY = PASS
LAZY_LOADING = PASS
CORE_WEB_VITALS = PASS
DEPENDENCIES = PASS
E2E = PASS
WAVE_4 = PASS
```

## Before (live Next on :3002, previous build)

| Metric | Value |
|--------|--------|
| `/login` initial JS (uncompressed, 15 files) | **751,048 B (~733 KB)** |
| `/` initial JS | 724,903 B |
| `/login` HTML TTFB (first sample) | 24 ms |
| `pnpm audit --prod` | 33 vulns: 1 low / 16 moderate / **16 high** / 0 critical |

Authenticated route JS was not measured before rebuild (same host, old `.next` overwritten). Route-level **First Load JS** below is from the WAVE4 `next build` table (Next 15.5.21).

## After (WAVE4 build deployed)

| Metric | Value |
|--------|--------|
| `/login` initial JS (uncompressed, 16 files) | **751,680 B (~734 KB)** (~+0.6 KB, flat) |
| `/login` gzip-6 estimate | 237,497 B |
| `/login` HTML TTFB (warm, n=5) | 6.8–13.6 ms (p50 ~9 ms) |
| App HTML TTFB (unauth shell) | Overview 14 ms, CRM 27 ms, Ads 18 ms, Messaging 18 ms, Sales 12 ms, Autopilot 13 ms |
| `pnpm audit --prod` | 12 vulns: 1 low / 5 moderate / **6 high** / 0 critical |

Next.js **First Load JS** (build table, includes shared 104 kB):

| Route | Page size | First Load JS | Note |
|-------|-----------|---------------|------|
| `/overview` | 11.6 kB | **189 kB** | funnel counts collapsed to 1 API |
| `/crm` | 6.62 kB | **190 kB** | hub scope, no finance/ad-expenses |
| `/ads` | 4.79 kB | **167 kB** | manager + Google builder lazy |
| `/messaging` | 2.83 kB | **178 kB** | hub only, no extra list |
| `/sales` | 8.33 kB | **192 kB** | dropped orders list on hub |
| `/marketing-autopilot` | 17.1 kB | **225 kB** | analysis/history dynamic |
| `/funnel` | 14.5 kB | **237 kB** | xyflow/create/analytics deferred |
| `/login` | 1.12 kB | **189 kB** | shared runtime; not the WAVE4 hotspot |

Uncompressed **app layout** HTML still preloads ~2.1 MB JS (gzip ~650 kB) because `(app)` shell + i18n dictionaries + Radix stay client-side. That is the remaining First Paint cost, not the Ads/Funnel editors (those are extra chunks).

## What changed (evidence)

### Bundle / lazy

- `next/dynamic` + tab mount: Ads manager, Google campaign builder, Google autopilot, Funnel create/analytics/journey (xyflow), Autopilot analysis/history.
- `AssistantWidget` no longer in the critical path: dynamic `ssr:false` + idle defer (`requestIdleCallback` / 1.5s fallback).
- Route `loading.tsx` under `(app)`.
- `optimizePackageImports`: `lucide-react`, `date-fns`, Radix dialog/select.
- Inter `display: 'swap'` (CSS contains `font-display:swap`).
- `images.formats`: avif/webp (BrandLogo already `next/image`).

### API waterfall / selective payload

- New `GET /leads/pipeline-counts` — one Prisma `groupBy` instead of **5×** `/leads?pipelineStatus=&pageSize=1`.
- Overview uses `finance.dashboard.adSpend` instead of listing 100 advertising expenses.
- CRM hub `useDashboardData('hub')`: **4** queries (was 10). Overview: **5** (was 10).
- Sales hub badge from report KPIs — no `useSalesOrders` list.
- Ads: rules / logs / drafts / email-reports fetch **only on that tab**.
- Autopilot: projects/filters/detail already `enabled` by tab (kept).

`GET /leads/pipeline-counts` without token → **401** (route is live and guarded). Authenticated body not smoked here (no minted JWT in this pass).

### React Query

- Defaults: `staleTime` 60s, `gcTime` 10m, `refetchOnWindowFocus: false`, `refetchOnReconnect: false`.
- Credits: stale 60s, interval **120s** (was 5s / 30s).
- Chatbot inbox: interval 60s, no window-focus refetch.
- Ads dashboard `staleTime` 60s.
- Funnel recommendations: 60s stale, no window-focus (was 5s + focus).

### Lists

Leads/customers/sales already paginated (20–50). Ads campaigns `pageSize=50`. No unbounded table added. HRM attendance/shifts still request 100–200 rows (out of WAVE4 primary routes).

### `'use client'`

Most app pages stay client because they use React Query / router. Unused client work removed: no-op `RealtimeNotifications`; heavy widgets deferred instead of converting working pages to RSC (would risk UI).

## Dependencies (no `--force`, no untested majors)

**Patched (pnpm.overrides + `next@15.5.21`):**

| Package | From → to | Why safe |
|---------|-----------|----------|
| `next` | 15.5.19 → **15.5.21** | already on 15.5 line; High DoS/SSRF |
| `lodash` | 4.17.x → **4.18.1** | same major |
| `nanoid@3` | &lt;3.3.18 → **3.3.18** | patch |
| `socket.io-parser` | 4.2.6 → **4.2.7** | patch |
| `postcss@8` | ≤8.5.17 → **8.5.26** | patch |
| `qs` | ≤6.15.1 → **6.15.2** | patch (moderate, prod) |

**Left on purpose (major or Nest nested, needs regression):**

- `multer` 1.x via `@nestjs/platform-express` (major 2.x)
- `sharp` &lt;0.35 (major)
- `deepmerge-ts` &lt;8 via Prisma (major)
- `body-parser` 1.20.4 (low; nested under Nest 10)

High count **16 → 6** (multer×3 + sharp + deepmerge-ts). Critical **0**.

## Tests

- Lint changed web files: **exit 0** (1 pre-existing `exhaustive-deps` warning on ads `useEffect`)
- API `tsc --noEmit`: **exit 0**
- API `nest build`: **exit 0**
- Web `next build` (15.5.21): **exit 0**
- WAVE1 security: **4/4 PASS**
- Platform-admin RBAC: **8/8 PASS**
- WAVE3: **5/5 PASS**
- `/health` 200 liveness; `/ready` 200 postgres+redis+worker

## Routes still slow

1. **`/leads` First Load 583 kB** — kanban + drawers still in the page graph.
2. **`/credits`, `/pricing` ~534 kB** — billing/QR chunk.
3. **`/settings` 583 kB** — integrations surface.
4. **`/funnel/preview/[id]` 544 kB and public `/f/[id]` 514 kB** — remaining xyflow/preview.
5. **App shell ~2.1 MB uncompressed** on every `(app)` HTML — i18n `en.ts`/`vi.ts` + Radix + sidebar. Assistant is *not* in that preload list after defer.
6. **Ads first tab** still loads dashboard + connections + campaigns + settings (needed for the default campaigns view).
7. **Field LCP / INP / CLS** — no Chrome/Lighthouse on this host. Lab: TTFB, `font-display:swap`, smaller Ads/Funnel/Autopilot entry chunks.

## Files

- `apps/api/src/leads/leads.controller.ts`, `leads.service.ts` — `pipeline-counts`
- `apps/web/src/hooks/use-dashboard.ts`, `use-credit.ts`, `use-chatbot-cskh.ts`, `use-ai-ads-manager.ts`, `use-funnel-builder.ts`
- `apps/web/src/providers/app-providers.tsx`
- `apps/web/src/components/layout/app-shell.tsx`
- `apps/web/src/app/(app)/{crm,sales,ads,funnel,marketing-autopilot}/page.tsx`, `loading.tsx`
- `apps/web/src/components/ai-ads-manager/ai-ads-manager-page.tsx`
- `apps/web/src/app/layout.tsx`, `next.config.js`
- root `package.json` `pnpm.overrides`; `apps/web/package.json` `next@15.5.21`
- `scripts/wave4-web-measure.cjs`
