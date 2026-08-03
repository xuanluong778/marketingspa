/** User context sau JWT validate — dùng với @CurrentUser() */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
  employeeId?: string | null;
  /** RolePermission codes; thiếu thì PermissionsGuard coi như [] (OWNER vẫn bypass) */
  permissions?: string[];
}
