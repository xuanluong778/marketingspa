# 02 — Schema đề xuất (Prisma)

> Quy ước: mọi model HRM có `organizationId`. `branchId` bắt buộc trừ entity policy org-wide.  
> Policy versioned: bảng `*Policy` (mutable current) + `*PolicyVersion` (immutable snapshot).  
> Kỳ khóa: `status IN (DRAFT, OPEN, LOCKED, ARCHIVED)` — `LOCKED`/`ARCHIVED` chỉ cho phép adjustment riêng.

## Phase 0 — Stabilize (alter tối thiểu)

Không tạo domain HRM đầy đủ. Chỉ:

1. Thống nhất role codes → `OWNER | MANAGER | MARKETING | SALE | TECHNICIAN | HR` (+ map alias seed cũ).
2. Seed permissions module `hrm.*`.
3. (Tùy chọn quyết định) `Order.soldByEmployeeId String?` + index — phục vụ commission Phase 3 **không đụng** logic CRM khác.

## Phase 1 — Hồ sơ, account, hợp đồng, tài liệu, RBAC

### Mở rộng `Employee`

```prisma
// Thêm fields (giữ bảng employees)
code              String?   // mã NV, unique theo org
departmentId      String?
managerId         String?   // self-relation
employmentType    EmploymentType @default(FULL_TIME) // FULL_TIME|PART_TIME|CONTRACT|PROBATION
status            EmployeeStatus @default(ACTIVE)     // ACTIVE|PROBATION|ON_LEAVE|TERMINATED
avatarUrl         String?
dateOfBirth       DateTime?
legalIdNumber     String?   // CCCD — encrypted at app layer nếu cần
address           String?
startDate         DateTime? // alias/migrate từ hiredAt
endDate           DateTime?
defaultBranchId   String?   // mirror branchId hoặc rename dần
metadata          Json?
```

### Models mới

```prisma
model Department {
  id, organizationId, branchId?, name, code?, parentId?, isActive
  @@unique([organizationId, code])
}

model EmployeeDocument {
  id, organizationId, branchId?, employeeId
  type DocumentType // CONTRACT|ID_CARD|CERTIFICATE|OTHER
  title, fileUrl, fileKey, mimeType, sizeBytes
  issuedAt?, expiresAt?, uploadedById
  createdAt
}

model EmploymentContract {
  id, organizationId, branchId?, employeeId
  code?, title, contractType // PROBATION|FIXED|INDEFINITE
  status ContractStatus // DRAFT|ACTIVE|EXPIRED|TERMINATED
  salaryBase Decimal?           // snapshot tại lúc ký (reference)
  currency String @default("VND")
  startDate, endDate?, signedAt?
  fileUrl?, notes?
  // versioning nhẹ
  version Int @default(1)
  previousContractId String?
  createdById?, createdAt, updatedAt
}

model EmployeeAccountInvite {
  id, organizationId, employeeId, email
  roleId, tokenHash, expiresAt, acceptedAt?, createdById
}
```

**Account login:** tiếp tục `User.employeeId` 1:1. Flow mới: Invite → tạo User + link Employee (không sửa Auth CRM).

### Permission codes Phase 1 (seed)

```
hrm.employee.read | hrm.employee.write
hrm.contract.read | hrm.contract.write
hrm.document.read | hrm.document.write
hrm.account.manage
hrm.audit.read
```

## Phase 2 — Ca, chấm công, phép, OT, khóa bảng công

```prisma
enum AttendanceMethod { QR GPS KIOSK MANUAL }
enum TimesheetStatus { OPEN LOCKED ARCHIVED }
enum LeaveRequestStatus { PENDING APPROVED REJECTED CANCELLED }
enum AttendancePunchType { CHECK_IN CHECK_OUT BREAK_START BREAK_END }

model WorkShiftPolicy {
  id, organizationId, branchId?
  name, code
  effectiveFrom, effectiveTo?
  currentVersion Int
  versions WorkShiftPolicyVersion[]
}

model WorkShiftPolicyVersion {
  id, policyId, version Int
  // immutable JSON: daysOfWeek, startTime, endTime, breakMinutes, graceMinutes, otRulesRef
  payload Json
  createdAt, createdById?
  @@unique([policyId, version])
}

model ShiftAssignment {
  id, organizationId, branchId, employeeId
  policyId?, date DateTime @db.Date
  startAt, endAt
  source // POLICY|MANUAL|SWAP
  locked Boolean @default(false)
}

model AttendancePunch {
  id, organizationId, branchId, employeeId
  punchedAt, type AttendancePunchType
  method AttendanceMethod
  latitude?, longitude?, accuracyM?
  qrTokenId?, kioskDeviceId?
  rawMetadata Json?
  // computed day key
  workDate DateTime @db.Date
}

model AttendanceDay {
  id, organizationId, branchId, employeeId
  workDate DateTime @db.Date
  checkInAt?, checkOutAt?
  workedMinutes Int @default(0)
  lateMinutes Int @default(0)
  earlyLeaveMinutes Int @default(0)
  otMinutes Int @default(0)
  status // PRESENT|ABSENT|LEAVE|HOLIDAY|INCOMPLETE
  source // AUTO|MANUAL_ADJ
  timesheetPeriodId?
  @@unique([organizationId, employeeId, workDate])
}

model TimesheetPeriod {
  id, organizationId, branchId?
  year, month           // hoặc fromDate/toDate
  status TimesheetStatus @default(OPEN)
  lockedAt?, lockedById?
  @@unique([organizationId, branchId, year, month])
}

model LeavePolicy {
  id, organizationId, branchId?
  name, effectiveFrom, effectiveTo?, currentVersion
  versions LeavePolicyVersion[]
}

model LeavePolicyVersion {
  id, policyId, version, payload Json // accrual, types, maxDays
}

model LeaveRequest {
  id, organizationId, branchId?, employeeId
  leaveType, fromDate, toDate, days Decimal
  status LeaveRequestStatus
  reason?, approverId?, decidedAt?, decisionNote?
}

model OvertimeRequest {
  id, organizationId, branchId, employeeId
  workDate, minutes, reason?
  status LeaveRequestStatus // reuse workflow enum hoặc OT enum
  approverId?, decidedAt?
}
```

**Khóa bảng công:** `TimesheetPeriod.LOCKED` → cấm sửa `AttendanceDay`/`Punch` trong kỳ; chỉ `AttendanceAdjustment` + audit.

```prisma
model AttendanceAdjustment {
  id, organizationId, timesheetPeriodId, employeeId, workDate
  field, oldValue, newValue, reason, createdById, createdAt
}
```

## Phase 3 — Lương, phụ cấp, thưởng/phạt, tạm ứng, hoa hồng, phiếu lương

```prisma
model PayrollPolicy {
  id, organizationId, branchId?
  name, effectiveFrom, effectiveTo?, currentVersion
  versions PayrollPolicyVersion[] // payload: base formula, allowances, deductions
}

model CommissionPolicy {
  id, organizationId, branchId?
  name, effectiveFrom, effectiveTo?, currentVersion
  versions CommissionPolicyVersion[]
  // payload examples:
  // { source: "ORDER_ITEM_SERVICE"|"ORDER_ITEM_PRODUCT"|"APPOINTMENT", ratePct, tiers[] }
}

model EmployeeCompensation {
  id, organizationId, employeeId
  effectiveFrom, effectiveTo?
  baseSalary Decimal
  allowances Json?   // snapshot đơn giản hoặc FK lines
  payrollPolicyId?, commissionPolicyId?
}

model PayrollPeriod {
  id, organizationId, branchId?
  year, month, status // OPEN|CALCULATING|LOCKED|PAID
  lockedAt?, lockedById?
}

model Payslip {
  id, organizationId, payrollPeriodId, employeeId, branchId?
  status // DRAFT|FINAL|VOID
  baseSalary, allowancesTotal, overtimePay, commissionTotal
  bonuses, penalties, advances, deductions, netPay
  currency, calculatedAt, version
  lines PayslipLine[]
  @@unique([payrollPeriodId, employeeId])
}

model PayslipLine {
  id, payslipId, type, label, amount, meta Json?
}

model SalaryAdvance {
  id, organizationId, employeeId, amount, requestedAt
  status, approvedById?, repaidPayrollPeriodId?
}

model BonusPenalty {
  id, organizationId, employeeId, branchId?
  kind // BONUS|PENALTY
  amount, reason, effectiveDate
  payrollPeriodId?, createdById
}

model CommissionLedger {
  id, organizationId, branchId?, employeeId
  sourceType // ORDER|ORDER_ITEM|APPOINTMENT|MANUAL
  sourceId
  amount, ratePct?, calculatedAt
  payrollPeriodId?, payslipId?
  policyVersionId?
}
```

**Engine backend:** job `hrm-payroll-calculate` đọc AttendanceDay (LOCKED), Compensation, CommissionLedger, BonusPenalty, Advance → ghi Payslip DRAFT → duyệt → FINAL; `PayrollPeriod.LOCKED` cấm sửa.

## Phase 4 — Projects kiểu Trello

```prisma
model ProjectBoard {
  id, organizationId, branchId?, name, description?, isArchived
  lists ProjectList[]
}

model ProjectList {
  id, boardId, organizationId, name, position Int
  cards ProjectCard[]
}

model ProjectCard {
  id, listId, organizationId, branchId?
  title, description?, position
  assigneeEmployeeId?, dueAt?
  priority?, isArchived
  recurrenceRule? // RRULE string nullable
  checklist ProjectChecklistItem[]
  comments ProjectComment[]
  attachments ProjectAttachment[]
}

model ProjectChecklistItem { id, cardId, title, isDone, position }
model ProjectComment { id, cardId, authorUserId, body, createdAt }
model ProjectAttachment { id, cardId, fileUrl, fileKey, uploadedById }
model ProjectCardActivity { id, cardId, actorUserId, action, metadata, createdAt }
```

Cách ly: mọi query `organizationId` (+ `branchId` nếu board thuộc chi nhánh).

## Phase 5 — KPI, nhắc việc, automation, báo cáo

```prisma
model KpiPolicy {
  id, organizationId, branchId?
  name, effectiveFrom, effectiveTo?, currentVersion
  versions KpiPolicyVersion[] // metrics defs + targets
}

model KpiSnapshot {
  id, organizationId, branchId?, employeeId
  periodFrom, periodTo
  metrics Json   // immutable computed
  score?, policyVersionId
  calculatedAt
}

model HrmReminder {
  id, organizationId, employeeId?, cardId?, type
  dueAt, status // PENDING|SENT|CANCELLED
  payload Json?
}

model HrmAutomationRule {
  id, organizationId, name, isActive
  trigger // CARD_DUE|CONTRACT_EXPIRE|TIMESHEET_LOCK|KPI_MISS
  conditions Json, actions Json
}
```

**Nguồn KPI:** đọc Lead/Appointment/Order (+ CommissionLedger, AttendanceDay) — không mutate CRM.

## Indexes bắt buộc (mọi phase)

- `(organizationId, …)` leading
- Unique period keys
- `(employeeId, workDate)`, `(payrollPeriodId, employeeId)`
- Audit tiếp tục dùng `AuditLog` hiện có (`entityType` = `Employee`|`Payslip`|…)

## Sơ đồ quan hệ (rút gọn)

```
Organization ─┬─ Branch ─┬─ Employee ─┬─ User
              │          │            ├─ Contract / Document
              │          │            ├─ ShiftAssignment / Attendance*
              │          │            ├─ Leave / OT
              │          │            ├─ Compensation / Payslip / Commission
              │          │            └─ ProjectCard assignee
              │          └─ TimesheetPeriod / PayrollPeriod (khóa kỳ)
              └─ *Policy + *PolicyVersion (effective dated)
Lead.assignedTo / Appointment.employee / Order.soldBy? → KPI & Commission engines
```
