# Ads SaaS Full Audit Report

**Date:** 2026-07-24  
**Gate:** Do **not** deploy production unless security tests, migration, and build are green.

## Mandatory security / correctness checks

| # | Check | Result |
|---|--------|--------|
| 1 | Cross-org IDOR | **PASS** |
| 2 | RBAC `ads.*` | **PASS** |
| 3 | OAuth fake / expired / replay (Google + Meta) | **PASS** |
| 4 | Token not in API / log / Redis / BullMQ / FE | **PASS** |
| 5 | Job retry no duplicates | **PASS** |
| 6 | Concurrent sync same account (Redis NX lock) | **PASS** |
| 7 | Meta/Google metrics normalized | **PASS** |
| 8 | MCP no cross-org | **PASS** |
| 9 | Dashboard no provider API (MCP/DB only) | **PASS** |
| 10 | Google no paste refresh token | **PASS** |
| 11 | Meta no token in query string (Bearer only) | **PASS** |
| 12 | AdsAction safety (flags / no self-approve) | **PASS** |

**Suite:** `pnpm test:ads-saas-gate` → **9/9 suites, 12/12 audit checks PASS**

## Quality / infra gates

| Gate | Result | Notes |
|------|--------|--------|
| Prisma `validate` | **PASS** | via `with-root-env` |
| `pnpm db:generate` | **PASS** | |
| `pnpm db:migrate:deploy` (staging `127.0.0.1:5434`) | **PASS** | 24 migrations, none pending |
| Ads-scoped ESLint (api ads paths + shared `ads-*`) | **PASS** | Fixed unused imports / void expressions |
| `@marketingspa/database` lint | **PASS** | HRM prettier auto-fixed |
| `pnpm lint` (full turbo monorepo) | **FAIL** | Pre-existing prettier outside Ads (API messaging/meta-fanpage/rag; web CRM/content/hrm) — **not Ads regressions** |
| Shared / API / Worker build | **PASS** | |
| API `tsc --noEmit` | **PASS** | |
| Web `tsc --noEmit` | **PASS** | |
| Web `next build` | **PASS** | `/ads` included |

## Commands re-run

```bash
node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec prisma validate
pnpm db:generate
pnpm db:migrate:deploy
pnpm test:ads-saas-gate
pnpm --filter @marketingspa/api exec eslint "src/ads-mcp/**/*.ts" "src/ads-actions/**/*.ts" "src/ad-performance/**/*.ts" "src/ai-ads-manager/**/*.ts"
pnpm --filter @marketingspa/shared exec eslint "src/ads-*.ts"
pnpm --filter @marketingspa/shared build
pnpm --filter @marketingspa/api build
pnpm --filter @marketingspa/worker build
pnpm --filter @marketingspa/web exec tsc --noEmit
pnpm --filter @marketingspa/web build
```

## Verdict

| Question | Answer |
|----------|--------|
| Security tests | **PASS** — safe to treat Ads security gate as green |
| Migration staging | **PASS** |
| Ads + core builds / typecheck | **PASS** |
| Full monorepo `pnpm lint` | **FAIL** (pre-existing non-Ads prettier debt) |
| **Production deploy?** | **NO-GO** until full `pnpm lint` is cleaned **or** stakeholders explicitly accept Ads-scoped lint for this release |

Per product rule: do not deploy production if any **security test, migration, or build** has not passed — those three are currently green. Full-repo lint remains the open blocker for an unqualified “all gates green” release.
