# Prompt 3 — Phân quyền, tenant và bảo mật token (Automation)

## Tóm tắt

Hoàn thiện bảo mật module `/automation` và `/integrations`: RBAC, tenant isolation, mã hóa token, không lộ credential qua API/log.

## Permission mới

| Code | Mô tả |
|------|--------|
| `automation.view` | Xem templates, flows, integrations |
| `automation.template.manage` | CRUD mẫu tin |
| `automation.campaign.create` | Tạo/sửa/hủy flow |
| `automation.campaign.approve` | Duyệt/kích hoạt flow |
| `automation.campaign.send` | Gửi thử (simulate) |
| `automation.campaign.pause` | Tạm dừng/tiếp tục |
| `automation.integration.manage` | Kết nối/ngắt/test integration |
| `automation.logs.view` | Xem nhật ký automation |

**Mặc định:** OWNER (all), MANAGER (trừ `settings.manage` + `automation.integration.manage`), MARKETING (automation trừ integration.manage).

## IntegrationStatus

`DISCONNECTED` | `ACTIVE` | `EXPIRED` | `REAUTH_REQUIRED` | `ERROR`  
Migration: `CONNECTED` → `ACTIVE`.

## Audit actions

- `AUTOMATION_TEMPLATE_CREATED/UPDATED/DELETED`
- `AUTOMATION_FLOW_CREATED/UPDATED/APPROVED/PAUSED/RESUMED/CANCELLED/SENT`
- `INTEGRATION_CONNECTED/DISCONNECTED/TESTED`

## File đã sửa

- `apps/api/src/common/constants/roles.ts`
- `apps/api/src/common/utils/token-security.util.ts` (mới)
- `apps/api/src/automation/*`
- `apps/api/src/integrations/*`
- `apps/api/src/chatbot-cskh/chatbot-cskh.service.ts` — mã hóa page token, không trả token qua API
- `apps/api/src/chatbot-cskh/chatbot-facebook-webhook.service.ts` — giải mã + mask PSID trong log
- `apps/web/src/types/automation-messaging.ts`
- `apps/web/src/components/settings/integrations-panel.tsx`
- `packages/database/prisma/schema.prisma` + migration `20260722160000_integration_status_security`
- `packages/database/prisma/seed.ts`
- `scripts/test-automation-security.ts`

## Test

```bash
pnpm db:generate
pnpm db:migrate:deploy
pnpm --filter @marketingspa/database build
pnpm --filter @marketingspa/api build
pnpm test:automation-security
```

## Rollback

1. Revert code + migration folder
2. Nếu migration đã chạy: restore enum `IntegrationStatus` (CONNECTED thay ACTIVE)
3. `pnpm db:seed` để sync permissions (hoặc upsert thủ công)

**Chưa deploy production** — cần test pass + xác nhận user.
