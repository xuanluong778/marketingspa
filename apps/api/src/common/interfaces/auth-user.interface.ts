/** User context sau JWT validate — dùng với @CurrentUser() */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
}
