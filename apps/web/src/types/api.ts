export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  authProvider?: string;
  role: string;
  roleName: string;
  organizationId: string;
  employeeId?: string | null;
  permissions?: string[];
  emailVerified?: boolean;
  organization: { id: string; name: string; slug: string };
  employee: { id: string; name: string } | null;
  /** Server-driven feature flags (canary org allowlist for Trợ lý AI). */
  features?: {
    assistantEnabled?: boolean;
    assistantCanaryMode?: boolean;
  };
  /** Preferred UI locale from `/auth/me`; sync via PATCH `/auth/locale`. */
  uiLocale?: 'vi' | 'en' | null;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken?: string;
  user: AuthUser;
}

export interface FinanceDashboard {
  period?: string;
  from: string;
  to: string;
  revenue: number;
  expense: number;
  adSpend?: number;
  salarySpend?: number;
  materialSpend?: number;
  operatingSpend?: number;
  otherSpend?: number;
  profit: number;
  paymentCount: number;
  expenseCount: number;
  margin: string;
}

export interface Lead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  pipelineStatus: string;
  createdAt: string;
  lastContactedAt?: string | null;
  note?: string | null;
  estimatedValue?: number | null;
  tags?: string[];
  serviceName?: string | null;
  isStale?: boolean;
  score?: number;
  qualification?: 'MQL' | 'SQL' | null;
  assignedTo?: { id: string; name: string } | null;
  leadSource?: { id: string; name: string } | null;
  branch?: { id: string; name: string } | null;
  customer?: { id: string; name: string } | null;
}

export interface Appointment {
  id: string;
  scheduledAt: string;
  status: string;
  durationMinutes: number;
  customer?: { name: string } | null;
  employee?: { name: string } | null;
  service?: { name: string } | null;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  tags: string[];
  source?: string | null;
  firstSource?: string | null;
  latestSource?: string | null;
  leadSource?: { name: string; id?: string } | null;
  branch?: { id: string; name: string } | null;
}

export interface StaleLead {
  id: string;
  name: string;
  createdAt: string;
}
