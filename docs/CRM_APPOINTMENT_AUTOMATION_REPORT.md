# CRM · Lịch hẹn · Automation — Implementation Report

## Mục tiêu

Nâng cấp CRM, lịch hẹn và Automation thành quy trình xử lý lead chuyên nghiệp cho spa, phạm vi:

`/leads` · `/customers` · `/appointments` · `/automation` · `/chatbot-cskh`

## Pipeline mặc định

| Code | Nhãn |
|------|------|
| `NEW` | Lead mới |
| `CONTACTED` | Đã liên hệ |
| `QUALIFIED` | Đủ điều kiện |
| `BOOKED` | Đã đặt lịch |
| `CONFIRMED` | Đã xác nhận |
| `VISITED` | Đã đến |
| `PURCHASED` | Đã mua |
| `LOST` | Mất lead |

- Bảng `funnel_stages` mở rộng `code`, `isActive`, `isLostStage` — tùy chỉnh theo org.
- Soft-deactivate stage giữ FK lịch sử trên lead (không xóa cứng).
- API: `GET/POST /crm/pipeline`, `PATCH /crm/pipeline/stages/:id/deactivate`.

## CRM Lead

- Score, tags, SLA (`slaRespondBy`, `slaBreached`), reminder, ghi chú (`lead_notes`), lịch sử (`lead_activities`), lý do mất lead (bắt buộc khi `LOST`).
- Auto-assign: chi nhánh / nhân viên cố định / **round-robin** (`lead_assignment_rules`).
- Claim lock (`claimedById` + `claimExpiresAt`) — chống 2 NV xử lý cùng lúc (`POST /crm/leads/:id/claim`).
- Tạo lead mặc định auto-assign + SLA 15 phút + dispatch automation `LEAD_CREATED` qua BullMQ.

## Customer 360 & gộp hồ sơ

- `GET /crm/customers/:id/360` — nguồn, hội thoại chatbot, lịch hẹn, dịch vụ đã mua, tổng chi tiêu, NV phụ trách, timeline.
- `GET /crm/customers/:id/duplicates` — trùng phone/email.
- `POST /crm/customers/merge` — chuyển lead/appointment/order/task, soft-deactivate secondary, `customer_merge_logs` + audit `CUSTOMER_MERGED`.

## Lịch hẹn

Liên kết: Customer, Lead, Branch, Employee, Service, **Room/Bed/Equipment**, **AdCampaign**, tiền cọc.

- Conflict check nhân viên / phòng / giường / thiết bị.
- Trạng thái: xác nhận, đổi lịch (`POST /appointments/:id/reschedule`), hủy, no-show, check-in/out.
- Tạo từ lead → cập nhật pipeline `BOOKED`; confirm/arrive đồng bộ lead stage.
- Calendar filters: chi nhánh, nhân viên, dịch vụ, trạng thái (day/week/month/list giữ UI hiện có).

## Automation

Trigger bổ sung: `LEAD_UNTOUCHED`, `LEAD_BOOKED`, `APPOINTMENT_UNCONFIRMED`, `APPOINTMENT_CANCELLED`, `TREATMENT_EXPIRING`.

Actions (JSON `actions`): `SEND_MESSAGE`, `SEND_EMAIL`, `CREATE_TASK`, `ASSIGN_EMPLOYEE`, `CHANGE_STATUS`, `ADD_TAG`, `CREATE_APPOINTMENT`.

- Giờ yên lắng, chống trùng (idempotencyKey), `maxSendsPerDay`, `cooldownMinutes`, nhật ký từng bước, **pause** (`PATCH /automation/flows/:id/pause`).
- Dispatch async qua `automation-message-queue` — API không chờ gửi tin.
- Worker: `apps/worker/src/processors/automation-run.ts`.

## Chatbot CSKH

- Tạo/cập nhật CRM Lead + `linkedLeadId` trên hội thoại.
- `POST /chatbot-cskh/inbox/:id/takeover` — gán NV, `humanTakeover=true`, bot dừng trả lời.
- Realtime vẫn qua Socket.IO room `org:{organizationId}`.

## Phạm vi không đụng

Auth, Finance (ngoài `leadId`/order link hiện có), Ads manager, HRM — không refactor.

## Migration

`packages/database/prisma/migrations/20260721140000_crm_appointment_automation/`

## Test E2E

```bash
pnpm test:crm-appointment-automation
```

Kịch bản: **Lead mới → tự gán NV → tư vấn → đặt lịch → xác nhận → khách đến → mua → pipeline PURCHASED + doanh thu**; claim conflict; duplicate phone; pause flow; tenant isolation.

## File chính

- `apps/api/src/crm/*`
- `apps/api/src/leads/*`, `appointments/*`, `automation/*`, `chatbot-cskh/*`
- `apps/worker/src/processors/automation-run.ts`
- `apps/web/src/types/crm.ts` (pipeline 8 cột)
- `docs/CRM_APPOINTMENT_AUTOMATION_REPORT.md`
