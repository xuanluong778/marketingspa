-- HRM Phase 2: shifts, attendance, timesheet lock, leave, overtime

CREATE TYPE "AttendanceMethod" AS ENUM ('QR', 'GPS', 'KIOSK', 'MANUAL');
CREATE TYPE "TimesheetStatus" AS ENUM ('OPEN', 'LOCKED', 'ARCHIVED');
CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "AttendancePunchType" AS ENUM ('CHECK_IN', 'CHECK_OUT', 'BREAK_START', 'BREAK_END');
CREATE TYPE "AttendanceDayStatus" AS ENUM ('PRESENT', 'ABSENT', 'LEAVE', 'HOLIDAY', 'INCOMPLETE');
CREATE TYPE "ShiftAssignmentSource" AS ENUM ('POLICY', 'MANUAL', 'SWAP');
CREATE TYPE "LeaveType" AS ENUM ('ANNUAL', 'SICK', 'UNPAID', 'MATERNITY', 'OTHER');

CREATE TABLE "work_shift_policies" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "work_shift_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "work_shift_policy_versions" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "work_shift_policy_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shift_assignments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "policy_id" TEXT,
    "work_date" DATE NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "source" "ShiftAssignmentSource" NOT NULL DEFAULT 'MANUAL',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "shift_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "attendance_qr_tokens" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attendance_qr_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "attendance_punches" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "work_date" DATE NOT NULL,
    "punched_at" TIMESTAMP(3) NOT NULL,
    "type" "AttendancePunchType" NOT NULL,
    "method" "AttendanceMethod" NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracy_m" DOUBLE PRECISION,
    "qr_token_id" TEXT,
    "kiosk_device_id" TEXT,
    "raw_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attendance_punches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "timesheet_periods" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "TimesheetStatus" NOT NULL DEFAULT 'OPEN',
    "locked_at" TIMESTAMP(3),
    "locked_by_id" TEXT,
    "unlock_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "timesheet_periods_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "attendance_days" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "work_date" DATE NOT NULL,
    "check_in_at" TIMESTAMP(3),
    "check_out_at" TIMESTAMP(3),
    "worked_minutes" INTEGER NOT NULL DEFAULT 0,
    "late_minutes" INTEGER NOT NULL DEFAULT 0,
    "early_leave_minutes" INTEGER NOT NULL DEFAULT 0,
    "ot_minutes" INTEGER NOT NULL DEFAULT 0,
    "status" "AttendanceDayStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "source" TEXT NOT NULL DEFAULT 'AUTO',
    "timesheet_period_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "attendance_days_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "attendance_adjustments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "timesheet_period_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "work_date" DATE NOT NULL,
    "field" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "reason" TEXT NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attendance_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "employee_id" TEXT NOT NULL,
    "leave_type" "LeaveType" NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "days" DECIMAL(5,1) NOT NULL,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "approver_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "overtime_requests" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "work_date" DATE NOT NULL,
    "minutes" INTEGER NOT NULL,
    "reason" TEXT,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "approver_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "overtime_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "work_shift_policies_organization_id_code_key" ON "work_shift_policies"("organization_id", "code");
CREATE INDEX "work_shift_policies_organization_id_branch_id_idx" ON "work_shift_policies"("organization_id", "branch_id");

CREATE UNIQUE INDEX "work_shift_policy_versions_policy_id_version_key" ON "work_shift_policy_versions"("policy_id", "version");

CREATE UNIQUE INDEX "shift_assignments_organization_id_employee_id_work_date_key" ON "shift_assignments"("organization_id", "employee_id", "work_date");
CREATE INDEX "shift_assignments_organization_id_branch_id_work_date_idx" ON "shift_assignments"("organization_id", "branch_id", "work_date");

CREATE INDEX "attendance_qr_tokens_organization_id_branch_id_idx" ON "attendance_qr_tokens"("organization_id", "branch_id");
CREATE INDEX "attendance_qr_tokens_token_hash_idx" ON "attendance_qr_tokens"("token_hash");

CREATE INDEX "attendance_punches_organization_id_employee_id_work_date_idx" ON "attendance_punches"("organization_id", "employee_id", "work_date");
CREATE INDEX "attendance_punches_organization_id_branch_id_punched_at_idx" ON "attendance_punches"("organization_id", "branch_id", "punched_at");

CREATE UNIQUE INDEX "timesheet_periods_organization_id_branch_id_year_month_key" ON "timesheet_periods"("organization_id", "branch_id", "year", "month");
CREATE INDEX "timesheet_periods_organization_id_year_month_idx" ON "timesheet_periods"("organization_id", "year", "month");

CREATE UNIQUE INDEX "attendance_days_organization_id_employee_id_work_date_key" ON "attendance_days"("organization_id", "employee_id", "work_date");
CREATE INDEX "attendance_days_organization_id_branch_id_work_date_idx" ON "attendance_days"("organization_id", "branch_id", "work_date");
CREATE INDEX "attendance_days_timesheet_period_id_idx" ON "attendance_days"("timesheet_period_id");

CREATE INDEX "attendance_adjustments_organization_id_timesheet_period_id_idx" ON "attendance_adjustments"("organization_id", "timesheet_period_id");
CREATE INDEX "attendance_adjustments_employee_id_work_date_idx" ON "attendance_adjustments"("employee_id", "work_date");

CREATE INDEX "leave_requests_organization_id_status_idx" ON "leave_requests"("organization_id", "status");
CREATE INDEX "leave_requests_employee_id_from_date_idx" ON "leave_requests"("employee_id", "from_date");

CREATE INDEX "overtime_requests_organization_id_status_idx" ON "overtime_requests"("organization_id", "status");
CREATE INDEX "overtime_requests_employee_id_work_date_idx" ON "overtime_requests"("employee_id", "work_date");

ALTER TABLE "work_shift_policies" ADD CONSTRAINT "work_shift_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_shift_policies" ADD CONSTRAINT "work_shift_policies_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "work_shift_policies" ADD CONSTRAINT "work_shift_policies_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "work_shift_policy_versions" ADD CONSTRAINT "work_shift_policy_versions_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "work_shift_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "work_shift_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "attendance_qr_tokens" ADD CONSTRAINT "attendance_qr_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_qr_tokens" ADD CONSTRAINT "attendance_qr_tokens_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_qr_token_id_fkey" FOREIGN KEY ("qr_token_id") REFERENCES "attendance_qr_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "timesheet_periods" ADD CONSTRAINT "timesheet_periods_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "timesheet_periods" ADD CONSTRAINT "timesheet_periods_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "timesheet_periods" ADD CONSTRAINT "timesheet_periods_locked_by_id_fkey" FOREIGN KEY ("locked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_timesheet_period_id_fkey" FOREIGN KEY ("timesheet_period_id") REFERENCES "timesheet_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "attendance_adjustments" ADD CONSTRAINT "attendance_adjustments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_adjustments" ADD CONSTRAINT "attendance_adjustments_timesheet_period_id_fkey" FOREIGN KEY ("timesheet_period_id") REFERENCES "timesheet_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_adjustments" ADD CONSTRAINT "attendance_adjustments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_adjustments" ADD CONSTRAINT "attendance_adjustments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
