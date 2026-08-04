import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type AdminOverview = {
  organizations: number;
  users: number;
  activeUsers: number;
  subscriptionsActive: number;
  subscriptionsExpired: number;
  expiring7: number;
  expiring15: number;
  paymentOrdersPending: number;
};

export type AdminOrgListItem = {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  userCount: number;
  subscriptionCount: number;
  currentSubscription: {
    id: string;
    planCode: string;
    planName: string;
    durationMonths: number;
    status: string;
    currentPeriodEnd: string;
    remainingDays: number;
  } | null;
};

export type AdminUserItem = {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  deletedAt?: string | null;
  authProvider: string;
  lastLoginAt: string | null;
  createdAt: string;
  organizationId: string;
  role: { id: string; code: string; name: string };
  organization: { id: string; name: string; slug: string; email: string | null; isActive: boolean };
};

export type AdminUserDetail = AdminUserItem & {
  activeSessions?: number;
  _count?: { authSessions: number };
  subscription: {
    id: string;
    status: string;
    planCode: string;
    planName: string;
    durationMonths: number;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    remainingDays: number;
    isExpired: boolean;
  } | null;
  history: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string | null;
    metadata: Record<string, unknown> | null;
    ipAddress: string | null;
    createdAt: string;
    actor: { id: string; email: string | null; name: string | null } | null;
  }>;
};

export type AdminSubscriptionItem = {
  id: string;
  organizationId: string;
  organization?: { id: string; name: string; slug: string; email: string | null; isActive?: boolean };
  planCode: string;
  planName: string;
  durationMonths: number;
  status: string;
  startedAt: string;
  expiresAt: string;
  remainingDays: number;
  isExpired: boolean;
};

type PageResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function qs(params: Record<string, string | number | undefined>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') sp.set(k, String(v));
  });
  return sp.toString();
}

export function useAdminOverview() {
  return useQuery({
    queryKey: ['platform-admin', 'overview'],
    queryFn: () => apiClient<AdminOverview>('/admin/overview'),
  });
}

export function useAdminOrganizations(params: Record<string, string | number | undefined>) {
  const q = qs(params);
  return useQuery({
    queryKey: ['platform-admin', 'organizations', params],
    queryFn: () => apiClient<PageResult<AdminOrgListItem>>(`/admin/organizations?${q}`),
  });
}

export function useAdminUsers(params: Record<string, string | number | undefined>) {
  const q = qs(params);
  return useQuery({
    queryKey: ['platform-admin', 'users', params],
    queryFn: () => apiClient<PageResult<AdminUserItem>>(`/admin/users?${q}`),
  });
}

export function useAdminSubscriptions(params: Record<string, string | number | undefined>) {
  const q = qs(params);
  return useQuery({
    queryKey: ['platform-admin', 'subscriptions', params],
    queryFn: () => apiClient<PageResult<AdminSubscriptionItem>>(`/admin/subscriptions?${q}`),
  });
}

export function useAdminOrgStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { id: string; isActive: boolean; reason: string }) =>
      apiClient(`/admin/organizations/${body.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: body.isActive, reason: body.reason }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['platform-admin'] }),
  });
}

export function useAdminUserStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { id: string; isActive: boolean; reason: string }) =>
      apiClient(`/admin/users/${body.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: body.isActive, reason: body.reason }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['platform-admin'] }),
  });
}

export function useAdminForceLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { id: string; reason: string }) =>
      apiClient(`/admin/users/${body.id}/force-logout`, {
        method: 'POST',
        body: JSON.stringify({ reason: body.reason }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['platform-admin'] }),
  });
}

export function useAdminUserDetail(id: string | null) {
  return useQuery({
    queryKey: ['platform-admin', 'user', id],
    queryFn: () => apiClient<AdminUserDetail>(`/admin/users/${id}`),
    enabled: Boolean(id),
  });
}

export function useAdminSoftDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { id: string; reason: string }) =>
      apiClient(`/admin/users/${body.id}/soft-delete`, {
        method: 'POST',
        body: JSON.stringify({ reason: body.reason, confirm: true }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['platform-admin'] }),
  });
}

export function useAdminGiftTime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      id: string;
      amount: number;
      unit: 'days' | 'months' | 'years';
      reason: string;
      idempotencyKey: string;
    }) =>
      apiClient(`/admin/users/${body.id}/gift-time`, {
        method: 'POST',
        body: JSON.stringify({
          amount: body.amount,
          unit: body.unit,
          reason: body.reason,
          idempotencyKey: body.idempotencyKey,
        }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['platform-admin'] }),
  });
}

export function useAdminExtendSub() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { id: string; days: number; reason: string; idempotencyKey?: string }) =>
      apiClient(`/admin/subscriptions/${body.id}/extend`, {
        method: 'POST',
        body: JSON.stringify({
          days: body.days,
          reason: body.reason,
          idempotencyKey: body.idempotencyKey,
        }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['platform-admin'] }),
  });
}

export function useAdminUpgrade12m() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { id: string; reason: string }) =>
      apiClient(`/admin/subscriptions/${body.id}/upgrade-12m`, {
        method: 'POST',
        body: JSON.stringify({ reason: body.reason }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['platform-admin'] }),
  });
}

export function useAdminUsage(params: Record<string, string | number | undefined>) {
  const q = qs(params);
  return useQuery({
    queryKey: ['platform-admin', 'usage', params],
    queryFn: () => apiClient<PageResult<Record<string, unknown>>>(`/admin/usage?${q}`),
  });
}

export function useAdminIntegrationsHealth() {
  return useQuery({
    queryKey: ['platform-admin', 'integrations-health'],
    queryFn: () => apiClient<Record<string, unknown>>('/admin/integrations/health'),
    refetchInterval: 30_000,
  });
}

export function useAdminFailedJobs(params: Record<string, string | number | undefined>) {
  const q = qs(params);
  return useQuery({
    queryKey: ['platform-admin', 'jobs-failed', params],
    queryFn: () => apiClient<PageResult<Record<string, unknown>>>(`/admin/jobs/failed?${q}`),
  });
}

export function useAdminRetryJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { type: string; id: string; reason: string }) =>
      apiClient(`/admin/jobs/${body.type}/${body.id}/retry`, {
        method: 'POST',
        body: JSON.stringify({ reason: body.reason }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['platform-admin', 'jobs-failed'] }),
  });
}

export function useAdminAuditLogs(params: Record<string, string | number | undefined>) {
  const q = qs(params);
  return useQuery({
    queryKey: ['platform-admin', 'audit-logs', params],
    queryFn: () => apiClient<PageResult<Record<string, unknown>>>(`/admin/audit-logs?${q}`),
  });
}
