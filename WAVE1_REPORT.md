# WAVE 1 Report — 2026-08-26

## Gates
DUAL_WORKER = PASS
API_PRIVATE = PASS
CORS = PASS
UPLOAD_SECURITY = PASS
CREDIT_RACE = PASS
WEBHOOK_SECURITY = PASS
SSRF = PASS
E2E = PASS
WAVE_1 = PASS

## Evidence (live)
- Listen: 127.0.0.1:4000 (API), 127.0.0.1:3002 (web); public :4000 refused
- HTTPS home/api health 200; Socket.IO polling 200
- CORS allow `https://marketingautoaz.com` ACAO set; evil origin no ACAO
- Uploads no JWT → 401; path traversal → 400/404; .exe → 401
- Meta nosig → 403; Messenger nosig → 401; Zalo nosig → 401; SePay noauth → 401
- BullMQ queue clients: one consumer per queue; single PM2 worker
- Credit concurrency N=40 same idempotency key → 1 txn / -1 balance
- SSRF blocks localhost/private/metadata/IPv6 [::1] in assertPublicHttpUrl + website-crawl
- test-p0-security, test-phase1-hardening, test-automation-security, test-sepay-billing (10/10), test-work-management-rbac PASS
- test-platform-admin-rbac 7/8 (pre-existing mutation_requires_reason_min3 → 201)

## Root causes fixed
1. Orphan www BullMQ worker competed with PM2 worker
2. API/web listened on 0.0.0.0
3. CORS origin:true + credentials reflected any Origin
4. Nest useStaticAssets made /uploads public
5. Credit ledger checked idempotency before lock; P2002 recover could double-apply wallet
6. Meta/Zalo soft-open when secret missing; Zalo controller returned 200 before auth
7. website-crawl lacked shared SSRF guard; IPv6 hostname kept brackets so isIP failed

## Remaining risks
- Upload *write* paths: size limits exist; MIME/ext allowlists not uniform across all controllers
- Clients using bare `<img src="/uploads/...">` without JWT/`access_token` break
- Zalo OA without webhookSecret configured will get 401 (intentional fail-closed)
- CORS deny may surface as Nest 404 on OPTIONS (no ACAO — browser-safe)
- www source tree not fully mirrored to release WAVE1 edits
- No automated guard preventing starting a second worker from www cwd
