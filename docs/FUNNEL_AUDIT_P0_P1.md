# Funnel Audit — P0/P1 trước khi sửa

**Ngày:** 2026-07-22  
**Luồng:** Ads/Chatbot → Lead → Customer → Assign → Appointment → Check-in → Order → Payment → Attribution → ROAS → Report  
**Backup:** `backups/funnel-audit-*` (api-src, worker-src, prisma, web-key)

## P0 (phải sửa)

| ID | Lỗi | Ảnh hưởng |
|----|-----|-----------|
| P0-1 | `createPayment` không idempotent | Retry webhook/job → doanh thu/ROAS nhân đôi |
| P0-2 | Thanh toán không cập nhật Order=PAID / Lead=PURCHASED | Luồng khép kín gãy |
| P0-3 | Chatbot `prisma.lead.create` bypass `LeadsService` | Trùng lead, mất auto-assign/automation/socket/audit |
| P0-4 | Attribution upsert không assert campaign/ad thuộc org | Cross-tenant FK leak |
| P0-5 | UI không gửi attribution / không tạo payment+leadId | Mất UTM trên lead thủ công; không đóng vòng từ UI |

## P1 (sửa trong phạm vi)

| ID | Lỗi |
|----|-----|
| P1-1 | Refund giảm revenue nhưng CAC/orders vẫn đếm SERVICE_PURCHASED |
| P1-2 | Không có cancel order → attribution |
| P1-3 | Thiếu convert Lead → Customer (auto upsert theo phone) |
| P1-4 | Customer create không dedupe phone/email |
| P1-5 | Không chặn chuyển trạng thái Lead/Appointment sai |
| P1-6 | `assign` lead không assert employee org |
| P1-7 | Room/bed/equipment không assert org |
| P1-11 | Payment/refund thiếu audit log |
| P1-refund-guard | Refund khi đã REFUNDED / chưa COMPLETED |

## Ngoài phạm vi lần này (P2 ghi nhận)

- Offline conversion HTTP thật Meta/Google (vẫn SKIPPED/simulated khi chưa env)
- Automation CREATE_APPOINTMENT gọi raw prisma (P1-8) — sửa nếu thời gian cho phép
- Hard-delete lead

## Rollback

1. Restore tar từ `backups/funnel-audit-*`
2. `pnpm db:generate` + rebuild api/web/worker
3. Không chạy migrate phá dữ liệu — các migrate mới nếu có phải reversible / additive only
