# Messaging Campaign (Prompt 6)

## Tổng quan

Module chiến dịch nhắn hàng loạt: model Prisma, API lifecycle, preview segment/eligibility, gửi thử giả lập (không gửi tin thật qua API).

## Models

- `MessagingCampaign` — org, tên, channel, loại, integration/template, trạng thái, segment, biến, lịch, thống kê, chi phí
- `MessagingCampaignRecipient` — recipient theo identity, eligibility, nội dung render, idempotency, trạng thái gửi
- `MessagingSuppression` — blocked/opt-out theo identity, SĐT hoặc channel

## API (`/automation/messaging-campaigns`)

| Method | Path | Permission |
|--------|------|------------|
| POST | `/` | `automation.campaign.create` |
| PATCH | `/:id` | `automation.campaign.create` |
| GET | `/` | `automation.view` |
| GET | `/:id` | `automation.view` |
| POST | `/:id/preview-segment` | `automation.view` |
| POST | `/:id/preview-eligibility` | `automation.view` |
| POST | `/:id/test-send` | `automation.campaign.send` |
| POST | `/:id/schedule` | `automation.campaign.approve` |
| POST | `/:id/start` | `automation.campaign.send` |
| POST | `/:id/pause` | `automation.campaign.pause` |
| POST | `/:id/resume` | `automation.campaign.pause` |
| POST | `/:id/cancel` | `automation.campaign.pause` |
| POST | `/:id/duplicate` | `automation.campaign.create` |

**Immutability:** Không sửa `segmentConfig`, `variables`, template, integration hoặc channel sau khi `startedAt` được set hoặc status khác `DRAFT`/`SCHEDULED`.

## Migration

`20260722180000_messaging_campaigns`

## Test

```bash
pnpm db:migrate:deploy
pnpm test:messaging-campaign
pnpm --filter @marketingspa/api build
```

## Rollback

```bash
# Revert migration (dev only)
pnpm --filter @marketingspa/database exec prisma migrate resolve --rolled-back 20260722180000_messaging_campaigns
# Drop tables manually if needed: messaging_campaign_recipients, messaging_campaigns, messaging_suppressions
```

## Rủi ro còn lại

- Worker gửi thật cho recipient `QUEUED` chưa được triển khai trong prompt này
- Scheduler tự động start chiến dịch `SCHEDULED` chưa có
- UI tab chiến dịch hàng loạt chưa có
