export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'PROBATION';
export type EmployeeStatus = 'ACTIVE' | 'PROBATION' | 'ON_LEAVE' | 'TERMINATED';
export type HrmDocumentType = 'CONTRACT' | 'ID_CARD' | 'CERTIFICATE' | 'OTHER';
export type EmploymentContractType = 'PROBATION' | 'FIXED' | 'INDEFINITE';
export type EmploymentContractStatus = 'DRAFT' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED';

export const EMPLOYMENT_TYPE_OPTIONS = [
  { value: 'FULL_TIME', label: 'Toàn thời gian' },
  { value: 'PART_TIME', label: 'Bán thời gian' },
  { value: 'CONTRACT', label: 'Hợp đồng' },
  { value: 'PROBATION', label: 'Thử việc' },
] as const;

export const EMPLOYEE_STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Đang làm' },
  { value: 'PROBATION', label: 'Thử việc' },
  { value: 'ON_LEAVE', label: 'Nghỉ phép dài' },
  { value: 'TERMINATED', label: 'Đã nghỉ' },
] as const;

export const CONTRACT_TYPE_OPTIONS = [
  { value: 'PROBATION', label: 'Thử việc' },
  { value: 'FIXED', label: 'Xác định thời hạn' },
  { value: 'INDEFINITE', label: 'Không xác định thời hạn' },
] as const;

export const DOCUMENT_TYPE_OPTIONS = [
  { value: 'CONTRACT', label: 'Hợp đồng' },
  { value: 'ID_CARD', label: 'CCCD/CMND' },
  { value: 'CERTIFICATE', label: 'Chứng chỉ' },
  { value: 'OTHER', label: 'Khác' },
] as const;

export interface HrmDepartment {
  id: string;
  name: string;
  code?: string | null;
  branchId?: string | null;
  parentId?: string | null;
  isActive?: boolean;
}

export interface HrmEmployee {
  id: string;
  code?: string | null;
  name: string;
  phone?: string | null;
  email?: string | null;
  position?: string | null;
  employmentType?: EmploymentType;
  status?: EmployeeStatus;
  isActive?: boolean;
  branchId?: string | null;
  departmentId?: string | null;
  managerId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  address?: string | null;
  legalIdNumber?: string | null;
  branch?: { id: string; name: string } | null;
  department?: { id: string; name: string } | null;
  manager?: { id: string; name: string; code?: string | null } | null;
  user?: { id: string; email: string; role?: { code: string; name: string } } | null;
  contracts?: HrmContract[];
  documentsCount?: number;
}

export interface HrmContract {
  id: string;
  title: string;
  code?: string | null;
  contractType: EmploymentContractType;
  status: EmploymentContractStatus;
  salaryBase?: string | number | null;
  currency?: string;
  startDate: string;
  endDate?: string | null;
  version: number;
  fileUrl?: string | null;
  notes?: string | null;
}

export interface HrmDocument {
  id: string;
  title: string;
  type: HrmDocumentType;
  fileUrl: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  isArchived?: boolean;
  createdAt?: string;
}

export interface HrmEmployeeInput {
  name: string;
  phone?: string;
  email?: string;
  position?: string;
  code?: string;
  branchId?: string;
  departmentId?: string;
  managerId?: string;
  employmentType?: EmploymentType;
  status?: EmployeeStatus;
  startDate?: string;
  endDate?: string;
  address?: string;
  legalIdNumber?: string;
}

export interface HrmEmployeeFilters {
  q?: string;
  branchId?: string;
  departmentId?: string;
  status?: EmployeeStatus | '';
  employmentType?: EmploymentType | '';
  position?: string;
  page?: number;
  pageSize?: number;
}

export type AttendanceDayStatus =
  | 'PRESENT'
  | 'ABSENT'
  | 'LEAVE'
  | 'HOLIDAY'
  | 'INCOMPLETE';
export type TimesheetStatus = 'OPEN' | 'LOCKED' | 'ARCHIVED';
export type LeaveRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type LeaveType = 'ANNUAL' | 'SICK' | 'UNPAID' | 'MATERNITY' | 'OTHER';
export type AttendanceMethod = 'QR' | 'GPS' | 'KIOSK' | 'MANUAL';
export type AttendancePunchType = 'CHECK_IN' | 'CHECK_OUT' | 'BREAK_START' | 'BREAK_END';

export const ATTENDANCE_DAY_STATUS_OPTIONS = [
  { value: 'PRESENT', label: 'Đủ công' },
  { value: 'INCOMPLETE', label: 'Thiếu giờ' },
  { value: 'ABSENT', label: 'Vắng' },
  { value: 'LEAVE', label: 'Nghỉ phép' },
  { value: 'HOLIDAY', label: 'Nghỉ lễ' },
] as const;

export const LEAVE_TYPE_OPTIONS = [
  { value: 'ANNUAL', label: 'Phép năm' },
  { value: 'SICK', label: 'Ốm' },
  { value: 'UNPAID', label: 'Không lương' },
  { value: 'MATERNITY', label: 'Thai sản' },
  { value: 'OTHER', label: 'Khác' },
] as const;

export const LEAVE_STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Chờ duyệt' },
  { value: 'APPROVED', label: 'Đã duyệt' },
  { value: 'REJECTED', label: 'Từ chối' },
  { value: 'CANCELLED', label: 'Đã hủy' },
] as const;

export interface HrmAttendanceDay {
  id: string;
  workDate: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  workedMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  otMinutes: number;
  status: AttendanceDayStatus;
  employee?: { id: string; name: string; code?: string | null; position?: string | null };
  branch?: { id: string; name: string };
  timesheetPeriod?: { id: string; year: number; month: number; status: TimesheetStatus };
}

export interface HrmTimesheetPeriod {
  id: string;
  year: number;
  month: number;
  status: TimesheetStatus;
  lockedAt?: string | null;
  branch?: { id: string; name: string } | null;
  lockedBy?: { id: string; name: string; email: string } | null;
  _count?: { attendanceDays: number };
}

export interface HrmLeaveRequest {
  id: string;
  leaveType: LeaveType;
  fromDate: string;
  toDate: string;
  days: string | number;
  status: LeaveRequestStatus;
  reason?: string | null;
  decisionNote?: string | null;
  employee?: { id: string; name: string; code?: string | null };
  branch?: { id: string; name: string } | null;
  approver?: { id: string; name: string; email: string } | null;
  createdAt?: string;
}

export interface HrmOvertimeRequest {
  id: string;
  workDate: string;
  minutes: number;
  status: LeaveRequestStatus;
  reason?: string | null;
  employee?: { id: string; name: string; code?: string | null };
  branch?: { id: string; name: string };
}

export interface HrmAttendanceFilters {
  branchId?: string;
  employeeId?: string;
  year?: number;
  month?: number;
  page?: number;
  pageSize?: number;
}

export interface HrmLeaveFilters {
  branchId?: string;
  employeeId?: string;
  status?: LeaveRequestStatus | '';
  page?: number;
  pageSize?: number;
}
