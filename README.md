# MarketingSpa

Nền tảng SaaS marketing chuyên cho spa — giai đoạn MVP.

## Stack

| Layer       | Công nghệ                                                 |
| ----------- | --------------------------------------------------------- |
| Frontend    | Next.js 15, React 19, TypeScript, Tailwind CSS, shadcn/ui |
| Backend     | NestJS, REST API                                          |
| Database    | PostgreSQL + Prisma                                       |
| Cache/Queue | Redis + BullMQ                                            |
| Realtime    | Socket.IO                                                 |
| Worker      | BullMQ consumer                                           |
| AI          | FastAPI placeholder (chưa triển khai sâu)                 |
| Deploy      | Docker Compose, Nginx, SSL                                |
| Monitoring  | Sentry placeholder, backup PostgreSQL hằng ngày           |

## Cấu trúc monorepo

```
marketingspa/
├── apps/
│   ├── web/                    # Next.js frontend
│   ├── api/                    # NestJS REST + Socket.IO
│   ├── worker/                 # BullMQ worker
│   └── ai-service-placeholder/ # FastAPI stub
├── packages/
│   ├── config/                 # ESLint, Prettier, TS configs
│   ├── shared/                 # Types, constants, Zod schemas
│   └── database/               # Prisma schema, migrations, seed
├── docker/
│   ├── nginx/
│   └── postgres/
├── docker-compose.yml
└── docker-compose.prod.yml
```

## Yêu cầu hệ thống

- Node.js >= 20
- pnpm >= 9
- PostgreSQL 16 (hoặc dùng Docker)
- Redis 7 (hoặc dùng Docker)
- Docker & Docker Compose (cho deploy)

## Cài đặt local

### 1. Clone và cài dependencies

```bash
cd marketingspa
pnpm install
```

### 2. Cấu hình environment

```bash
cp .env.example .env
# Chỉnh sửa .env — đặc biệt DATABASE_URL, JWT_SECRET, POSTGRES_PASSWORD
```

### 3. Khởi động PostgreSQL & Redis

**Cách A — Docker (khuyến nghị):**

```bash
docker compose up -d postgres redis
```

**Cách B — Laragon/local:** đảm bảo PostgreSQL và Redis đang chạy, cập nhật `DATABASE_URL` và `REDIS_URL` trong `.env`.

### 4. Generate Prisma client

```bash
pnpm db:generate
```

## Chạy dev

Mở 3 terminal (hoặc dùng turbo):

```bash
# Terminal 1 — API
pnpm --filter @marketingspa/api dev

# Terminal 2 — Worker
pnpm --filter @marketingspa/worker dev

# Terminal 3 — Web
pnpm --filter @marketingspa/web dev
```

Hoặc chạy tất cả:

```bash
pnpm dev
```

Truy cập:

- Web: http://localhost:3000
- API: http://localhost:4000/api/v1
- Health: http://localhost:4000/api/v1/health

## Migrate database

```bash
# Development — tạo/áp dụng migration
pnpm db:migrate

# Production — chỉ áp dụng migration có sẵn
pnpm db:migrate:deploy
```

## Seed dữ liệu mẫu

```bash
pnpm db:seed
```

Tài khoản demo:

- Email: `admin@demo-spa.com`
- Password: `password123`

## Build production

```bash
pnpm db:generate
pnpm build
```

Build từng app:

```bash
pnpm --filter @marketingspa/api build
pnpm --filter @marketingspa/web build
pnpm --filter @marketingspa/worker build
```

## Deploy VPS (Docker Compose)

### 1. Chuẩn bị VPS

- Ubuntu 22.04+ (khuyến nghị)
- Cài Docker & Docker Compose
- Trỏ domain A record về IP VPS

### 2. Cấu hình production

```bash
cp .env.example .env
# Đặt DOMAIN, SSL_EMAIL, mật khẩu mạnh, JWT_SECRET
```

### 3. Build và chạy

```bash
docker compose build
docker compose up -d
```

### 4. Migrate & seed (lần đầu)

```bash
docker compose exec api sh -c "cd /app && npx prisma migrate deploy"
# Hoặc chạy migrate từ host nếu có pnpm:
pnpm db:migrate:deploy
pnpm db:seed
```

### 5. SSL (Let's Encrypt)

```bash
# Tạo thư mục SSL
mkdir -p docker/ssl

# Lấy certificate lần đầu (thay your-domain.com)
docker run -it --rm \
  -v $(pwd)/docker/ssl:/etc/letsencrypt \
  -v $(pwd)/docker/certbot/www:/var/www/certbot \
  certbot/certbot certonly --webroot -w /var/www/certbot \
  -d your-domain.com --email admin@your-domain.com --agree-tos

# Copy/symlink cert vào docker/ssl/fullchain.pem và privkey.pem
# Sau đó chạy với production override:
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### 6. Nginx

- Dev: `docker/nginx/nginx.dev.conf` (port 80, proxy web + api)
- Prod: `docker/nginx/nginx.conf` (HTTPS, redirect HTTP→HTTPS)

### 7. Backup PostgreSQL

**Tự động (Docker):** container `backup` chạy `docker/postgres/backup.sh` mỗi 24h.  
**Worker queue:** job `backup-queue` chạy lúc 2:00 hằng ngày (BullMQ repeatable).  
**Thủ công (local):**

```bash
# Linux/macOS
chmod +x scripts/backup-postgres.sh
./scripts/backup-postgres.sh

# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File scripts/backup-postgres.ps1
```

Backup lưu tại thư mục `./backups` (hoặc `BACKUP_DIR`).  
Retention: `BACKUP_RETENTION_DAYS` (mặc định 7 ngày).

#### Khôi phục database từ backup

```bash
# Giải nén (nếu file .sql.gz)
gunzip -c backups/marketingspa_YYYYMMDD_HHMMSS.sql.gz > restore.sql

# Hoặc dùng file .sql thẳng (Windows script)
# restore.sql

# Drop & tạo lại DB (cẩn thận — mất dữ liệu hiện tại)
psql -U postgres -c "DROP DATABASE IF EXISTS marketingspa;"
psql -U postgres -c "CREATE DATABASE marketingspa OWNER marketingspa;"

# Restore
psql "postgresql://marketingspa:PASSWORD@localhost:5432/marketingspa" -f restore.sql

# Hoặc với DATABASE_URL
psql "$DATABASE_URL" -f restore.sql
```

Sau restore, chạy migration nếu cần đồng bộ schema:

```bash
pnpm db:migrate:deploy
```

### 8. Worker queues (BullMQ)

| Queue                        | Mô tả                                            |
| ---------------------------- | ------------------------------------------------ |
| `lead-alert-queue`           | Quét lead NEW > 10 phút, push `lead:stale-alert` |
| `appointment-reminder-queue` | Nhắc lịch giả lập 24h / 2h, ghi AutomationLog    |
| `automation-message-queue`   | Gửi tin automation giả lập theo job              |
| `daily-report-queue`         | Báo cáo vận hành ngày → `ai_reports`             |
| `backup-queue`               | Chạy script backup PostgreSQL                    |
| `campaign-send`              | Gửi campaign marketing (có sẵn)                  |

Chạy worker: `pnpm --filter @marketingspa/worker dev`

### 9. Realtime (Socket.IO)

Namespace: `/events` — client join room `org:{organizationId}`.

| Event                  | Khi nào                           |
| ---------------------- | --------------------------------- |
| `lead:new`             | Tạo lead mới (API)                |
| `lead:stale-alert`     | Worker phát hiện lead quá 10 phút |
| `appointment:new`      | Tạo lịch hẹn (API)                |
| `appointment:reminder` | Worker nhắc lịch giả lập          |
| `daily-report:ready`   | Worker tạo báo cáo ngày           |

Worker publish qua Redis channel `marketingspa:realtime:events` → API forward Socket.IO.

### 10. Sentry

Cấu hình `SENTRY_DSN` và `NEXT_PUBLIC_SENTRY_DSN` trong `.env`.
Code placeholder tại `apps/api/src/sentry.ts` và `apps/web/src/lib/sentry.ts`.

## API endpoints (MVP)

| Method | Path                         | Mô tả                        |
| ------ | ---------------------------- | ---------------------------- |
| GET    | `/api/v1/health`             | Health check DB + Redis      |
| POST   | `/api/v1/auth/login`         | Đăng nhập                    |
| GET    | `/api/v1/campaigns`          | Danh sách campaign (JWT)     |
| POST   | `/api/v1/campaigns`          | Tạo campaign (JWT)           |
| POST   | `/api/v1/campaigns/:id/send` | Đưa campaign vào queue (JWT) |
| GET    | `/api/v1/contacts`           | Danh sách khách hàng (JWT)   |
| POST   | `/api/v1/contacts`           | Tạo khách hàng (JWT)         |

WebSocket namespace: `/events` — event `campaign:update`

## Scripts hữu ích

```bash
pnpm lint              # Lint toàn monorepo
pnpm format            # Prettier format
pnpm db:studio         # Prisma Studio
```

## License

Private — MVP internal use.
