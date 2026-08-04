# Ads Normalized Metrics (Meta + Google)

**Date:** 2026-07-24

## Schema chung

`impressions, reach, clicks, spend, conversions, conversionValue, ctr, cpc, cpm, cpa, roas, currency, date`  
(+ `timezone`, `conversionActions[]`)

## Rules

| Rule | Implementation |
|------|----------------|
| Prisma Decimal tiền | `Decimal(18,6)` spend/conversionValue; ratios `Decimal(18,8)` nullable |
| Date theo timezone ad account | `AdAccount.timezone` + `formatDateInTimezone` / store `AdInsight.timezone` |
| Không chia 0 | `safeDivide` → `null` |
| Không làm tròn sớm | `normalizeAdsMetrics` / `decimalString` — không `Math.round` tiền |
| Conversion type rõ | `conversionActions: [{ type, count, value? }]` |
| Zod shared | `packages/shared/src/ads-metrics.ts` |
| API + organizationId | `adsMetricsQuerySchema` inject `user.organizationId` |
| Pagination + date validation | `page`/`pageSize` + `dateFrom <= dateTo` ≤ 366 ngày |
| No secrets | `assertNoCredentialLeak` trên response |

## Paths

| Layer | File |
|-------|------|
| Zod + math | `packages/shared/src/ads-metrics.ts` |
| Worker normalize | `apps/worker/src/lib/ads-metrics-normalize.ts` |
| API list/public | `apps/api/src/ad-performance/ads-normalized.service.ts` |
| Query validation | `AiAdsManagerService.getCampaigns` + `adsMetricsQuerySchema` |
| FE types | `apps/web/src/types/ai-ads-manager.ts` |

## Test

```bash
pnpm test:ads-normalized-metrics
```
