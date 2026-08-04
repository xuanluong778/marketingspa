# Messaging Anti-spam, Templates, Reply & CRM (Prompt 9)

## Models / Migration

- `MessagingOrgPolicy` — chống spam theo org (timezone, quiet hours, daily limit, campaign cooldown, channel rate, stop on reply/opt-out, chatbot/task)
- `MessageTemplate` mở rộng: campaignKind, providerMode, providerTemplateId, approvalStatus, media/CTA, variableFallbacks, contentBlocks
- Migration: `20260722190000_messaging_org_policy_templates`

## API

| Method | Path | Mô tả |
|--------|------|--------|
| GET/PATCH | `/automation/messaging-policy` | Đọc/sửa chính sách org |
| POST | `/automation/templates/:id/preview` | Preview nội dung + fallback |

## Worker

- **Quiet hours**: eligibility `QUIET_HOURS` → `moveToDelayed(nextEligibleAt)`, status giữ `QUEUED` — **không** failed
- Rate limit theo channel từ policy
- Render template với `variableFallbacks`
- **Reply**: REPLIED + cancel pending + Chatbot CSKH handover + CrmTask + assign lead + attribution trong campaign.metadata
- **Opt-out keyword**: MessagingSuppression + cancel pending + consent OPTED_OUT

## UI

- Form mẫu tin: loại chiến dịch, provider mode, duyệt, CTA/ảnh, fallback, preview
- Panel chống spam trong tab **Kết nối kênh**

## Test

```bash
pnpm test:messaging-anti-spam
pnpm test:messaging-eligibility
pnpm --filter @marketingspa/api build
pnpm --filter @marketingspa/worker build
pnpm --filter @marketingspa/web build
```

## Rollback

```sql
DROP TABLE IF EXISTS messaging_org_policies;
ALTER TABLE message_templates DROP COLUMN IF EXISTS campaign_kind, ...;
```
