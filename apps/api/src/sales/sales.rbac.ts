/**
 * RBAC Bán hàng / Kho — map nghiệp vụ → role canonical.
 * Admin  = OWNER (bypass PermissionsGuard + full perms)
 * Manager = MANAGER
 * Staff   = SALE
 */
import { SYSTEM_ROLES } from '../common/constants/roles';

export const SALES_ROLE_MAP = {
  Admin: SYSTEM_ROLES.OWNER,
  Manager: SYSTEM_ROLES.MANAGER,
  Staff: SYSTEM_ROLES.SALE,
} as const;

/** Roles được ghi kho / đơn bán */
export const SALES_WRITE_ROLE_CODES = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.SALE,
] as const;

export const SALES_PERMISSIONS = {
  read: 'order.read',
  write: 'order.write',
} as const;

export function canWriteSales(roleCode: string | undefined | null): boolean {
  if (!roleCode) return false;
  return (SALES_WRITE_ROLE_CODES as readonly string[]).includes(roleCode);
}
