# 04 — Kế hoạch migration an toàn

## Nguyên tắc

1. **Additive-first:** thêm cột/bảng nullable → backfill → NOT NULL/constraint.
2. Mỗi phase **một thư mục migration Prisma** riêng; có thể deploy DB trước code (backward compatible).
3. Không rename phá hủy `employees` trong Phase 1; `hiredAt` giữ, map sang `startDate` dần.
4. Không sửa bảng CRM (`leads`, `appointments`, `orders`…) trừ cột **optional** đã chốt (`orders.sold_by_employee_id`).
5. Policy version: insert version mới, không UPDATE payload cũ.
6. Kỳ `LOCKED`: enforce ở ứng dụng + optional DB trigger/check later.
7. Luôn có script **dry-run** trên staging/Supabase branch trước production.
8. Backup: `pg_dump` / Supabase PITR trước migrate production.

## Phase 0 — Role & permission align (trước HRM lớn)

### Bước

1. Snapshot role codes hiện có: `SELECT code, count(*) FROM roles GROUP BY 1`.
2. Migration data (SQL trong migrate hoặc script `tsx`):
   - `MARKETER` → `MARKETING`
   - `STAFF` → `TECHNICIAN` (hoặc `SALE` — **chốt trước khi chạy**)
   - Tạo thiếu: `MANAGER`, `SALE`, `HR` theo org
3. Seed permissions `hrm.*` + gán OWNER (all), MANAGER (hrm read/write trừ payroll lock), HR (hrm.*), SALE/TECHNICIAN (self-read).
4. Deploy `PermissionsGuard` **shadow mode** (log deny) 1–2 ngày → enforce.

### Rollback

- Giữ bảng mapping alias trong code 1 phiên bản.
- Revert guard flag `HRM_PERMISSIONS_ENFORCE=false`.

## Phase 1 — Profile / contracts / docs

### Migration SQL ý tưởng

```
ALTER TABLE employees ADD COLUMN code TEXT;
ALTER TABLE employees ADD COLUMN department_id UUID;
ALTER TABLE employees ADD COLUMN manager_id UUID;
-- enums + columns status, employment_type, ...
CREATE TABLE departments (... organization_id NOT NULL, ...);
CREATE TABLE employment_contracts (...);
CREATE TABLE employee_documents (...);
CREATE UNIQUE INDEX employees_org_code_uidx ON employees(organization_id, code) WHERE code IS NOT NULL;
```

### Backfill

- `startDate = hiredAt` nếu null
- `status = ACTIVE` where `is_active`, else `TERMINATED`
- `branchId` giữ nguyên

### Rủi ro

- Email employee trùng User email khi invite → unique check trước invite.
- Upload file: chỉ lưu URL/key; virus scan later.

### Rollback

- Drop bảng mới; `ALTER DROP COLUMN` mới (mất data phase1 docs — chấp nhận nếu chưa prod).

## Phase 2 — Attendance

### Thứ tự

1. Tạo policies + assignments + punches + days + periods (status OPEN).
2. Deploy API punch + rebuild job.
3. Sau ổn định mới enable **lock** endpoint.
4. Không tạo period LOCKED mặc định.

### Rủi ro

- Clock skew / GPS spoof → server geofence + audit rawMetadata.
- Double punch → idempotent key `(employeeId, type, punchedAt bucket)`.

### Rollback

- Disable routes; bảng giữ (không xóa punches prod).

## Phase 3 — Payroll / commission

### Thứ tự cực kỳ quan trọng

1. Policies + compensation + ledger tables.
2. Optional: `orders.sold_by_employee_id` nullable + backfill heuristic từ Lead assignee gần nhất (script riêng, review).
3. Calculate → Payslip **DRAFT** only trên staging.
4. Lock period sau khi plan nghiệm thu.
5. Payslip FINAL bất biến; correction = VOID + payslip mới hoặc adjustment line + audit.

### Rủi ro tiền

- Làm tròn Decimal: thống nhất `Decimal(12,2)` banker’s hoặc half-up — ghi trong policy version.
- Commission double-count: unique `(sourceType, sourceId, employeeId)`.

### Rollback

- Không xóa period đã LOCKED trên prod; chỉ `VOID` payslip DRAFT.

## Phase 4 — Projects

Additive thuần. Không đụng payroll. Feature flag `HRM_PROJECTS_ENABLED`.

## Phase 5 — KPI / automation

- Snapshot tables + queues.
- Jobs đọc-only CRM.
- Rate-limit rebuild KPI để khỏi spam DB.

## Checklist mỗi lần migrate (Supabase / prod)

- [ ] Backup / PITR window
- [ ] `prisma migrate deploy` trên staging
- [ ] Seed permissions
- [ ] Smoke: login, list employees, 1 write + audit row
- [ ] Worker consume queue mới (nếu có)
- [ ] Monitor lỗi 403/409 sau enforce RBAC
- [ ] Document rollback owner + ETA

## Tương thích API cũ

| Cũ | Mới | Chiến lược |
|----|-----|------------|
| `GET /employees` | `GET /hrm/employees` | Proxy 1–2 phase hoặc dual-route |
| `DELETE /employees/:id` | `POST .../deactivate` | Alias |
| performance GET | `/hrm/.../kpi` | Giữ cũ đến Phase 5 |

Web đổi hook dần; không big-bang URL nếu app store cache.
