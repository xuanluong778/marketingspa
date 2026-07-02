/** Role codes chuẩn cho spa SaaS */
export const SYSTEM_ROLES = {
  OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  MARKETING: 'MARKETING',
  SALE: 'SALE',
  TECHNICIAN: 'TECHNICIAN',
} as const;

export const DEFAULT_ROLE_SEEDS = [
  { code: 'OWNER', name: 'Chủ spa' },
  { code: 'MANAGER', name: 'Quản lý' },
  { code: 'MARKETING', name: 'Marketing' },
  { code: 'SALE', name: 'Sale' },
  { code: 'TECHNICIAN', name: 'Kỹ thuật viên' },
] as const;
