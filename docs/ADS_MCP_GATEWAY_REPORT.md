# Internal Ads MCP Gateway

**Date:** 2026-07-24

## Mục tiêu

MCP nội bộ trong NestJS — **không** public Internet, **không** cho AI gọi Meta/Google API.

## Guardrails (mọi tool)

| Rule | Implementation |
|------|----------------|
| Tenant context từ backend | `tenantFromAuthUser` → `organizationId` từ JWT |
| RBAC | `ads.read` hoặc `ads.analyze` theo tool map |
| Query + orgId | Prisma / AdsNormalizedService luôn `where.organizationId` |
| Date / rows / timeout | max **90** ngày, **50** dòng, **5s** timeout |
| No secrets | `assertNoCredentialLeak` + mask `externalAccountId` |

## Tools

| Tool | Permission |
|------|------------|
| `ads.list_accounts` | ads.read |
| `ads.list_campaigns` | ads.read |
| `ads.get_metrics` | ads.read |
| `ads.get_trends` | ads.read |
| `ads.get_top_campaigns` | ads.analyze |
| `ads.get_poor_campaigns` | ads.analyze |
| `ads.detect_budget_waste` | ads.analyze |
| `ads.analyze_campaign` | ads.analyze |

Output phân tích: `adsAiAnalysisOutputSchema` (Zod) + `evidence[]` số liệu.

## Surface

- **Không** đăng ký HTTP controller public
- Inject: `AdsMcpGateway` qua `AdsMcpModule`
- Data: PostgreSQL only (`AdConnection`, `AdInsight`, `AdDailyStat`, …)

## ai-ads-manager

Đọc qua MCP:

- `getDashboard` → `getMetrics`
- `getConnections` → `listAccounts` (bỏ live Meta status)
- `getCampaigns` → `listCampaigns`
- `optimizeCampaign` → `analyzeCampaign` (structured + evidence)
- `generateDraft` → dùng metrics/waste evidence từ MCP trong prompt

## Paths

- `packages/shared/src/ads-mcp.ts`
- `apps/api/src/ads-mcp/`
- Test: `pnpm test:ads-mcp-gateway`
