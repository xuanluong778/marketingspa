# Prompt 5 — Messaging Eligibility Engine

## Tóm tắt

`MessagingEligibilityService` trung tâm kiểm tra khách được phép nhận tin qua Messenger/Zalo/ZBS.

## Đầu ra

```typescript
{
  eligible: boolean;
  providerMode: 'MESSENGER_STANDARD' | 'MESSENGER_UTILITY' | 'ZALO_OA_CONSULT' | 'ZALO_OA_BROADCAST' | 'ZBS_TEMPLATE';
  reasonCode?: string;
  reasonMessage?: string;
  estimatedCost?: number;
  nextEligibleAt?: Date;
}
```

## Quy tắc chính

**Messenger**
- Trong cửa sổ 24h → `MESSENGER_STANDARD`
- Ngoài cửa sổ → chỉ `MESSENGER_UTILITY` (transactional / utility template)
- Chặn: opt-out, blocked, sai Page, thiếu quyền, broadcast

**Zalo**
- `ZALO_OA_CONSULT` — trong cửa sổ tư vấn 48h
- `ZALO_OA_BROADCAST` — follower + quota (từ metadata, không hardcode gói)
- `ZBS_TEMPLATE` — template đã duyệt + số dư

## Tích hợp

| Điểm | Khi nào |
|------|---------|
| `POST /automation/eligibility/check` | Chuẩn bị chiến dịch |
| `AutomationService.simulate` | Trước giả lập gửi |
| `AutomationEngineService.runAction` | Trước SEND_MESSAGE |
| `worker/automation-run.ts` | Re-check ngay trước worker gửi |

## File

- `packages/shared/src/messaging-eligibility.ts` — engine thuần (API + worker)
- `apps/api/src/messaging/messaging-eligibility.service.ts`
- `apps/api/src/messaging/messaging-eligibility.controller.ts`
- `apps/worker/src/lib/messaging-eligibility.ts`

## Test

```bash
pnpm test:messaging-eligibility
```

## Rollback

Revert các file trên — không có migration DB.
