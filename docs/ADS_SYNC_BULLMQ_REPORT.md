# Ads Sync → BullMQ Worker

**Date:** 2026-07-23  
**Scope:** Meta Ads sync chuyển sang worker; API chỉ enqueue ID payload.

## Kết quả

| Yêu cầu | Triển khai |
|--------|------------|
| API tạo `AdsSyncJob` + queue | `AdsSyncQueueService.enqueueMetaSync` |
| Payload `{ organizationId, connectionId, accountId, dateFrom, dateTo }` (+ `jobId`, `platform`) | Không có token |
| Worker đọc/giải mã token từ DB sau ownership | `processAdsSync` |
| Distributed lock `platform + externalAccountId` | Redis `ads-sync-lock:{platform}:{accountId}` NX |
| Idempotent upsert | `FacebookAdsCampaignSnapshot` + `AdInsight` unique keys |
| Incremental sync | Thiếu `dateFrom` → từ `lastSyncAt` (hoặc 7 ngày) |
| Exponential backoff | BullMQ `backoff: { type: 'exponential', delay: 5000 }` |
| Retry-After | `MetaRateLimitError` → `job.moveToDelayed` |
| Timeout | `ADS_SYNC_TIMEOUT_MS` (default 180s) + Promise.race |
| Chống 2 job cùng account | API Conflict + Redis lock |
| Progress | Socket.IO `ads:sync-progress` + `GET .../sync-jobs/:jobId` |
| Audit | `ADS_SYNC_QUEUED` / `SUCCEEDED` / `FAILED` / `RETRY` |
| Retry không trùng dữ liệu | Upsert theo unique constraint |

## Files chính

- `packages/database` — model `AdsSyncJob`, migration `20260723120000_ads_sync_jobs`
- `packages/shared` — `QUEUE_NAMES.ADS_SYNC`, `WS_EVENTS.ADS_SYNC_PROGRESS`
- `apps/api/.../ads-sync-queue.service.ts` — enqueue-only
- `apps/api/.../facebook-ads.controller.ts` — `GET sync-jobs`, `GET sync-jobs/:jobId`
- `apps/worker/src/processors/ads-sync.ts` — processor
- `apps/worker/src/lib/ads-sync-lock.ts`, `meta-graph-ads.ts`, `ads-insight-mapper.ts`
- `scripts/test-ads-sync-queue.ts`

## API

```
POST /ad-performance/facebook/sync   → { jobId, queued, status, dateFrom, dateTo }
GET  /ad-performance/facebook/sync-jobs
GET  /ad-performance/facebook/sync-jobs/:jobId
```

## Test

```bash
pnpm test:ads-sync-queue
pnpm test:ads-unification
```

## Rollback

```bash
# Revert worker processor registration + API enqueue service
# DROP TABLE ads_sync_jobs; DROP TYPE AdsSyncJobStatus, AdsSyncPlatform;
```
