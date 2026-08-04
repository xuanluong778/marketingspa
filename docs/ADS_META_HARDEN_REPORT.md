# Meta Ads Harden (ad-performance)

**Date:** 2026-07-23  
**Scope:** Chuẩn hóa Meta Ads hiện có — không tạo OAuth thứ hai, không dùng Fanpage env token.

## Đáp ứng yêu cầu

| Yêu cầu | Cách làm |
|--------|----------|
| Tái sử dụng `FacebookAdsService` + OAuth | `ai-ads-manager` → `getOAuthStartUrl`; callback `/ad-performance/facebook/oauth/*` |
| Token → Authorization header | `MetaGraphApiService` + worker `meta-graph-ads` Bearer only |
| Connection org-scoped | `AdConnection` `@@unique([organizationId, provider])` |
| RBAC `ads.connect` / `ads.sync` | Controller Facebook Ads + AI Ads Manager |
| Decrypt ngay trước Meta | Facade / worker decode trước fetch; queue không có token |
| Pagination | `getAllPages` / `metaGetAllPages` theo `paging.next` |
| Rate limit + Retry-After | `MetaRateLimitError` → BullMQ `moveToDelayed` |
| Token expired / permission | Cập nhật `TOKEN_EXPIRED` / `NO_AD_ACCOUNT_ACCESS` |
| Sync account → campaign → ad set → ad + daily | Worker upsert `AdAccount`/`AdCampaign`/`AdSet`/`AdCreative`/`AdDailyStat` |
| Không Fanpage env | Ads paths không đọc `META_PAGE_*` |
| Không OAuth Meta thứ hai (Ads) | Giữ OAuth duy nhất trong ad-performance |

## Files

- `apps/api/.../meta-graph-api.service.ts` — harden errors + pagination
- `apps/worker/src/lib/meta-graph-ads.ts` — Graph client đầy đủ
- `apps/worker/src/lib/ads-hierarchy-persist.ts` — persist hierarchy + daily
- `apps/worker/src/processors/ads-sync.ts` — sync mở rộng
- `scripts/test-ads-meta-harden.ts`

## Test

```bash
pnpm test:ads-meta-harden
pnpm test:ads-sync-queue
pnpm test:ads-unification
```
