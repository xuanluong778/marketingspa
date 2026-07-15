# 05 — Lộ trình 5 giai đoạn + Phase 0

## Tổng quan timeline (ước lượng)

| Phase | Phạm vi | Ước lượng relative | Phụ thuộc |
|-------|---------|-------------------|-----------|
| **0** | Align roles, PermissionsGuard, audit IP, Order.soldBy? | 0.5–1 | Chốt quyết định |
| **1** | Hồ sơ, account, HĐ, tài liệu, search/lọc, RBAC HRM | 1 | Phase 0 |
| **2** | Ca, phân ca, chấm công, phép, OT, khóa bảng công | 1.5 | Phase 1 |
| **3** | Lương, PC, thưởng/phạt, tạm ứng, HH, phiếu lương | 1.5 | Phase 2 (công), soldBy |
| **4** | Board/List/Card Trello-like | 1 | Phase 1 (assignee) |
| **5** | KPI policy, reminder, automation, báo cáo | 1 | 2–4 data |

Không làm song song 2–3–4 trên cùng migration DB nếu chưa review; **4 có thể song song 2** sau Phase 1 nếu đội đủ người.

---

## Phase 0 — Stabilize (bắt buộc trước)

**Deliverables**
- Unify role taxonomy + migration data alias
- Seed `hrm.*` permissions
- `PermissionsGuard` + decorator `@RequirePermissions(...)`
- Mở rộng JWT permissions / employeeId
- Audit: gắn `ipAddress` + log employee mutations hiện tại
- (Optional) `Order.soldByEmployeeId`

**DoD:** Role UI không 404; endpoint employees có permission check; audit có bản ghi khi PATCH employee.

---

## Phase 1 — Hồ sơ & RBAC

**Backend:** schema departments/contracts/documents/invite; module `hrm` Nest; engines chưa có.

**Frontend:** `/hrm/employees` list filters; profile tabs (Info, Account, Contracts, Docs); nav sub-items.

**DoD**
- [x] Filter/search theo branch, status, position, q
- [x] Invite/create login gắn employee + role
- [x] Upload/list documents, CRUD contracts có version
- [x] Mọi write nhạy cảm có audit
- [x] Tenant: không đọc cross-org (test)

**Không làm:** chấm công, lương, board.

---

## Phase 2 — Thời gian & công

**DoD**
- [x] Policy ca versioned + phân ca
- [x] Punch QR/GPS/Kiosk (ít nhất 1 method MVP + MANUAL)
- [x] AttendanceDay tính ở backend
- [x] Leave/OT approve flow
- [x] Lock timesheet period → API từ chối sửa trực tiếp
- [x] Queue rebuild attendance

**Không làm:** tính lương tiền (chỉ số phút).

---

## Phase 3 — Payroll & commission

**DoD**
- [ ] Compensation + payroll/commission policies versioned
- [ ] CommissionLedger từ Order/Appointment (read CRM)
- [ ] Calculate payslip job; DRAFT → FINAL
- [ ] Advances / bonus / penalty
- [ ] Lock payroll period
- [ ] PDF/JSON payslip view (MVP JSON UI đủ)

**Không làm:** bảo hiểm/thuế phức tạp VN đầy đủ (có thể stub deduction lines).

---

## Phase 4 — Projects

**DoD**
- [ ] Board/List/Card CRUD, drag position API
- [ ] Assignee employee, checklist, comment, file, due
- [ ] Recurring card (RRULE → tạo card mới via worker)
- [ ] Cô lập org/branch

**Không làm:** Gantt/workload heavy.

---

## Phase 5 — KPI & automation

**DoD**
- [ ] KpiPolicy versioned + snapshot job
- [ ] Dùng Lead/Appointment/Order + attendance + commission
- [ ] Reminder queue (card due, contract expiry, leave pending)
- [ ] Automation rules tối thiểu 3 trigger
- [ ] Report pages (attendance, payroll summary, KPI)

---

## Ma trận module × nguyên tắc

| Nguyên tắc | P1 | P2 | P3 | P4 | P5 |
|------------|----|----|----|----|-----|
| orgId + branchId isolation | ✓ | ✓ | ✓ | ✓ | ✓ |
| Backend-only calc | — | công | lương/HH | — | KPI |
| Policy version + effective date | HĐ nhẹ | ca/phép | lương/HH | — | KPI |
| Lock kỳ | — | timesheet | payroll | — | — |
| Audit sensitive | ✓ | ✓ | ✓ | card archive | rules |
| BullMQ | invite email? | rebuild | calculate | recurrence | reminder/KPI |
| Không phá CRM | ✓ | ✓ | read + soldBy? | ✓ | read |

---

## Đề xuất thứ tự code khi được green-light

1. Xác nhận 4 quyết định trong `00-README.md`
2. PR Phase 0 (RBAC + role migrate + audit employee)
3. PR Phase 1 schema + API + UI filters/profile
4. ... tuần tự theo DoD

**Chưa viết code domain HRM** cho đến khi review tài liệu này.
