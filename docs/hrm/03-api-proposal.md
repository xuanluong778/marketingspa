# 03 — API đề xuất

> Prefix: `/api/v1/hrm/...` (cô lập router; giữ `/employees` làm alias Phase 1 hoặc deprecate dần).  
> Guards: `JwtAuthGuard` + `TenantGuard` + **`PermissionsGuard`** (mới).  
> Mọi response/list filter cứng `organizationId` từ JWT; `branchId` từ query **và** validate membership.

## Cross-cutting

### AuthUser mở rộng

```ts
{
  id, email, name, role, organizationId,
  employeeId?: string,
  branchIds?: string[],      // nếu giới hạn chi nhánh
  permissions: string[],     // từ RolePermission
}
```

### Error chuẩn khóa kỳ

- `409 PERIOD_LOCKED` — sửa bảng công/lương đã khóa
- `403 FORBIDDEN` — thiếu permission / sai branch
- `422 POLICY_NOT_FOUND` — không có policy hiệu lực tại ngày

### Audit

Mọi endpoint ghi nhạy cảm gọi `AuditService.log` với `metadata: { before, after, reason? }`.

### Queues mới (`packages/shared` + worker)

| Queue | Việc |
|-------|------|
| `hrm-reminder-queue` | Nhắc deadline card / hợp đồng / duyệt phép |
| `hrm-attendance-rebuild` | Rebuild AttendanceDay từ punches |
| `hrm-payroll-calculate` | Tính payslip kỳ |
| `hrm-commission-calc` | Ledger hoa hồng từ Order/Appointment |
| `hrm-kpi-snapshot` | Snapshot KPI định kỳ |
| `hrm-automation` | Rule engine Phase 5 |

---

## Phase 1 — Profiles / accounts / contracts / docs / search / RBAC

| Method | Path | Permission | Mô tả |
|--------|------|------------|--------|
| GET | `/hrm/employees` | `hrm.employee.read` | Search/filter: `q`, `branchId`, `departmentId`, `status`, `employmentType`, `position`, pagination |
| GET | `/hrm/employees/:id` | `hrm.employee.read` | Profile + contracts summary + user link |
| POST | `/hrm/employees` | `hrm.employee.write` | Tạo hồ sơ |
| PATCH | `/hrm/employees/:id` | `hrm.employee.write` | Cập nhật (audit) |
| POST | `/hrm/employees/:id/deactivate` | `hrm.employee.write` | Terminate/soft |
| POST | `/hrm/employees/:id/account` | `hrm.account.manage` | Tạo/invite login + role |
| POST | `/hrm/employees/:id/account/reset-password` | `hrm.account.manage` | |
| GET/POST | `/hrm/employees/:id/contracts` | contract.* | |
| PATCH | `/hrm/contracts/:id` | `hrm.contract.write` | Version++ nếu đổi điều khoản chính |
| GET/POST | `/hrm/employees/:id/documents` | document.* | Upload metadata + URL |
| DELETE | `/hrm/documents/:id` | `hrm.document.write` | Soft/archive |
| GET/POST | `/hrm/departments` | `hrm.employee.write` | |
| GET | `/hrm/audit` | `hrm.audit.read` | Filter entity HRM |
| GET/PATCH | `/hrm/roles` + permissions | settings / owner | Đồng bộ RBAC (có thể gắn `/settings`) |

**Giữ tạm:** `GET /employees/:id/performance` → migrate sang `/hrm/employees/:id/kpi/preview` Phase 5.

---

## Phase 2 — Shifts / attendance / leave / OT / lock

| Method | Path | Ghi chú |
|--------|------|---------|
| CRUD | `/hrm/shift-policies` | Versioned; `POST :id/versions` |
| GET/POST | `/hrm/shift-assignments` | Phân ca theo ngày/branch |
| POST | `/hrm/attendance/punch` | QR/GPS/Kiosk — validate geo/token server-side |
| GET | `/hrm/attendance/days` | Bảng công theo kỳ |
| POST | `/hrm/attendance/adjustments` | Chỉ khi period OPEN hoặc adjustment khi LOCKED |
| GET/POST | `/hrm/timesheet-periods` | |
| POST | `/hrm/timesheet-periods/:id/lock` | Idempotent; audit; chặn sửa |
| POST | `/hrm/timesheet-periods/:id/unlock` | Permission cao + lý do bắt buộc |
| CRUD workflow | `/hrm/leave-requests`, `/hrm/overtime-requests` | `POST :id/approve\|reject` |

Tính `workedMinutes` / late / OT: **service backend** + optional rebuild queue.

---

## Phase 3 — Payroll / commission / payslip

| Method | Path | Ghi chú |
|--------|------|---------|
| CRUD | `/hrm/payroll-policies`, `/hrm/commission-policies` | Versioned |
| CRUD | `/hrm/compensation` | Lương hiệu lực theo ngày |
| POST | `/hrm/advances`, bonuses/penalties | Workflow duyệt |
| POST | `/hrm/payroll-periods` | Tạo kỳ |
| POST | `/hrm/payroll-periods/:id/calculate` | Enqueue BullMQ |
| GET | `/hrm/payroll-periods/:id/payslips` | |
| GET | `/hrm/payslips/:id` | |
| POST | `/hrm/payroll-periods/:id/lock` | Khóa — không sửa payslip FINAL |
| POST | `/hrm/commission/rebuild` | Quét Order/Appointment theo khoảng (org/branch) |

**Công thức (backend only):** client gửi tham số kỳ; server đọc dữ liệu đã khóa + policy version tại `effectiveDate`.

---

## Phase 4 — Boards / cards

| Method | Path |
|--------|------|
| CRUD | `/hrm/boards`, `/hrm/boards/:id/lists` |
| CRUD | `/hrm/cards` — move (`PATCH listId/position`), assign, due |
| CRUD | `/hrm/cards/:id/checklist`, `comments`, `attachments` |
| POST | `/hrm/cards/:id/recurrence` |

Realtime optional sau (Socket.IO đã có hạ tầng chatbot) — không bắt buộc Phase 4 MVP.

---

## Phase 5 — KPI / reminders / automation / reports

| Method | Path |
|--------|------|
| CRUD | `/hrm/kpi-policies` versioned |
| POST | `/hrm/kpi/snapshots/run` | Job |
| GET | `/hrm/kpi/snapshots` | Báo cáo |
| CRUD | `/hrm/automation-rules` | |
| GET | `/hrm/reports/attendance\|payroll\|productivity` | Aggregate org/branch |

Reminders: worker scan `dueAt` → notify (in-app / email placeholder).

---

## Surface UI đề xuất (web)

```
/employees                    → redirect /hrm
/hrm                          → dashboard HR ngắn
/hrm/employees                → roster + filters
/hrm/employees/[id]           → profile tabs
/hrm/attendance               → bảng công
/hrm/leave                    → duyệt phép
/hrm/payroll                  → kỳ lương / payslip
/hrm/projects                 → boards
/hrm/reports                  → KPI & báo cáo
```

Sidebar nhóm **Quản Lý Nhân Sự** → sub-nav theo phase (ẩn route chưa mở bằng feature flag).
