# Prompt 2 — Messaging Contact Identity

## Tóm tắt

Bổ sung database Prisma và API quản lý khách đã nhắn qua **Messenger** và **Zalo OA** (`MessagingContactIdentity`), hỗ trợ liên kết Customer/Lead, gộp thủ công và hoàn tác.

## File đã sửa / thêm

| File | Mô tả |
|------|--------|
| `packages/database/prisma/schema.prisma` | Model `MessagingContactIdentity`, `MessagingIdentityMergeLog`, enums |
| `packages/database/prisma/migrations/20260722150000_messaging_contact_identity/migration.sql` | Migration additive |
| `packages/database/src/messaging-phone.util.ts` | Chuẩn hóa SĐT VN + `integrationScopeKey` |
| `packages/database/src/index.ts` | Export util |
| `apps/api/src/messaging-identity/*` | Module API (service, controller, DTO) |
| `apps/api/src/common/services/tenant-ownership.service.ts` | `assertIntegration()` |
| `apps/api/src/app.module.ts` | Đăng ký `MessagingIdentityModule` |
| `scripts/test-messaging-contact-identity.ts` | E2E test |
| `package.json` | Script `test:messaging-contact-identity` |

## Migration

```bash
pnpm db:generate
pnpm db:migrate:deploy
```

Migration **chỉ thêm** bảng/enum/index — không sửa/xóa dữ liệu hiện có.

## API mới (`/messaging-identities`)

| Method | Path | Mô tả |
|--------|------|--------|
| GET | `/` | Danh sách + lọc (channel, customer, lead, search) |
| GET | `/:id` | Chi tiết |
| GET | `/:id/suggest-links` | Gợi ý theo SĐT xác minh / `sourceLeadId` — **không theo tên** |
| POST | `/upsert` | Tạo/cập nhật từ webhook |
| PATCH | `/:id/link` | Liên kết thủ công Customer/Lead |
| POST | `/:id/link-verified-phone` | Liên kết theo SĐT đã xác minh |
| POST | `/merge` | Gộp thủ công (Messenger + Zalo) |
| GET | `/merge-logs` | Lịch sử gộp |
| POST | `/merge-logs/:logId/undo` | Hoàn tác gộp |

## Unique & index

- `@@unique([organizationId, integrationScopeKey, externalUserId])` — dedupe chính (Messenger page / Zalo OA không có `Integration` row)
- `@@unique([organizationId, integrationId, externalUserId])` — khi có Integration
- Index: channel, customer, lead, phone, lastInbound, consent/opt-out, follow, merged, displayName

## Test

```bash
pnpm test:messaging-contact-identity
pnpm --filter @marketingspa/api build
```

## Rủi ro còn lại

- Webhook Messenger/Zalo chưa gọi `upsert()` — cần wire ở phase sau
- Gộp thủ công không tự đồng bộ metadata phức tạp giữa kênh
- `integrationId` nullable: unique PG cho phép nhiều NULL — dùng `integrationScopeKey` làm khóa thực tế

## Rollback

1. Revert code + xóa migration folder (nếu chưa deploy migration)
2. Nếu migration đã chạy: bảng mới rỗng, có thể `DROP TABLE messaging_identity_merge_logs, messaging_contact_identities` + enums (chỉ khi chắc chắn không có dữ liệu)
3. `pnpm db:generate` sau revert schema

**Không deploy production** cho đến khi test pass và user xác nhận.
