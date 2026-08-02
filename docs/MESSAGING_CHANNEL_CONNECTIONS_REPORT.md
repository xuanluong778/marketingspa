# Prompt 4 — Kết nối Fanpage, Zalo OA và webhook

## Tóm tắt

Tab **Kết nối kênh** trên `/automation`, API quản lý nhiều Fanpage/Zalo OA mỗi org, interface `MessagingProvider`, webhook async qua `messaging-webhook-queue`.

## Schema mới

- `MessagingChannelConnection` — nhiều Fanpage + Zalo OA / org
- `MessagingWebhookEvent` — dedupe chống replay/trùng

Migration: `20260722170000_messaging_channel_connections`

## MessagingProvider

| Provider | Channel | Gửi |
|----------|---------|-----|
| `MessengerProvider` | MESSENGER | Text (Graph API) |
| `ZaloOaProvider` | ZALO | CS message |
| `ZbsTemplateProvider` | ZALO | ZNS template |

Methods: `validateConnection`, `getCapabilities`, `checkRecipientEligibility`, `sendMessage`, `estimateCost`, `normalizeWebhook`

## API

| Method | Path |
|--------|------|
| GET | `/automation/channel-connections` |
| POST | `/automation/channel-connections/messenger` |
| POST | `/automation/channel-connections/zalo` |
| POST | `/automation/channel-connections/zbs` |
| POST | `/:id/test` |
| POST | `/:id/reconnect` |
| PATCH | `/:id/pause` |
| DELETE | `/:id` |

## Webhook (public)

| Method | Path |
|--------|------|
| GET/POST | `/messaging/webhooks/messenger` |
| POST | `/messaging/webhooks/zalo` |

Flow: verify signature → dedupe DB → enqueue `messaging-webhook-queue` → worker cập nhật `MessagingContactIdentity` + `lastSyncedAt`.

Chatbot webhook (`/chatbot-cskh/facebook/webhook`) cũng gọi ingress để đồng bộ identity.

## File chính

- `apps/api/src/messaging/*`
- `apps/worker/src/processors/messaging-webhook.ts`
- `packages/shared/src/constants.ts` — `MESSAGING_WEBHOOK` queue
- `apps/web/src/components/automation/channel-connections-panel.tsx`

## Test

```bash
pnpm db:migrate:deploy
pnpm --filter @marketingspa/api build
pnpm test:messaging-channel-connections
```

## Rủi ro

- `validateConnection` gọi API thật — cần token hợp lệ khi connect
- Worker cần restart để nhận queue mới
- Webhook URL production cần cấu hình Meta/Zalo console

## Rollback

Revert code + drop tables `messaging_webhook_events`, `messaging_channel_connections` nếu chưa có dữ liệu production.
