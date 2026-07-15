# 01 — Inventory hiện trạng (HRM)

## 1. Stack

| Lớp | Công nghệ hiện có | Ghi chú HRM |
|-----|-------------------|-------------|
| Web | Next.js 15, React 19, TanStack Query, shadcn/ui, Tailwind | Tab `/employees` |
| API | NestJS, JWT, TenantGuard | Chưa PermissionsGuard |
| DB | PostgreSQL + Prisma | Employee mỏng |
| Cache/Queue | Redis, BullMQ, `apps/worker` | Chưa queue HRM |
| Multi-tenant | `organizationId` trên service | Branch filter chưa bắt buộc |
| Audit | `AuditService` + `AuditLog` | Chỉ CRM callers |
| Hosting DB | Supabase pooler (dev `.env`) | Không ảnh hưởng design |

## 2. Schema liên quan HRM

### Đã có

- `Organization`, `Branch`, `User`, `Role`, `Permission`, `RolePermission`
- `Employee` (`name`, `phone`, `email`, `position`, `branchId?`, `isActive`, `hiredAt?`) — 1:1 optional `User`
- `Lead.assignedToId` → Employee
- `Appointment.employeeId` → Employee
- `Order` / `OrderItem` / `Payment` — **không** FK employee
- `AuditLog` (`action`, `entityType`, `entityId`, `metadata`, `ipAddress?`)

### Chưa có (greenfield)

Hợp đồng, tài liệu HR, department/manager, ca/shift, attendance, leave, OT, payroll, commission policy/ledger, payslip, project board/card, KPI policy/snapshot, HR reminder jobs.

## 3. API hiện có

### Employees (`JwtAuthGuard` + `TenantGuard`)

| Method | Path | Hành vi |
|--------|------|---------|
| GET | `/employees` | List + `search`/`branchId`/`isActive` |
| GET | `/employees/:id` | Detail |
| GET | `/employees/:id/performance` | KPI bán hàng theo khoảng ngày |
| POST | `/employees` | Create (không tạo User) |
| PATCH | `/employees/:id` | Update; `roleCode` nếu có User |
| DELETE | `/employees/:id` | Soft: `isActive=false` |

### Branches

`GET/POST/PATCH/DELETE /organizations/branches` (delete = soft).

### Auth

Login/register/refresh. Register seed roles từ `DEFAULT_ROLE_SEEDS`. JWT: `id`, `email`, `name`, `role`, `organizationId`.

## 4. Phân quyền

| Thành phần | Status |
|------------|--------|
| Bảng Permission / Role / RolePermission | Có |
| Seed permissions CRM/finance | Có (demo) |
| Enforce trên controller | **Không** |
| UI quản lý role/permission | **Không** |
| Branch-scoped ACL | **Không** |

### Drift role codes (bug hiện tại)

| Nguồn | Codes |
|-------|--------|
| Seed demo | `OWNER`, `MARKETER`, `STAFF` |
| `roles.ts` / register | `OWNER`, `MANAGER`, `MARKETING`, `SALE`, `TECHNICIAN` |
| Employee DTO + Web UI | Giống `roles.ts` |
| Shared `USER_ROLE` | `OWNER`, `ADMIN`, `MARKETER`, `STAFF` |

→ Đổi role trên UI có thể `Role X không tồn tại` với org đã seed.

## 5. Web UI

- Nav: **Quản Lý Nhân Sự** → `/employees`
- List table: tên, SĐT, email, chi nhánh, vai trò, actions
- Dialog: chức vụ dropdown, chi nhánh + thêm nhanh, vai trò
- Panel KPI hiệu suất (Lead/Appointment/revenue)
- Confirm soft-delete

## 6. Queue hiện có (không HRM)

`campaign-send`, `lead-alert`, `appointment-reminder`, `automation-message`, `daily-report`, `backup`, `auto-post-publish`.

## 7. EXISTS vs MISSING (tóm tắt)

| Nhóm | Hiện trạng |
|------|------------|
| Hồ sơ NV mỏng + KPI sales | EXISTS |
| Login account gắn NV | PARTIAL (1:1, tạo tay lệch) |
| Contracts / docs / search UX đầy đủ | MISSING |
| RBAC enforce + audit HR | MISSING |
| Ca / chấm công / phép / khóa bảng công | MISSING |
| Lương / phụ cấp / hoa hồng / phiếu lương | MISSING |
| Project board kiểu Trello | MISSING |
| KPI policy + reminder automation | MISSING (KPI ad-hoc GET only) |

## 8. File inventory (path)

```
apps/web/src/app/(app)/employees/page.tsx
apps/web/src/components/employees/employee-form-dialog.tsx
apps/web/src/components/employees/employee-performance-panel.tsx
apps/web/src/hooks/use-employees.ts
apps/web/src/config/navigation.ts
apps/api/src/employees/*
apps/api/src/organizations/*
apps/api/src/auth/*
apps/api/src/audit/*
apps/api/src/common/guards/{auth,tenant}.guard.ts
apps/api/src/common/constants/roles.ts
apps/api/src/queue/*
apps/worker/src/{index,schedulers,processors}/*
packages/database/prisma/schema.prisma  (Employee, User, Role, AuditLog, Lead, Appointment, Order)
packages/database/prisma/seed.ts
```
