# Funnel Closed-Loop Fix Report

**Ngày:** 2026-07-22  
**Phạm vi:** Ads/Chatbot → Lead → Customer → Assign → Appointment → Check-in → Order → Payment → Attribution → ROAS → Report  
**Deploy production:** **KHÔNG** — chờ xác nhận sau khi test PASS.

## Backup

`backups/funnel-audit-20260722-091120/` (`api-src.tgz`, `web-src-key.tgz`, `worker-src.tgz`, `prisma.tgz`, `migrate-status.txt`)

Audit P0/P1: `docs/FUNNEL_AUDIT_P0_P1.md`

## Kết quả build / test

| Hạng mục | Kết quả |
|----------|---------|
| `pnpm --filter @marketingspa/api build` | PASS |
| `pnpm --filter @marketingspa/worker build` | PASS |
| `pnpm --filter @marketingspa/web build` | PASS |
| `pnpm test:funnel-closed-loop` | PASS |
| `pnpm test:marketing-attribution` | PASS |
| `pnpm test:crm-appointment-automation` | PASS |

## File đã sửa / thêm

### API
| File | Nguyên nhân / thay đổi |
|------|------------------------|
| `apps/api/src/common/utils/status-transitions.util.ts` | FSM Lead / Appointment / payment refund / order paid status |
| `apps/api/src/common/services/tenant-ownership.service.ts` | Assert AdSet/AdCreative/Room/Bed/Equipment (đã có từ audit) |
| `apps/api/src/finance/dto/finance.dto.ts` | `idempotencyKey` trên CreatePayment |
| `apps/api/src/finance/finance.service.ts` | Idempotent payment; Order PAID; Lead PURCHASED; refund guard; cancel order; audit |
| `apps/api/src/finance/finance.controller.ts` | Truyền `userId`; `POST orders/:id/cancel` |
| `apps/api/src/finance/finance.module.ts` | Import CrmModule + EventsModule |
| `apps/api/src/attribution/attribution.service.ts` | Assert campaign/adSet/ad thuộc org khi upsert |
| `apps/api/src/attribution/attribution-dashboard.service.ts` | Orders/CAC từ payment COMPLETED (refund hạ CAC/ROAS) |
| `apps/api/src/leads/leads.service.ts` | Transition guard; assert employee khi assign; `convertToCustomer` |
| `apps/api/src/leads/leads.controller.ts` | `POST :id/convert-customer` |
| `apps/api/src/appointments/appointments.service.ts` | Assert room/bed/equipment/campaign; auto Customer từ Lead; transition guard |
| `apps/api/src/customers/customers.service.ts` | Soft dedupe phone/email |
| `apps/api/src/chatbot-cskh/chatbot-cskh.module.ts` | Import LeadsModule |
| `apps/api/src/chatbot-cskh/chatbot-cskh-public.service.ts` | `submitLead` → `LeadsService.create` (dedupe + attribution + audit) |

### Web
| File | Thay đổi |
|------|----------|
| `apps/web/src/types/crm.ts` | `attribution` trên CreateLeadInput |
| `apps/web/src/components/crm/lead-form-dialog.tsx` | Gửi UTM/gclid/fbclid từ URL khi tạo lead |
| `apps/web/src/hooks/use-finance.ts` | Mutations order / payment / refund / cancel |

### Tests / docs
| File | Thay đổi |
|------|----------|
| `scripts/test-funnel-closed-loop.ts` | E2E full funnel + duplicate payment/event + refund + cross-tenant |
| `package.json` | Script `test:funnel-closed-loop` |
| `docs/FUNNEL_CLOSED_LOOP_FIX_REPORT.md` | Báo cáo này |

## P0 đã xử lý

1. **Payment idempotent** — `reference` / `idempotencyKey` trả payment cũ, không nhân ROAS  
2. **Payment → Order PAID + Lead PURCHASED** + funnel/audit/socket  
3. **Chatbot lead** qua `LeadsService` — giữ UTM từ `pageUrl`, chống trùng  
4. **Attribution upsert** assert org ownership cho ad entities  
5. **UI** gửi attribution từ query string; hooks tạo order/payment/`leadId`

## P1 đã xử lý

- Refund → doanh thu 0; orders/CAC đếm theo payment COMPLETED  
- Cancel order (chặn nếu còn payment COMPLETED) + audit  
- Lead → Customer (API convert + auto khi đặt lịch)  
- Customer soft dedupe  
- Lead/Appointment status FSM  
- Assign lead assert employee org  
- Room/bed/equipment/adCampaign assert org  
- Audit payment/refund/order  

## Rollback

1. Không deploy nếu chưa xác nhận.  
2. Nếu đã deploy nhầm: restore `backups/funnel-audit-20260722-091120/*.tgz` vào `apps/api`, `apps/web`, `apps/worker`, `packages/database` (chỉ src đã backup).  
3. `pnpm db:generate` + rebuild api/web/worker.  
4. Không có migrate phá dữ liệu trong đợt này (schema attribution/CRM trước đó vẫn additive).  

## Việc chưa làm (có chủ đích)

- Không restart / deploy production  
- Offline conversion HTTP Meta/Google thật vẫn SKIPPED khi thiếu env (P2)  
- UI dialog tạo order/payment đầy đủ trên trang Finance (hooks đã sẵn; form tối thiểu chưa gắn UI dialog — API đủ để đóng vòng)
