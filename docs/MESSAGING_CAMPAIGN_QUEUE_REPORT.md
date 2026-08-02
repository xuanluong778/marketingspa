# Messaging Campaign Queue & Worker (Prompt 7)

## Queues

| Queue | Job | Mô tả |
|-------|-----|--------|
| `messaging-campaign-plan-queue` | `plan-campaign` | Snapshot segment, tạo recipient theo batch, eligibility |
| `messaging-campaign-dispatch-queue` | `dispatch-campaign` | Chia recipient `QUEUED` thành chunk, enqueue send |
| `messaging-send-queue` | `send-message` | Eligibility lần cuối, render, gọi provider |
| `messaging-webhook-queue` | `process-webhook` | Cập nhật delivered/read/replied |

## Luồng

```
POST /start → PLANNING → plan-queue
  → recipients (batch 100) + eligibility
  → RUNNING → dispatch-queue
    → send-queue (chunk 50, jobId = idempotencyKey)
      → rate limit → send HTTP → SENT
webhook-queue → DELIVERED / READ / REPLIED
Socket.IO → messaging-campaign:update | messaging-campaign:recipient
```

## Yêu cầu đã đáp ứng

- API `start()` chỉ enqueue plan — không gửi inline
- `QueueEnqueueService` throw `ServiceUnavailableException` khi Redis/BullMQ lỗi — không fallback inline
- Job idempotency: `messaging-plan:{id}`, `mc:{campaign}:{identity}`, dispatch cursor jobs
- Rate limit Redis theo `providerKind` + `integrationId|connectionId`
- Retry tối đa 3 lần (4 attempts) exponential backoff 2s
- HTTP 429: đọc `Retry-After`, `job.moveToDelayed()`
- Không retry: opted-out, blocked, permission, policy, invalid recipient (`UnrecoverableError`)
- Pause: worker skip, recipient giữ `QUEUED`
- Cancel: không dispatch/send mới, log đã gửi giữ nguyên
- Worker restart: claim atomic `QUEUED→PENDING`, jobId idempotent

## Test

```bash
pnpm test:messaging-campaign-queue
pnpm test:messaging-campaign
pnpm --filter @marketingspa/worker build
pnpm --filter @marketingspa/api build
```

## Deploy worker

Sau deploy cần **restart worker** để đăng ký 3 queue mới.

## Rollback

Revert code + restart worker. Jobs trong Redis có thể xóa theo prefix `marketingspa:*`.
