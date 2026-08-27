# WAVE2 Precheck Report — 2026-08-26

```
WORKER_SINGLETON_GUARD = PASS
UPLOAD_VALIDATION = PASS
UPLOAD_UI_COMPAT = PASS
ZALO_WEBHOOK = PASS
PLATFORM_ADMIN_RBAC = PASS
WAVE2_PRECHECK = PASS
```

## Evidence (live)
- Second worker process EXIT:1 after 8 busy attempts; log: `FATAL: another worker already holds marketingspa:worker:singleton`
- PM2 `worker` remained single; BullMQ consumers unique (`queues_single=PASS`)
- Public `/uploads/public/wave2-precheck.png` → 200 `image/png`
- Private `/uploads/hrm/...` no auth → 401; HMAC signed → 200; bad sig → 401; `.exe` → 403
- Zalo: nosig → 401; valid official MAC → 200; retry → 200; bad sig → 401
- Merged `webhookSecret` onto active token OA connection (suffix 1676)
- `test-platform-admin-rbac` 8/8 — `mutation_requires_reason_min3` → 400
- `test-phase1-hardening` PASS; API/web health 200

## Key changes
- Worker Redis singleton lock `marketingspa:worker:singleton` (NX+TTL renew)
- Shared `upload-policy.ts` + signed URL; public prefix `uploads/public/`
- Zalo verify via `@marketingspa/shared` official MAC + sibling/env secret resolve
- `AdminReasonDto.reason` `@MinLength(3)` required
