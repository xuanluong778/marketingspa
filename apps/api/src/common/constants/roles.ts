/** Role codes chuẩn cho spa SaaS (Phase 0 — thống nhất seed/register/UI) */
export const SYSTEM_ROLES = {
  OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  MARKETING: 'MARKETING',
  SALE: 'SALE',
  TECHNICIAN: 'TECHNICIAN',
  HR: 'HR',
} as const;

export type SystemRoleCode = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

/** Alias legacy → canonical (seed / migrate) */
export const ROLE_CODE_ALIASES: Record<string, SystemRoleCode> = {
  MARKETER: SYSTEM_ROLES.MARKETING,
  ADMIN: SYSTEM_ROLES.MANAGER,
  STAFF: SYSTEM_ROLES.TECHNICIAN,
};

export const DEFAULT_ROLE_SEEDS = [
  { code: SYSTEM_ROLES.OWNER, name: 'Chủ spa' },
  { code: SYSTEM_ROLES.MANAGER, name: 'Quản lý' },
  { code: SYSTEM_ROLES.MARKETING, name: 'Marketing' },
  { code: SYSTEM_ROLES.SALE, name: 'Sale' },
  { code: SYSTEM_ROLES.TECHNICIAN, name: 'Kỹ thuật viên' },
  { code: SYSTEM_ROLES.HR, name: 'Nhân sự' },
] as const;

/** Permission CRM/finance hiện có + module HRM Phase 0 */
export const CORE_PERMISSION_DEFS = [
  { code: 'customer.read', name: 'Xem khách hàng', module: 'crm' },
  { code: 'customer.write', name: 'Sửa khách hàng', module: 'crm' },
  { code: 'lead.read', name: 'Xem lead', module: 'crm' },
  { code: 'lead.write', name: 'Sửa lead', module: 'crm' },
  { code: 'campaign.send', name: 'Gửi chiến dịch', module: 'marketing' },
  { code: 'order.read', name: 'Xem đơn hàng', module: 'finance' },
  { code: 'expense.write', name: 'Ghi chi phí', module: 'finance' },
  { code: 'report.view', name: 'Xem báo cáo', module: 'analytics' },
  { code: 'settings.manage', name: 'Quản lý cài đặt', module: 'admin' },
] as const;

export const HRM_PERMISSION_DEFS = [
  { code: 'hrm.employee.read', name: 'Xem nhân viên', module: 'hrm' },
  { code: 'hrm.employee.write', name: 'Sửa nhân viên', module: 'hrm' },
  { code: 'hrm.contract.read', name: 'Xem hợp đồng', module: 'hrm' },
  { code: 'hrm.contract.write', name: 'Sửa hợp đồng', module: 'hrm' },
  { code: 'hrm.document.read', name: 'Xem tài liệu HR', module: 'hrm' },
  { code: 'hrm.document.write', name: 'Sửa tài liệu HR', module: 'hrm' },
  { code: 'hrm.account.manage', name: 'Quản lý tài khoản NV', module: 'hrm' },
  { code: 'hrm.audit.read', name: 'Xem audit HR', module: 'hrm' },
  { code: 'hrm.attendance.read', name: 'Xem chấm công', module: 'hrm' },
  { code: 'hrm.attendance.write', name: 'Chấm công / phân ca', module: 'hrm' },
  { code: 'hrm.attendance.lock', name: 'Khóa bảng công', module: 'hrm' },
  { code: 'hrm.leave.read', name: 'Xem phép / OT', module: 'hrm' },
  { code: 'hrm.leave.write', name: 'Tạo phép / OT', module: 'hrm' },
  { code: 'hrm.leave.approve', name: 'Duyệt phép / OT', module: 'hrm' },
] as const;

export const ALL_PERMISSION_DEFS = [...CORE_PERMISSION_DEFS, ...HRM_PERMISSION_DEFS] as const;

export function canonicalizeRoleCode(code: string): string {
  return ROLE_CODE_ALIASES[code] ?? code;
}

/** Quyền mặc định theo role (dùng khi register org mới / seed) */
export function defaultPermissionCodesForRole(roleCode: string): string[] {
  const all = ALL_PERMISSION_DEFS.map((p) => p.code);
  const hrmRead = HRM_PERMISSION_DEFS.filter((p) => p.code.endsWith('.read')).map((p) => p.code);
  const hrmAll = HRM_PERMISSION_DEFS.map((p) => p.code);
  const crmRead = ['customer.read', 'lead.read', 'order.read', 'report.view'];
  const crmWrite = ['customer.write', 'lead.write'];

  switch (canonicalizeRoleCode(roleCode)) {
    case SYSTEM_ROLES.OWNER:
      return all;
    case SYSTEM_ROLES.MANAGER:
      return all.filter((c) => c !== 'settings.manage');
    case SYSTEM_ROLES.HR:
      return [...hrmAll, 'report.view', 'customer.read'];
    case SYSTEM_ROLES.MARKETING:
      return [
        'customer.read',
        'lead.read',
        'lead.write',
        'campaign.send',
        'report.view',
        'hrm.employee.read',
      ];
    case SYSTEM_ROLES.SALE:
      return [...crmRead, ...crmWrite, 'hrm.employee.read'];
    case SYSTEM_ROLES.TECHNICIAN:
      return [
        'hrm.employee.read',
        'hrm.attendance.read',
        'hrm.leave.read',
        'hrm.leave.write',
        'lead.read',
        'customer.read',
      ];
    default:
      return hrmRead.slice(0, 1);
  }
}
