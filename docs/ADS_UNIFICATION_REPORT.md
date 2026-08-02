# Ads Unification — Báo cáo

**Ngày:** 2026-07-23  
**Mục tiêu:** Hợp nhất `ad-performance` + `ai-ads-manager` + `integrations` quanh **AdConnection** org-scoped.

---

## Kiến trúc sau hợp nhất

```
Integrations (UI status) ──facade──► AdConnectionFacade ──► AdConnection (DB)
                                              ▲
/ads AI Manager ── đọc metric ──► AdsNormalizedService │
         │                         ▲                    │
         │ sync/pause ─────────────┼── FacebookAdsService
         └── không decrypt token   │         │
                                   │    Meta Graph (Bearer)
                                   │
                         materialize snapshots → AdInsight
```

| Module | Vai trò |
|--------|---------|
| **ad-performance** | Account, campaign snapshot, sync Meta, materialize metric, **token duy nhất** qua `AdConnectionFacade` |
| **ai-ads-manager** | Chỉ đọc `AdsNormalizedService` / dashboard / automation / AI draft; sync ủy quyền ad-performance; pause qua `setCampaignActive` |
| **integrations** | Hiển thị trạng thái Ads từ facade; **không** lưu/đọc credential Ads |

---

## File mới / sửa chính

**Mới**
- `apps/api/src/ad-performance/ad-connection.facade.ts`
- `apps/api/src/ad-performance/ads-normalized.service.ts`
- `scripts/test-ads-unification.ts`
- `docs/ADS_UNIFICATION_REPORT.md`

**Sửa**
- `facebook-ads.module.ts` / `facebook-ads.service.ts` — inject facade + materialize sau sync; `setCampaignActive`
- `ai-ads-manager.service.ts` — bỏ MetaGraph, mock Google, decrypt; đọc normalized
- `integrations.service.ts` + `integrations.module.ts` — Ads facade
- `marketing/connectors/connector.registry.ts` — chặn mock META/GOOGLE
- `integrations/dto/integration.dto.ts` — field Ads rỗng (deprecated)

**Không** tạo Nest module `ads` mới. **Không** Google Ads API mới.

---

## Deprecated / tắt

| Luồng | Trạng thái |
|-------|------------|
| `MetaAdsConnector` / `GoogleAdsConnector` mock | Deprecated; `createConnector` ném lỗi nếu gọi |
| Google `syncGoogle` mock campaigns (`g-demo-*`) | Xóa; `syncGoogleStub` trả message deprecated |
| Integration `encryptedCredentials` cho META/GOOGLE | Không đọc; connect/test/disconnect Ads bị chặn hoặc facade |
| `FacebookAdsConnection.encryptedAccessToken` | Đã drop từ Phase A |

---

## Tương thích dữ liệu cũ

- Giữ `FacebookAdsCampaignSnapshot` + materialize → `AdInsight` / `AdManagerCampaign` (adapter)
- Token Meta vẫn trong `AdConnection` (Phase A migration)
- AI Manager đọc `AdInsight` theo `organizationId` — dữ liệu sync cũ vẫn dùng được sau materialize lần sync tiếp theo

---

## Test

```bash
pnpm test:ads-unification   # PASS
pnpm --filter @marketingspa/api build  # PASS
```

Kiểm chứng: không module AI/Integrations Ads đọc token từ kho cũ; decrypt Ads chỉ trong `AdConnectionFacade` (ad-performance).

---

## Rollback

Checkout các file `ad-performance`, `ai-ads-manager`, `integrations`, `marketing/connectors` từ `backup/pre-ads-saas-wip-20260723` hoặc commit trước unification. DB schema AdConnection không đổi ở bước này.
