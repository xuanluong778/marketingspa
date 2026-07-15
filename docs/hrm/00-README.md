# HRM SaaS — Kế hoạch nâng cấp Quản Lý Nhân Sự

> Trạng thái: **Phase 0–2 đã triển khai** (Phase 3–5 chưa code)  
> Module UI: `/hrm/employees`, `/hrm/attendance`, `/hrm/leave`  
> Ngày cập nhật: 2026-07-15

## Mục tiêu

Nâng cấp roster nhân viên + KPI bán hàng thành **phân hệ HRM SaaS** chuyên nghiệp, đa chi nhánh, versioned policy, khóa kỳ công/lương, audit, queue nền — **không phá** CRM / Appointment / Order trừ khi bắt buộc.

## Tài liệu trong thư mục này

| File | Nội dung |
|------|----------|
| [01-inventory.md](./01-inventory.md) | Inventory stack, schema, API, RBAC hiện có |
| [02-schema-proposal.md](./02-schema-proposal.md) | Schema đề xuất (Phase 1→5) |
| [03-api-proposal.md](./03-api-proposal.md) | API đề xuất theo module |
| [04-migration-plan.md](./04-migration-plan.md) | Migration an toàn + rollback |
| [05-phase-roadmap.md](./05-phase-roadmap.md) | Lộ trình 5 giai đoạn + Definition of Done |

## Nguyên tắc bắt buộc (cross-cutting)

1. Mọi bảng HRM có `organizationId`; hầu hết có `branchId` (nullable chỉ khi org-wide thật sự).
2. Tính công / lương / hoa hồng **chỉ ở backend** (service engine + job), không tin client.
3. Policy (ca, phép, lương, hoa hồng, KPI) có `effectiveFrom` / `effectiveTo` + bảng **phiên bản** bất biến.
4. Timesheet / payroll period `LOCKED` → API từ chối mutate trực tiếp (chỉ adjustment có audit).
5. Thay đổi nhạy cảm → `AuditService.log` (+ metadata before/after).
6. Nhắc việc / chốt kỳ / gửi phiếu lương → Redis + BullMQ (`apps/worker`).
7. Tận dụng `Lead`, `Appointment`, `Order`/`OrderItem`/`Payment` cho KPI & commission — **không** rewrite CRM.
8. Triển khai **theo phase**; mỗi phase có migrate riêng, feature flag nếu cần.

## Rủi ro đã phát hiện (phải xử lý ở Phase 0 / đầu Phase 1)

- Role codes **lệch** giữa seed (`MARKETER`/`STAFF`), register (`MANAGER`/`SALE`…), UI/DTO.
- `Permission`/`RolePermission` có schema nhưng **không enforce** trên API.
- `Order` **không** có `employeeId` / seller — commission phải qua Lead assignee hoặc bổ sung field optional tối thiểu.
- JWT **không** mang `branchId` / permissions — cần mở rộng AuthUser.

## Quyết định chờ xác nhận trước khi Phase 1 code

1. **Seller trên Order:** thêm `Order.soldByEmployeeId?` (khuyến nghị) hay chỉ dùng Lead assignee?
2. **File storage:** local/S3/Supabase Storage cho hợp đồng & tài liệu?
3. **Chấm công:** ưu tiên QR / GPS / Kiosk Phase 2 — có bắt buộc cả 3?
4. **Projects (Phase 4):** board gắn `branchId` bắt buộc hay org-wide?

> **Phase 0 status (2026-07-15): IMPLEMENTED** — role align, `hrm.*` permissions, `PermissionsGuard`, JWT `permissions`/`employeeId`, audit employee + `ipAddress`. Chạy `pnpm hrm:phase0` trên môi trường DB. `Order.soldBy` để Phase 3.

> **Phase 1 status (2026-07-15): IMPLEMENTED** — schema departments/contracts/documents/invites; API `/api/v1/hrm/*`; UI `/hrm/employees` + hồ sơ tabs; `/employees` redirect. File storage MVP: URL metadata (+ upload local `/uploads/hrm`).
