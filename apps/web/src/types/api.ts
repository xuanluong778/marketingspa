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
  role: string;
  roleName: string;
  organizationId: string;
  organization: { id: string; name: string; slug: string };
  employee: { id: string; name: string } | null;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
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
  note?: string | null;
  estimatedValue?: number | null;
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
  leadSource?: { name: string; id?: string } | null;
  branch?: { id: string; name: string } | null;
}

export interface StaleLead {
  id: string;
  name: string;
  createdAt: string;
}
