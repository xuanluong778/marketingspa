# Báo cáo: Quảng cáo bán hàng — Product / Service posts

**Branch:** `feat/ad-product-service-posts`  
**Rollback tag:** `feat/ad-product-service-posts-rollback` (@ `c115697`)  
**Deploy production:** **CHƯA** (chờ PASS + approve)

## Tóm tắt

Nâng cấp tab **Quảng cáo bán hàng** (`/content?tab=create&section=ad`) với dropdown loại bài (sản phẩm / dịch vụ), trường thương hiệu, form chi tiết theo loại, prompt AI tách biệt, DTO tương thích ngược trên `/content-marketing/generate`. Giữ hooks/CTA/score/policy; bổ sung headline, mô tả ngắn, gợi ý media. Draft thêm `schemaVersion: 3`, migrate draft cũ không mất content; draft mới mặc định `product`.

**Không đụng:** Viết bài nâng cao, Xây dựng thương hiệu, Auto Post, facebook-policy.

## Files sửa / thêm

| File | Thay đổi |
|------|----------|
| `apps/web/src/types/content-marketing.ts` | `AdPostKind`, product/service details, form + result extras |
| `apps/web/src/lib/content-marketing-form.ts` | draft v3/`schemaVersion`, migrate, `buildAdGeneratePayload`, exclusivity |
| `apps/web/src/hooks/use-content-marketing.ts` | ad mode → `buildAdGeneratePayload` |
| `apps/web/src/components/content-marketing/content-marketing-studio.tsx` | UI loại bài + brand + fields; brand autofill; result extras |
| `apps/api/src/content-marketing/dto/content-marketing.dto.ts` | optional `adPostKind`, `brandName`, nested `product`/`service` |
| `apps/api/src/content-marketing/ad-product-service.logic.ts` | **new** — prompts + template + exclusivity |
| `apps/api/src/content-marketing/content-marketing-logic.ts` | `generateMarketingContent` → product/service path; result extras type |
| `apps/api/src/content-marketing/content-marketing.service.ts` | `assertExclusiveProductService` → 400 |
| `scripts/test-ad-product-service-posts.ts` | **new** — generate product/service, exclusivity, legacy draft |

## API payload trước / sau

### Trước (legacy, vẫn hợp lệ)

```json
{
  "mode": "ad",
  "productService": "Serum nám XYZ",
  "targetAudience": "Nữ 25-40",
  "painPoints": "...",
  "benefits": "...",
  "offer": "Giảm 20%",
  "platform": "facebook",
  "tone": "friendly",
  "cta": "Inbox \"SERUM\"",
  "adContentType": "sales",
  "adObjective": "messages"
}
```

→ Backend mặc định `adPostKind=product`.

### Sau — Bài viết sản phẩm

```json
{
  "mode": "ad",
  "adPostKind": "product",
  "brandName": "Spa Demo",
  "productService": "Serum",
  "platform": "facebook",
  "tone": "friendly",
  "adContentType": "sales",
  "product": {
    "name": "Serum",
    "category": "Da",
    "features": "...",
    "benefits": "...",
    "differentiators": "...",
    "price": "...",
    "warranty": "...",
    "proof": "...",
    "offer": "..."
  }
}
```

**Không** kèm `service`.

### Sau — Bài viết dịch vụ

```json
{
  "mode": "ad",
  "adPostKind": "service",
  "brandName": "Spa Demo",
  "productService": "Massage đá nóng",
  "service": {
    "name": "Massage đá nóng",
    "suitableCustomers": "...",
    "problems": "...",
    "process": "...",
    "highlights": "...",
    "expectedBenefits": "...",
    "duration": "...",
    "location": "...",
    "experts": "...",
    "proof": "...",
    "offer": "..."
  }
}
```

**Không** kèm `product`. Gửi cả hai → `400 INVALID_AD_PAYLOAD`.

### Response extras (giữ content/hooks/ctas/policy/score)

```json
{
  "headline": "Spa Hoa Sen — Serum nám XYZ",
  "shortDescription": "Da đều màu · Giảm 20%",
  "mediaSuggestions": ["Ảnh sản phẩm...", "Close-up...", "Video unboxing..."],
  "adPostKind": "product"
}
```

## UI trước / sau

- **Trước:** form phẳng (sản phẩm/dịch vụ một ô + audience/pain/benefits/objective/CTA/tone/video).
- **Sau (additive, cùng chrome):** + dropdown **Loại bài quảng cáo**, + **Tên thương hiệu/cơ sở** (autofill `user.organization.name` nếu trống), + block chi tiết product **hoặc** service; giữ objective/platform/CTA/tone/video/KPI/policy/hooks.
- Layout `sm:grid-cols-2` giữ responsive mobile/desktop; không đổi tab Advanced/Personal.

## Kết quả test

| Check | Result |
|-------|--------|
| API `tsc --noEmit` | PASS |
| Web tsc (file feature) | PASS (1 lỗi sẵn có ngoài scope: `channel-connections-panel.tsx`) |
| `pnpm --filter @marketingspa/api build` | PASS |
| `pnpm --filter @marketingspa/web build` | PASS |
| `tsx scripts/test-ad-product-service-posts.ts` | PASS — product + service template generate, exclusivity reject, legacy draft → product + giữ content |
| localStorage restore | PASS (migrate v2 → schemaVersion 3, content/hooks giữ) |
| Screenshot UI | PASS — mock desktop/mobile tại `docs/ad-product-service-posts/screenshots/` (live browser chưa capture vì chưa deploy build mới lên PM2) |

## Commit & rollback

```bash
# Rollback (chưa deploy prod):
git checkout feat/ad-product-service-posts-rollback
# hoặc
git reset --hard feat/ad-product-service-posts-rollback
```

Sau khi PASS + review: merge branch rồi mới deploy/restart PM2.

## Chạy test lại

```bash
pnpm --filter @marketingspa/database exec tsx ../../scripts/test-ad-product-service-posts.ts
```
