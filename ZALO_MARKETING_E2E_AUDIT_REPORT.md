# Zalo Marketing — E2E Audit Report
Generated: 2026-08-21 (ICT)

## Fixes applied (Zalo-only)

| File | Change |
|------|--------|
| `.env` | Set `MESSAGING_LIVE_OA_IDS=526368405518511676` (Digi OA allowlist) so worker/API do **real** CS send instead of dry-run |
| `apps/worker/src/processors/automation-run.ts` | Wire **real** `sendZaloOaHttp` for `SEND_MESSAGE` when channel=`ZALO` (Messenger/Email untouched); respect live gate + eligibility + token refresh |
| `apps/worker/src/lib/messaging-eligibility.ts` | Prefer `providerKind=ZALO_OA` when channel is ZALO |

API/worker restarted after build.

## Evidence summary

| Hạng mục | PASS/FAIL | Evidence | Lỗi | File đã sửa |
|----------|-----------|----------|-----|-------------|
| OA ACTIVE Digi | PASS | OA `526368405518511676` name=Công ty Thế Giới Digi status=ACTIVE | | |
| Live-send gate | PASS | `MESSAGING_LIVE_SEND=false` but OA in `MESSAGING_LIVE_OA_IDS` → `effectiveLive=true` | Before: OA_IDS empty → dry-run | `.env` |
| OA test API | PASS | `POST /zalo/connections/:id/test` http=201 valid=true | | |
| TOKEN AUTO REFRESH (live Digi) | PASS | `POST .../refresh-token` http=201; `tokenExpiresAt` → 2026-08-22T15:06:01Z | | |
| TOKEN AUTO REFRESH (queue unit) | PASS | `test-zalo-oa-auto-refresh.cjs` 14/14 (skew 45m, claim, encrypt) | Stub mode in that script for queue unit | |
| Worker/queue running | PASS | `apps/worker/dist/index.js` live; messaging + zalo-oa-token-refresh queues registered | | |
| Multi-tenant OA | PASS | Other org `POST .../test` on Digi OA → **404** | | |
| Webhook signature unit | PASS | `test-zalo-webhook-signature.cjs` ALL UNIT CHECKS PASS | | |
| Webhook endpoint | PASS | `POST /api/v1/webhooks/zalo` probe ok=true | | |
| WEBHOOK STATUS (sent/delivered/seen) | FAIL | Digi org: webhookEvents7d=0, identities=0, convs=0 — no real inbound to update DELIVERED/READ | No OA inbound traffic / secret may not be capturing events | |
| Gửi thủ công (CS thật) | FAIL | No `ZALO_E2E_USER_ID`; Digi org **0** Zalo identities | Cannot call CS API without follower user_id in 48h window | |
| Gửi hẹn giờ (campaign) | FAIL | No eligible audience/followers in DB for Digi OA | empty_audience | |
| Automation tự gửi | FAIL* | Code path now calls `sendZaloOaHttp` when live+eligible; **runtime unproven** — 0 identities linked to lead/customer | no_recipient | `automation-run.ts` |
| ZBS templates / ZBS send | FAIL | No `ZBS_TEMPLATE` connection with credentials for Digi org | missing_zbs_connection | |
| Báo cáo campaign | FAIL | No completed Zalo campaign metrics for Digi | no_report_data | |

\*Automation: **code fix done**; E2E runtime remains FAIL until a real Zalo user follows/messages OA and is linked as identity.

## Root causes (why “ON” but not auto-sending before)

1. **`MESSAGING_LIVE_OA_IDS` empty + `MESSAGING_LIVE_SEND=false`** → `processMessagingSend` marked recipients **SENT dry-run** (`providerMessageId=dryrun:…`) without calling Zalo HTTP.
2. **Automation `SEND_MESSAGE` logged `simulated: true`** and never called `sendZaloOaHttp`.
3. **No Zalo contact identities / inbound webhooks** for Digi org → even with live gate, nothing to send to (Zalo CS requires `user_id` of a follower who interacted).
4. **No ZBS connection** → broadcast/template marketing path unavailable.

## Verdict

* **GỬI THỦ CÔNG: FAIL** (live gate+OA OK; thiếu `ZALO_E2E_USER_ID` / inbound)
* **GỬI HẸN GIỜ: FAIL** (thiếu audience/follower)
* **AUTOMATION TỰ GỬI: FAIL** (code đã sửa; chưa chứng minh runtime vì thiếu identity)
* **TOKEN AUTO REFRESH: PASS** (live Digi refresh + queue unit)
* **WEBHOOK STATUS: FAIL** (endpoint OK; không có event thật delivered/seen trong 7 ngày)
* **ZALO MARKETING PRODUCTION READY: NO**

## Unblock checklist (ops — no code)

1. User nhắn 1 tin thật vào OA Digi → webhook tạo identity (`externalUserId`).
2. Set `ZALO_E2E_USER_ID=<uid>` rồi chạy lại:
   - `node scripts/with-root-env.cjs node scripts/test-zalo-production-probes.cjs`
   - `node scripts/with-root-env.cjs node scripts/test-zalo-marketing-e2e-live.cjs`
3. Kết nối ZBS (appId/secret/token) trên UI Zalo Marketing nếu cần template/broadcast.
4. Lưu **OA Secret Key** trên connection để verify `x-zevent-signature`.
5. Giữ `MESSAGING_LIVE_OA_IDS` allowlist (không bật `MESSAGING_LIVE_SEND=true` toàn cục trừ khi chủ đích).
