# Google Ads OAuth + API thật

**Date:** 2026-07-24  
**Scope:** Thay paste refresh token / mock bằng OAuth server-side + Google Ads API + BullMQ.

## Yêu cầu → triển khai

| Yêu cầu | Cách làm |
|--------|----------|
| OAuth Client ID/Secret | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Developer Token | `GOOGLE_ADS_DEVELOPER_TOKEN` (server-only) |
| Refresh token mã hóa backend | `AdConnection.encryptedCredentials` `{ refreshToken }` |
| Customer ID + Login Customer ID | `externalAccountId` + `metadata.loginCustomerId` |
| OAuth state CSRF + TTL + one-time | HMAC + Redis NX/`GETDEL` (`oauth:google-ads:state:`) |
| Không nhận RT từ FE | `POST connections/google` reject nếu có `refreshToken` |
| Không trả token API/log | Public DTO + `assertNoCredentialLeak` / `redactForAudit` |
| List customer accounts | `GET .../google/customers` |
| Sync campaign/ad group/ad/metrics BullMQ | `enqueueGoogleSync` + worker Google branch |
| Chuẩn hóa lỗi Google | `GoogleAdsTokenExpiredError` / `Permission` / `RateLimit` |
| Org-scoped + RBAC | `AdConnection` unique org+provider; `ads.connect` / `ads.sync` |

## API

```
GET  /ad-performance/google/oauth/start
GET  /ad-performance/google/oauth/callback   (public)
GET  /ad-performance/google/status
GET  /ad-performance/google/customers
POST /ad-performance/google/customer
POST /ad-performance/google/sync
GET  /ad-performance/google/sync-jobs/:jobId
DELETE /ad-performance/google/disconnect

GET  /ai-ads-manager/google/oauth/start
```

## Env

Xem `.env.example` — `GOOGLE_*` + redirect URI phải khớp Google Cloud Console.

## Test

```bash
pnpm test:ads-google-oauth
pnpm test:ads-unification
```
