# Ads UI upgrade (`/ads`)

**Date:** 2026-07-24

Nâng cấp route `/ads` hiện có — **không** tạo trang Ads thứ hai.

## Tabs

1. Tổng quan  
2. Kết nối tài khoản  
3. Chiến dịch  
4. Hiệu quả  
5. AI phân tích  
6. Lịch sử đồng bộ  
7. Cài đặt  

## Data source

- Dashboard / campaigns / connections / sync-jobs: **PostgreSQL qua API** (`/ai-ads-manager/*`)
- Frontend **không** gọi Meta/Google Graph/Ads API trực tiếp
- Sync tiến độ: Socket.IO `ads:sync-progress` + polling khi job `QUEUED`/`RUNNING`

## Stack

- TanStack React Query (`use-ai-ads-manager.ts`)
- Shared Zod: `adsSyncJobPublicSchema`, `adsSyncProgressEventSchema`, `ADS_PERMISSIONS`
- shadcn Tabs / Table / Dialog / Select
- RBAC UI: `ads.read|connect|sync|analyze|manage`

## Filters

Platform · Account (provider) · Date range · Status (ACTIVE/PAUSED/OTHER)

## Paths

| File | Role |
|------|------|
| `apps/web/src/app/(app)/ads/page.tsx` | Route `/ads` |
| `apps/web/src/components/ai-ads-manager/ai-ads-manager-page.tsx` | Orchestrator |
| `apps/web/src/components/ai-ads-manager/tabs/*` | Tab panels |
| `GET /ai-ads-manager/sync-jobs` | Sync history |
