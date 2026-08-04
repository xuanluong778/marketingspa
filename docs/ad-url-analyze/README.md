# Ad URL Analyze — Phân tích link & tự điền form

## Scope
Chỉ thêm **Phân tích link** trên tab Quảng cáo bán hàng. Không đụng Advanced / Personal / Auto Post / facebook-policy.

## Endpoints
| Method | Path | Mô tả |
|--------|------|--------|
| POST | `/content-marketing/ad-url-analyze` | Bắt đầu job (`sourceUrl`, `adPostKind`, `brandName?`) |
| GET | `/content-marketing/ad-url-analyze/:id` | Poll trạng thái / kết quả |
| POST | `/content-marketing/ad-url-analyze/:id/cancel` | Hủy job |

## Queue / Job
- Queue: `ad-url-analyze-queue` (`QUEUE_NAMES.AD_URL_ANALYZE`)
- Job name: `ad-url-analyze`
- Redis state: `ad-url-analyze:job:{id}` (TTL 24h)
- Rate limit: user 8/10m, org 30/10m

## Security
- SSRF: chặn private IP, localhost, link-local, cloud metadata, `.internal`, userinfo, non-http(s)
- Unsupported (clear error): Facebook/Instagram, TikTok, Shopee/Lazada/Tiki/Sendo/Amazon/eBay
- Redirect re-validated; max redirects 3; max body ~1.5MB; fetch timeout 12s
- AI evidence gate: không giữ giá/ưu đãi/bảo hành/chứng nhận nếu không có trong nguồn

## UX
- Ô link + nút **Phân tích & tự điền**
- Progress / stage / hủy / auto-scroll kết quả
- Preview checkbox → **Áp dụng vào form**
- Chỉ điền trống; ghi đè cần `confirm`

## Files
- `packages/shared/src/ad-url-analyze.ts`, `ssrf-fetch.ts` (server-only via `@marketingspa/shared/dist/ssrf-fetch`), exports + `QUEUE_NAMES`
- `apps/api/.../ad-url-analyze.service.ts`, DTO, controller, module, queue wiring
- `apps/worker/.../processors/ad-url-analyze.ts`, `lib/ad-url-analyze-ai.ts`, worker register
- `apps/web/.../ad-url-analyze-panel.tsx`, hook, apply helper, studio mount
- `scripts/test-ad-url-analyze.ts`

## Commits
- `bd7b2dc` feat(content): analyze product/service URL and autofill ad form
- `57c3bce` fix(shared): drop package exports that blocked ssrf-fetch deep import

## Rollback
```bash
git checkout feat/ad-url-analyze-rollback   # 83cb801 — trước feature
# rebuild shared + api dist + web .next; pm2 restart api web worker
# hoặc: git revert 57c3bce bd7b2dc
```
