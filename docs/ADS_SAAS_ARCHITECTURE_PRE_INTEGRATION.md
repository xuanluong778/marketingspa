# Ads SaaS — Kiến trúc trước tích hợp Meta Ads & Google Ads

**Ngày:** 2026-07-23  
**Repo:** `/var/www/marketingaut_usr75/data/www`  
**Phạm vi:** Rà soát + thiết kế. **Chưa** viết code gọi API thật Meta/Google.  
**Backup branches:**
- `backup/pre-ads-saas-20260723` → commit `7c164d1` (HEAD lúc audit)
- `backup/pre-ads-saas-wip-20260723` → snapshot WIP tracked `97cdc76` (working tree không bị đổi)

---

## 1. Hiện trạng module liên quan

Không có thư mục `apps/api/src/ads`. Quảng cáo đang nằm ở **3 đường song song**:

| Module | Path | Scope thực tế | Meta | Google | RBAC |
|--------|------|---------------|------|--------|------|
| **ad-performance** | `apps/api/src/ad-performance/` | `userId` (+ cột `organizationId` ít dùng) | OAuth thật + sync insights | — | Chỉ JWT + TenantGuard |
| **ai-ads-manager** | `apps/api/src/ai-ads-manager/` | `userId` | Dùng FacebookAdsService | Paste refresh token + **mock** | Chỉ JWT + TenantGuard |
| **integrations** | `apps/api/src/integrations/` | `organizationId` | Mock connector `META_ADS` | Mock `GOOGLE_ADS` | `automation.view` / `automation.integration.manage` |

### Supporting modules (tái sử dụng)

| Module | Vai trò với Ads SaaS |
|--------|----------------------|
| **Auth** | JWT `sub` + `organizationId`; `JwtStrategy` reload user/permissions từ DB |
| **Organizations** | Pattern org-scoped đúng chuẩn |
| **TenantGuard** | Chặn spoof `organizationId` trong params/body/query → 404 |
| **PermissionsGuard** | Có sẵn; Ads **chưa gắn**. Shadow mode nếu `HRM_PERMISSIONS_ENFORCE=false` |
| **Audit** | `AuditService` + `redactForAudit` — Integrations dùng; Ads **chưa audit** |
| **Redis / Queue** | BullMQ; enqueue bắt buộc `organizationId`; **không** có ads queue; pattern “chỉ ID trong job” (messaging/auto-post) tốt |
| **OpenAI** | Key env; dùng draft AI Ads — không đụng OAuth Ads |
| **Meta Fanpage** | Token **global env** — **không** tái dùng cho multi-tenant Ads |
| **token-security.util** | `encryptSecret`, `redactForAudit`, `assertNoCredentialLeak` — chuẩn bắt buộc |

### Prisma — 3 kho credential chồng chéo

1. `FacebookAdsConnection` — user-scoped, token Meta mã hóa  
2. `AdConnection` — user-scoped META/GOOGLE/GMAIL  
3. `Integration` — org-scoped META_ADS/GOOGLE_ADS (mock)  

Ngoài ra CRM có `AdAccount` / `AdCampaign` (org) phục vụ attribution thủ công — **không** trùng OAuth.

### Permissions Ads hiện có

**Không có** `ads.read | ads.connect | ads.sync | ads.analyze | ads.manage` trong `roles.ts` / seed.

---

## 2. Kiến trúc Ads SaaS mục tiêu (không tạo module trùng)

### Nguyên tắc

1. **Không** tạo `apps/api/src/ads` song song nếu có thể mở rộng stack hiện có.  
2. **Canonical connection = org-scoped**, JWT là nguồn `organizationId` / `userId` (không tin body frontend).  
3. **Một lớp connector thật** cho Meta/Google; deprecate mock Integrations cho Ads (giữ Zalo/SMS/Email).  
4. Token: decrypt **chỉ lúc gọi provider**; không vào FE, response, log, BullMQ payload.

### Phân lớp đề xuất

```
┌─────────────────────────────────────────────────────────────┐
│ Web /ads + Business Goals tab                               │
│  - OAuth redirect only (Meta/Google)                        │
│  - Không paste refresh token / app secret                   │
└──────────────────────────┬──────────────────────────────────┘
                           │ JWT cookie/header
┌──────────────────────────▼──────────────────────────────────┐
│ Controllers (mở rộng ad-performance + ai-ads-manager)       │
│  JwtAuthGuard + TenantGuard + @RequirePermissions(ads.*)    │
│  organizationId = user.organizationId ONLY                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│ AdsConnectionService (org-scoped)                           │
│  - Connect / disconnect / list status (public DTO)          │
│  - Load encrypted token by connectionId + organizationId    │
│  - Cross-org → NotFoundException (404)                      │
└────────────┬─────────────────────────────┬──────────────────┘
             │                             │
   ┌─────────▼─────────┐         ┌─────────▼─────────┐
   │ MetaAdsClient     │         │ GoogleAdsClient   │
   │ (refactor từ      │         │ (MỚI — thay mock  │
   │ MetaGraphApi +    │         │  & paste-connect) │
   │ FacebookAdsSvc)   │         │                   │
   │ Auth: header,     │         │ OAuth code flow   │
   │ KHÔNG query token │         │                   │
   └─────────┬─────────┘         └─────────┬─────────┘
             │                             │
             └────────────┬────────────────┘
                          │ sync jobs: { organizationId, connectionId, syncLogId }
┌─────────────────────────▼───────────────────────────────────┐
│ BullMQ ads-sync-queue (tái dùng QueueModule)                │
│ Worker decrypt token tại runtime; payload không chứa token  │
│ Audit: connect | sync | analyze | manage (redacted)         │
└─────────────────────────────────────────────────────────────┘
```

### RBAC bắt buộc

| Permission | Hành vi |
|------------|---------|
| `ads.read` | Xem connection status, campaigns, insights, dashboard |
| `ads.connect` | Bắt đầu/hoàn tất OAuth, chọn ad account, disconnect |
| `ads.sync` | Trigger sync / load-more sync |
| `ads.analyze` | Báo cáo, AI draft phân tích, efficiency scores |
| `ads.manage` | Pause/enable campaign, đổi budget, automation rules ghi |

Gán mặc định gợi ý: OWNER/MANAGER/MARKETING đủ bộ; SALE chỉ `ads.read` (nếu cần); TECHNICIAN/HR không có.

### Tenant & IDOR

- Mọi query: `where: { organizationId: user.organizationId, id }`  
- Resource khác org → `NotFoundException` (không 403)  
- Bỏ tin `organizationId` / `userId` từ DTO frontend  
- Migrate dần `FacebookAdsConnection` / `AdConnection` từ user-unique → org-unique `(organizationId, provider)` (hoặc org + externalAccountId)

### Token policy

| Nơi | Quy tắc |
|-----|---------|
| DB | AES-GCM (`encryptSecret`) only |
| API response | Public DTO + `assertNoCredentialLeak` |
| Log / Audit | `redactForAudit` |
| BullMQ | Chỉ `organizationId`, `connectionId`, `jobType`, date range |
| Frontend | OAuth redirect; **cấm** paste refresh token / developer token |
| Graph/Google HTTP | Authorization header / body — **không** `?access_token=` |

---

## 3. Tái sử dụng vs không đụng

| Tái sử dụng | Không tạo trùng / không dùng cho Ads multi-tenant |
|-------------|-----------------------------------------------------|
| `FacebookAdsService`, `MetaGraphApiService` (harden) | Module Nest mới tên `ads` copy-paste OAuth |
| `AiAdsManagerService` automation/UI | Meta Fanpage env `META_PAGE_ACCESS_TOKEN` |
| `IntegrationsService` pattern encrypt/audit/public DTO | Mock `META_ADS`/`GOOGLE_ADS` connectors cho production |
| `QueueEnqueueService`, messaging job ID-only | Job chứa plaintext token |
| `token-security.util`, `AuditService`, guards | Sửa Auth/Billing/Credit/Payment (`quytac.md`) |
| CRM `AdAccount` cho attribution | Merge mù với OAuth snapshots |

**Integrations Settings UI:** tách nhãn — META/GOOGLE Ads thật nằm ở `/ads` (OAuth). Settings Integrations giữ kênh messaging; deprecate form paste secret Ads hoặc redirect sang `/ads`.

---

## 4. File cần sửa (phase sau — chưa code API thật)

### Phase A — Nền tảng bảo mật & schema (trước gọi API thật)

| File | Việc |
|------|------|
| `packages/database/prisma/schema.prisma` | Org-scoped connection model / migration từ user-scoped; quan hệ Organization |
| `packages/database/prisma/migrations/*_ads_org_rbac/` | Migration an toàn + backfill `organizationId` |
| `packages/database/prisma/seed.ts` | Seed 5 permission `ads.*` + map role |
| `apps/api/src/common/constants/roles.ts` | `ADS_PERMISSION_DEFS` + `defaultPermissionCodesForRole` |
| `apps/api/src/ad-performance/facebook-ads/*.ts` | Query theo org; `@RequirePermissions`; audit; header token |
| `apps/api/src/ai-ads-manager/*.ts` | Org scope; permissions; bỏ `ConnectGoogleDto.refreshToken` |
| `apps/api/src/integrations/*` | Tách Ads mock khỏi UX production (hoặc đánh dấu deprecated) |
| `apps/api/src/queue/queue.constants.ts` + `queue.module.ts` | `ADS_SYNC_QUEUE` (payload ID-only) |
| `apps/worker/src/index.ts` + processor ads-sync | Decrypt tại worker |
| `apps/web/src/hooks/use-facebook-ads.ts` / `use-ai-ads-manager.ts` | Bỏ paste token; chỉ OAuth |
| `apps/web/src/components/ai-ads-manager/*` | UI connect OAuth Google |
| `apps/web/src/components/settings/integrations-panel.tsx` | Không nhập secret Ads |
| `docs/` + test script | `test-ads-saas-security.ts` (tenant 404, no token leak, RBAC) |

### Phase B — API thật Meta/Google (prompt sau)

- Mở rộng scopes Meta (`ads_management` khi cần manage)  
- Google Ads OAuth + client library / REST  
- Sync cursor, rate limit, retry  

**Không làm trong bước này.**

---

## 5. Rủi ro hiện có (ưu tiên)

| # | Rủi ro | Mức | Ghi chú |
|---|--------|-----|---------|
| 1 | **Không có RBAC Ads** — mọi user JWT gọi được connect/sync/pause | Cao | SALE/TECHNICIAN có thể thao tác |
| 2 | **User-scoped connection** — teammate không share; lệch SaaS org | Cao | Cột `organizationId` có nhưng query theo `userId` |
| 3 | **3 kho credential** chồng Meta/Google | Cao | Dễ connect nhầm / token lệch nguồn |
| 4 | Meta Graph **token trên query string** | Cao | Log proxy/CDN |
| 5 | Google/Gmail **paste refresh token từ FE** | Cao | XSS / extension / history |
| 6 | Google sync **mock** trong khi UI như “đã kết nối” | Trung | Kỳ vọng sai |
| 7 | Ads **không ghi Audit** connect/sync/manage | Trung | Khó điều tra |
| 8 | OAuth scopes Meta thiếu cho pause (`ads_read` only) | Trung | Manage fail hoặc quyền ảo |
| 9 | `HRM_PERMISSIONS_ENFORCE=false` soft-allow | Trung | RBAC Ads vô hiệu nếu bật shadow |
| 10 | Meta Fanpage token global env | Trung | Không áp cho Ads; rủi ro riêng multi-tenant publish |
| 11 | Working tree `main` rất bẩn (nhiều module WIP) | Vận hành | Backup WIP branch đã tạo; nên commit/tách PR trước khi code Ads lớn |
| 12 | JWT trong `localStorage` (web) | Trung | XSS → toàn quyền API kể cả Ads |

---

## 6. Checklist tuân thủ yêu cầu SaaS

| Yêu cầu | Hiện trạng | Hướng xử lý |
|---------|------------|-------------|
| Query theo `organizationId` từ JWT | Một phần (Integrations OK; Ads user-scoped) | Migrate Ads → org filter bắt buộc |
| Không tin org/user từ FE | TenantGuard chặn spoof field; service vẫn nhận body khác | Service ignore org từ DTO |
| Cross-org → 404 | Pattern có ở CRM/Integrations; Ads chưa đồng nhất | `NotFoundException` mọi lookup |
| RBAC `ads.*` | Chưa có | Seed + `@RequirePermissions` |
| Token không lộ FE/API/log/queue | Encrypt OK; lộ qua URL Graph + paste FE | Header auth; OAuth only; ID-only jobs |

---

## 7. Rollback

```bash
cd /var/www/marketingaut_usr75/data/www
# Quay về commit trước audit (không gồm WIP chưa commit trên working tree)
git checkout backup/pre-ads-saas-20260723

# Khôi phục snapshot tracked files lúc audit (cẩn thận conflict với untracked)
git checkout backup/pre-ads-saas-wip-20260723 -- .
```

Không `push --force` lên `main`. Migration Ads sau này phải có down script / backup DB trước deploy.

---

## 8. Kết luận bước này

- Đã rà soát Ads / Integrations / Meta Fanpage / OpenAI / Audit / Redis / Queue / Auth / Organizations.  
- Đã tạo **2 backup branch**; **không** viết tích hợp API thật.  
- Hướng đi: **mở rộng ad-performance + ai-ads-manager**, org-scope + `ads.*` RBAC, tái dùng encrypt/audit/queue; **không** nhân bản module; **không** dùng Fanpage env-token cho Ads.  
- Bước tiếp theo (khi được phép): Phase A schema + permissions + harden token/URL — rồi mới Phase B Meta/Google API thật.
