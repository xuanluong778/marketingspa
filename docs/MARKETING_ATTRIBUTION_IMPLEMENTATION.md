# Marketing Attribution — Implementation Report

## Mục tiêu

Nâng cấp MarketingSpa thành hệ thống đo lường marketing khép kín:

`Campaign → Ad Set/Keyword → Ad → Lead → Hội thoại → Lịch hẹn → Khách đến → Mua dịch vụ → Thanh toán → Doanh thu/ROAS`

## Phạm vi đã làm

### 1. Schema / migration

Migration: `packages/database/prisma/migrations/20260721120000_marketing_attribution/`

- Enums: `MarketingTouchType`, `MarketingFunnelEventType`, `OfflineConversionProvider`, `OfflineConversionStatus`
- Models: `AdSet`, `AdCreative`, `LeadAttribution`, `MarketingFunnelEvent`, `OfflineConversionJob`
- `Lead`: `platformExternalLeadId`, `platform` (+ unique theo org)
- `Order`: optional `leadId` (FK rõ ràng, không match theo tên)
- Sự kiện funnel: `LEAD_CREATED`, `LEAD_QUALIFIED`, `APPOINTMENT_BOOKED`, `APPOINTMENT_CONFIRMED`, `CUSTOMER_ARRIVED`, `SERVICE_PURCHASED`, `PAYMENT_COMPLETED`, `CUSTOMER_RETURNED` (+ `PAYMENT_REFUNDED`, `APPOINTMENT_CANCELLED`)

### 2. Attribution chung (Meta / Google / form / chatbot / thủ công)

- `AttributionService.upsertLeadAttribution` lưu UTM (`utm_source/medium/campaign/content/term`), `fbclid`, `gclid`, campaign/ad set/ad IDs (internal + external), landing page, referrer, **first-touch** / **last-touch** JSON.
- Dedupe lead: ưu tiên `platformExternalLeadId`; sau đó phone/email trong org; **không gộp** khi chỉ trùng email công ty mà tên khác và không có click-id/platform id.
- Chatbot public lead parse UTM/`gclid`/`fbclid` từ `pageUrl`.

### 3. Hooks khép kín

| Trigger | Service | Event |
|--------|---------|--------|
| Tạo lead | `LeadsService` / chatbot | `LEAD_CREATED` + attribution |
| Đổi pipeline đủ ĐK | `LeadsService.updateStatus` | `LEAD_QUALIFIED` |
| Tạo / đổi trạng thái lịch | `AppointmentsService` | BOOKED / CONFIRMED / ARRIVED / CANCELLED |
| Thanh toán | `FinanceService.createPayment` | `SERVICE_PURCHASED`, `PAYMENT_COMPLETED`, optional `CUSTOMER_RETURNED` |
| Hoàn tiền | `FinanceService.refundPayment` | `PAYMENT_REFUNDED` (doanh thu net giảm) |

Idempotency: `organizationId + idempotencyKey` trên funnel events và offline jobs.

### 4. Offline conversions (BullMQ)

- Queue: `QUEUE_NAMES.OFFLINE_CONVERSION` (`offline-conversion-queue`)
- API enqueue: `OfflineConversionService` (retry 5, exponential backoff, jobId ổn định)
- Worker: `apps/worker/src/processors/offline-conversion.ts`
- Meta CAPI / Google Enhanced: chỉ gửi khi env cấu hình (`META_CAPI_ACCESS_TOKEN`, `GOOGLE_ENHANCED_CONVERSIONS_ENABLED=true`); nếu chưa cấu hình → status `SKIPPED` (không đẩy dữ liệu giả lên ads production).

### 5. Dashboard API + Web

- `GET /api/v1/attribution/dashboard` — chi tiêu, lead, lead ĐK, lịch hẹn, đến, đơn, doanh thu, CPL, cost/appointment, CAC, ROAS, LN ước tính.
- Filters: thời gian, nguồn/channel, campaign, ad, service, branch, employee, utm_source, khách mới/cũ, group by campaign/ad.
- UI: `/attribution` (nav Quảng cáo → Attribution & ROAS).
- Tenant: mọi query gắn `organizationId`; user org khác không đọc được attribution.

### 6. Liên kết khóa

Lead ↔ Customer ↔ Appointment ↔ Order/Payment ↔ Campaign/AdSet/Ad ↔ Branch/Employee/Service qua UUID FK / event columns — không attribution theo tên campaign.

## Test bắt buộc

Script: `scripts/test-marketing-attribution.ts`

```bash
pnpm test:marketing-attribution
```

| # | Scenario | Kỳ vọng |
|---|----------|---------|
| 1 | Lead Facebook → thanh toán | Doanh thu / spend = ROAS đúng (5x trong fixture) |
| 2 | Lead Google + `gclid` | `LeadAttribution.gclid` ghi nhận |
| 3 | Nhiều lịch hẹn cùng lead | Vẫn 1 lead; 2 event BOOKED |
| 4 | Refund | Net revenue về 0 |
| 5 | Org khác | Không đọc được attribution/event của lead |

Dữ liệu test tạo với prefix `ATTR_TEST_*` và **xóa sau khi chạy** — không để lại dữ liệu giả production.

## Biến môi trường (tuỳ chọn)

```env
META_CAPI_ACCESS_TOKEN=
GOOGLE_ENHANCED_CONVERSIONS_ENABLED=false
```

## Doanh thu & hoàn tiền

`FinanceService.refundPayment` đổi `Payment.status` → `REFUNDED` và ghi event `PAYMENT_REFUNDED`.

Doanh thu attribution **chỉ cộng payment `COMPLETED`**. Khi hoàn tiền, payment không còn COMPLETED nên ROAS/doanh thu giảm tương ứng (không trừ âm lần hai).


- Không sửa Auth/Billing ngoài phạm vi cần thiết (không đụng trong PR này).
- Không phá model Ads/CRM/Finance hiện có — chỉ mở rộng cột/bảng mới + optional FK.
- Isolation theo organization trên mọi bảng attribution/funnel/offline job.

## File chính

- `apps/api/src/attribution/*`
- `apps/api/src/leads|appointments|finance|chatbot-cskh/*` (hooks)
- `apps/worker/src/processors/offline-conversion.ts`
- `apps/web/src/app/(app)/attribution/page.tsx`
- `packages/database/prisma/schema.prisma` + migration `20260721120000_marketing_attribution`
