# AdsActionRequest

**Date:** 2026-07-24

## Flow

```
AI/RULE đề xuất → DRAFT / PENDING_APPROVAL
  → user xem before/after
  → ads.manage phê duyệt (≠ requester nếu AI/RULE)
  → BullMQ worker thực hiện (local DB)
  → verify
  → AuditLog + AdAutomationLog
```

## Constraints

| Rule | Implementation |
|------|----------------|
| Idempotency key | `@@unique([idempotencyKey])` |
| Người yêu cầu / duyệt | `requestedByUserId`, `approvedByUserId` |
| Ngân sách | `budgetLimit` / `proposedBudget` vs `AdManagerSettings.dailyBudgetLimit` |
| Kill switch | `ADS_ACTIONS_LIVE=false` (default) |
| Provider write off | `ADS_ACTIONS_PROVIDER_WRITE=false`; worker không gọi Meta/Google |
| AI không tự duyệt | `assertApproverAllowed` — AI/RULE cần approver khác |
| AI không tự đổi campaign | Auto Mode → `adsActions.propose`, không `toggleCampaign` |

## API

- `GET /ads-actions`
- `POST /ads-actions/propose` (`ads.analyze`)
- `POST /ads-actions/:id/submit`
- `POST /ads-actions/:id/approve` (`ads.manage`)
- `POST /ads-actions/:id/reject` (`ads.manage`)

## Queue

`QUEUE_NAMES.ADS_ACTION` — payload `{ organizationId, actionRequestId }` only.

## Test

```bash
pnpm test:ads-action-request
```
