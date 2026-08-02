# Ads SaaS Phase A — Báo cáo triển khai

**Ngày:** 2026-07-23  
**Phạm vi:** Org-scope, RBAC `ads.*`, credential duy nhất, harden token — **không** tích hợp API provider mới.  
**Backup trước đó:** `backup/pre-ads-saas-20260723`, `backup/pre-ads-saas-wip-20260723`

---

## Kết quả kiểm thử

| Hạng mục | Kết quả |
|----------|---------|
| `prisma validate` | **PASS** |
| `prisma generate` | **PASS** |
| `prisma migrate deploy` (`20260723100000_ads_saas_phase_a_org_scoped`) | **PASS** (đã apply) |
| `pnpm test:ads-saas-phase-a` | **PASS** (RBAC, token leak, cross-org 404, PermissionsGuard, Meta header, no Google paste, AdConnection) |
| `pnpm --filter @marketingspa/api build` | **PASS** |

---

## Migration

**File:** `packages/database/prisma/migrations/20260723100000_ads_saas_phase_a_org_scoped/migration.sql`

**Việc đã làm:**
1. Backfill `organization_id` cho `facebook_ads_sync_logs` / `facebook_ads_campaign_snapshots`
2. Giữ **1** `facebook_ads_connections` mới nhất / org
3. Copy ciphertext Meta → `ad_connections` (provider `META`) — **không mất token**
4. Dedup `ad_connections` theo `(organization_id, provider)`
5. Đổi `facebook_ads_connections` thành metadata org-scoped (`connected_by_user_id`), **drop** `encrypted_access_token`
6. Unique `ad_connections (organization_id, provider)`
7. Clear `integrations.encrypted_credentials` cho `META_ADS` / `GOOGLE_ADS`

**Rollback DB:** restore từ backup trước migrate; hoặc checkout branch backup + reverse SQL thủ công (không có down migration tự động).

---

## File đã sửa / thêm

### API
- `apps/api/src/common/guards/permissions.guard.ts` — bỏ soft-bypass `HRM_PERMISSIONS_ENFORCE`
- `apps/api/src/common/constants/roles.ts` — `ADS_PERMISSION_DEFS` + map MARKETING/SALE
- `apps/api/src/ad-performance/facebook-ads/meta-graph-api.service.ts` — Bearer header, không query user token
- `apps/api/src/ad-performance/facebook-ads/facebook-ads.service.ts` — org JWT, `AdConnection` credential, audit, 404
- `apps/api/src/ad-performance/facebook-ads/facebook-ads.controller.ts` — `ads.*` + OAuth callback không JWT
- `apps/api/src/ai-ads-manager/ai-ads-manager.service.ts` — org queries; reject Google paste; Meta qua FacebookAdsService
- `apps/api/src/ai-ads-manager/ai-ads-manager.controller.ts` — PermissionsGuard + `ads.*`
- `apps/api/src/ai-ads-manager/dto/ai-ads-manager.dto.ts` — `ConnectGoogleDto` không bắt buộc refreshToken
- `apps/api/src/integrations/integrations.service.ts` — từ chối connect META_ADS/GOOGLE_ADS

### Database / seed
- `packages/database/prisma/schema.prisma` — org-scoped Facebook + AdConnection unique
- `packages/database/prisma/migrations/20260723100000_ads_saas_phase_a_org_scoped/`
- `packages/database/prisma/seed.ts` — seed `ads.*`

### Web
- `apps/web/src/components/ai-ads-manager/ai-ads-manager-page.tsx` — bỏ form paste Google
- `apps/web/src/hooks/use-ai-ads-manager.ts`
- `apps/web/src/hooks/use-integrations.ts` — Ads fields rỗng
- `apps/web/src/components/settings/integrations-panel.tsx` — redirect `/ads`

### Tests / docs
- `scripts/test-ads-saas-phase-a.ts`
- `package.json` — script `test:ads-saas-phase-a`
- `docs/ADS_SAAS_PHASE_A_REPORT.md` (file này)

**Không tạo** module Nest `ads` mới.

---

## Tuân thủ yêu cầu Phase A

| Yêu cầu | Trạng thái |
|---------|------------|
| Connection org-scoped | ✅ `AdConnection` + `FacebookAdsConnection` theo `organizationId` |
| org/user chỉ từ JWT | ✅ Controllers dùng `@CurrentUser()`; OAuth state HMAC + re-check user∈org |
| Cross-org 404 | ✅ `NotFoundException` khi disconnect/resource thiếu |
| RBAC `ads.read/connect/sync/analyze/manage` | ✅ Controllers + seed/roles |
| PermissionsGuard thật | ✅ Soft-bypass đã gỡ |
| Một nguồn credential | ✅ Chỉ `AdConnection.encryptedCredentials`; Integrations Ads cleared; FB table không còn token |
| Mã hóa token-security.util | ✅ `encodeStoredSecret` / `decodeStoredSecret` |
| Token không lộ API/log/FE/queue | ✅ `assertNoCredentialLeak` + `redactForAudit`; không enqueue token |
| Meta Authorization header | ✅ |
| Bỏ paste Google refresh token | ✅ API reject + UI disabled |
| Migration an toàn | ✅ Đã deploy, giữ ciphertext cũ |

---

## Rủi ro còn lại

1. **AdManagerSettings / một số unique campaign** vẫn theo `userId` — đọc insights theo org nhưng settings automation còn per-user upsert.
2. **Gmail** vẫn cho paste refresh token (chỉ Google Ads bị chặn theo yêu cầu).
3. **Google Ads sync** vẫn mock cho đến Phase B OAuth.
4. User cần **re-login** (hoặc seed rolePermission) để JWT có `ads.*` — đã upsert permission vào DB; session cũ có thể thiếu permission đến khi refresh.
5. Meta scopes vẫn `ads_read` — manage/pause có thể fail cho đến khi mở rộng scope Phase B.
6. Working tree `main` vẫn nhiều thay đổi WIP khác Ads.

---

## Cách rollback

```bash
cd /var/www/marketingaut_usr75/data/www
git checkout backup/pre-ads-saas-20260723 -- apps/api/src/ad-performance apps/api/src/ai-ads-manager \
  apps/api/src/integrations apps/api/src/common/guards/permissions.guard.ts \
  apps/api/src/common/constants/roles.ts apps/web/src/components/ai-ads-manager \
  apps/web/src/hooks/use-ai-ads-manager.ts apps/web/src/hooks/use-integrations.ts \
  apps/web/src/components/settings/integrations-panel.tsx
# DB: restore snapshot trước migration 20260723100000 (khuyến nghị) — không chạy migrate down mù
```

---

## Bước tiếp (Phase B — khi được phép)

- Google Ads OAuth thật + client API  
- Mở rộng Meta scopes `ads_management` nếu cần manage  
- Org-scoped `AdManagerSettings`  
- Optional BullMQ `ads-sync` (payload chỉ IDs)
