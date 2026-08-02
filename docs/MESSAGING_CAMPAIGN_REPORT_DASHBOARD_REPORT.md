# Messaging Campaign Report, Tests & Safe Deploy (Prompt 10)

## Tổng quan

Dashboard chiến dịch, export CSV/XLSX (masked + audit), test bắt buộc, feature flag `MESSAGING_LIVE_SEND=false` mặc định, hướng dẫn triển khai / rollback an toàn.

## API mới

| Method | Path | Mô tả |
|--------|------|--------|
| GET | `/automation/messaging-campaigns/:id/dashboard` | Counters, rates, attribution, costs, errors |
| GET | `/automation/messaging-campaigns/:id/export?format=csv\|xlsx` | Export recipients; che ID/phone; audit |

Export:
- Scope `organizationId` bắt buộc (404 nếu khác org).
- Che `externalUserId` / phone trừ OWNER hoặc `automation.integration.manage` + `?reveal=1`.
- Audit `MESSAGING_CAMPAIGN_EXPORTED`.

## Feature flag

```env
MESSAGING_LIVE_SEND=false
```

Worker: nếu không `=== 'true'` → dry-run SENT với `providerMessageId=dryrun:{idempotencyKey}`, **không** gọi Meta/Zalo.

## Dashboard metrics

- Tổng / eligible / excluded / sent / delivered / read / replied / failed / blocked / opt-out
- Reply rate, delivery rate, read rate
- Attribution: appointments, orders, revenue (theo lead/customer sau `startedAt`)
- Cost / conversion
- Errors by reason code và Page/OA

## UI

Nút **Báo cáo** trên mỗi card chiến dịch → dialog dashboard + CSV/XLSX.

## Test bắt buộc

```bash
pnpm test:messaging-prompt10
pnpm test:messaging-eligibility
pnpm test:messaging-anti-spam
pnpm test:messaging-campaign-queue
```

Bao gồm: Messenger window/utility, Zalo Consult/Broadcast/ZBS, opt-out/blocked/quota/cooldown/quiet hours, idempotency, 429 backoff, pause/resume/cancel, reply stop, 10k không block API, export mask.

## Triển khai an toàn

1. **Backup**
   ```bash
   chmod +x scripts/backup-messaging-prompt10.sh
   ./scripts/backup-messaging-prompt10.sh
   ```
2. Migration (nếu có pending): `pnpm db:migrate:deploy`
3. Build: `pnpm --filter @marketingspa/{api,worker,web} build`
4. Giữ `MESSAGING_LIVE_SEND=false`
5. Restart API + worker + web
6. Test Page/OA nội bộ → gửi thử 1 khách (dry-run) → chiến dịch nhỏ
7. Chỉ bật live send khi sẵn sàng (toàn hệ thống hoặc theo quy trình org)

### Bật gửi thật (sau khi test OK)

```bash
# Trong .env
MESSAGING_LIVE_SEND=true
# Restart worker
```

Khuyến nghị: bật tạm thời, gửi thử 1 khách thật trên Page/OA nội bộ, xác nhận delivery, rồi mới chạy chiến dịch nhỏ.

## Rollback đầy đủ

1. Tắt live send ngay:
   ```bash
   # .env
   MESSAGING_LIVE_SEND=false
   # restart worker
   ```
2. Pause/cancel mọi campaign `RUNNING` trên UI hoặc API.
3. Rollback code (nếu cần):
   ```bash
   tar -xzf backups/prompt10_*/code.tgz -C /path/to/restore
   pnpm --filter @marketingspa/{api,worker,web} build
   # restart services
   ```
4. Rollback DB (chỉ khi migration hỏng — Prompt 10 **không** thêm migration mới):
   ```bash
   gunzip -c backups/prompt10_*/db.sql.gz | psql "$DATABASE_URL"
   ```
5. Xác minh: `curl /api/v1/health`, dry-run send vẫn hoạt động, không có provider HTTP khi flag OFF.

## Rủi ro còn lại

- Attribution appointment/order là soft join theo lead/customer sau `startedAt` — có thể nhiễu nếu khách mua từ nguồn khác.
- `MESSAGING_LIVE_SEND` là flag toàn hệ thống (không per-org trong DB); bật = mọi org worker process đó gửi thật.
- Export tối đa 50k dòng / request.
