Hãy audit, tối ưu và nâng cấp MarketingAutoAZ (marketingspa) thành SaaS production-ready, multi-tenant, ổn định khi tăng user. Không rewrite kiến trúc, không microservice/Kubernetes nếu chưa có bottleneck thực tế. Reuse tối đa code/schema/service hiện có.

Stack hiện tại: Next.js 15 + React 19 + NestJS 10 + Prisma 6 + PostgreSQL 16 + PgBouncer + Redis 7 + BullMQ + Socket.IO Redis Adapter + PM2 + Nginx + Cloudflare R2 backup.

NGUYÊN TẮC BẮT BUỘC
Backup source + .env + DB trước mọi migration/deploy.
Không xóa hoặc làm mất production data.
Không prisma db push trên production; dùng migration chính thức + prisma migrate deploy.
Mọi dữ liệu bắt buộc scope organizationId.
Search/reuse schema, service, API, queue hiện có trước khi tạo mới.
Làm từng Wave; test PASS mới sang Wave tiếp theo.
Không redesign toàn website; giữ sidebar, header, topbar, navigation, design system và route đang hoạt động.
Không rollback UI về bản cũ.
Không tuyên bố PASS nếu chưa có evidence/test thật.
🔴 PROTECTED ZONE — FACEBOOK APP REVIEW

TUYỆT ĐỐI KHÔNG thay đổi:

Facebook OAuth flow
OAuth callback
scopes/permissions
pages_show_list
pages_read_engagement
pages_manage_posts
Facebook webhook
Page/Fanpage connection flow
Page selector
UI/tab/nút đang dùng quay video Facebook App Review
review test account behavior
API contract Facebook đang hoạt động

Nếu Wave nào cần dữ liệu Facebook, chỉ đọc/reuse integration hiện có.

Trước và sau mỗi Wave chạy git diff để xác nhận không chạm protected files.

Gate bắt buộc:

FACEBOOK_OAUTH_UNCHANGED = PASS
FACEBOOK_SCOPES_UNCHANGED = PASS
FACEBOOK_WEBHOOK_UNCHANGED = PASS
FACEBOOK_PAGE_FLOW_UNCHANGED = PASS
FACEBOOK_REVIEW_UI_UNCHANGED = PASS