import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type BillingPlan = {
  id: string;
  code: string;
  name: string;
  priceMonthly: string | number;
  priceVnd: string | number;
  durationMonths: number;
  highlightLabel: string | null;
  savingsAmount: string | number | null;
  creditGrant: string | number;
  sortOrder: number;
  features: string[] | unknown;
  isActive: boolean;
};

export type PaymentOrder = {
  id: string;
  code: string;
  organizationId: string;
  planId: string | null;
  creditPackageId?: string | null;
  kind?: 'subscription' | 'credit';
  amountVnd: number;
  status: 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED' | 'REVIEW_REQUIRED';
  statusLabel: string;
  transferContent: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  qrUrl: string | null;
  expiresAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  plan?: {
    code: string;
    name: string;
    durationMonths: number;
    priceVnd: number;
  };
  creditPackage?: {
    code: string;
    name: string;
    credits: number;
    priceVnd?: number;
  };
  transactions?: unknown[];
};

export type SubscriptionLifecycleStatus =
  | 'NONE'
  | 'ACTIVE'
  | 'EXPIRING'
  | 'EXPIRED'
  | 'TRIALING'
  | 'TRIAL_EXPIRED';

export type TrialInfo = {
  enabled: boolean;
  eligible: boolean;
  activated: boolean;
  status: string | null;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  remainingMs: number;
  remainingDays: number;
  remainingHours: number;
  warningWithin24h: boolean;
  allowedFeatures: unknown;
  trialDays: number;
};

export type CurrentSubscription = {
  id?: string;
  email?: string | null;
  role?: string | null;
  hasPlan: boolean;
  planCode: string | null;
  planName: string | null;
  durationMonths: number | null;
  startedAt: string | null;
  expiresAt: string | null;
  /** Server: max(0, ceil((expiresAt - now) / 1 day)) */
  remainingDays: number;
  status: SubscriptionLifecycleStatus;
  /** Alias chuẩn cho status */
  subscriptionStatus?: SubscriptionLifecycleStatus;
  isExpired: boolean;
  /** alias remainingDays — tương thích UI cũ */
  daysRemaining: number;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  plan?: { code: string; name: string; durationMonths: number } | null;
  trial?: TrialInfo;
};

export function useBillingPlans() {
  return useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: () => apiClient<BillingPlan[]>('/billing/plans', { auth: false }),
  });
}

export function useCurrentSubscription() {
  return useQuery({
    queryKey: ['billing', 'subscription'],
    queryFn: () => apiClient<CurrentSubscription>('/billing/subscription'),
  });
}

export function useMyPaymentOrders() {
  return useQuery({
    queryKey: ['billing', 'orders'],
    queryFn: () => apiClient<PaymentOrder[]>('/billing/orders'),
  });
}

export function usePaymentOrder(idOrCode: string | null, opts?: { poll?: boolean }) {
  return useQuery({
    queryKey: ['billing', 'order', idOrCode],
    queryFn: () => apiClient<PaymentOrder>(`/billing/orders/${idOrCode}`),
    enabled: Boolean(idOrCode),
    refetchInterval: (query) => {
      if (!opts?.poll) return false;
      const status = query.state.data?.status;
      if (status === 'PENDING') return 3000;
      return false;
    },
  });
}

export function useCreatePaymentOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planCode: string) =>
      apiClient<PaymentOrder>('/billing/orders', {
        method: 'POST',
        body: JSON.stringify({ planCode }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['billing', 'orders'] });
    },
  });
}

export function useCreateCreditOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (packageCode: string) =>
      apiClient<PaymentOrder>('/billing/credit-orders', {
        method: 'POST',
        body: JSON.stringify({ packageCode }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['billing', 'orders'] });
      void qc.invalidateQueries({ queryKey: ['credits'] });
    },
  });
}

export function useActivateTrial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deviceFingerprint: string) =>
      apiClient<{
        activated: boolean;
        idempotent: boolean;
        subscription: CurrentSubscription;
      }>('/billing/trial/activate', {
        method: 'POST',
        body: JSON.stringify({ deviceFingerprint }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['billing', 'subscription'] });
      void qc.invalidateQueries({ queryKey: ['credits'] });
    },
  });
}

export function useCancelPaymentOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) =>
      apiClient<PaymentOrder>(`/billing/orders/${orderId}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['billing'] });
    },
  });
}

export type AdminOrdersResult = {
  items: Array<PaymentOrder & { organization?: { id: string; name: string; email: string | null } }>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export function useAdminBillingOrders(params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  });
  return useQuery({
    queryKey: ['admin', 'billing', 'orders', params],
    queryFn: () => apiClient<AdminOrdersResult>(`/admin/billing/orders?${qs.toString()}`),
  });
}

export function useAdminBillingTransactions(params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  });
  return useQuery({
    queryKey: ['admin', 'billing', 'transactions', params],
    queryFn: () =>
      apiClient<{ items: unknown[]; total: number; page: number; totalPages: number }>(
        `/admin/billing/transactions?${qs.toString()}`,
      ),
  });
}

export function useAdminReprocessTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { id: string; reason: string; force?: boolean }) =>
      apiClient(`/admin/billing/transactions/${body.id}/reprocess`, {
        method: 'POST',
        body: JSON.stringify({ reason: body.reason, force: body.force ?? false }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'billing'] });
    },
  });
}

export function useAdminBillingSubscriptions(page = 1) {
  return useQuery({
    queryKey: ['admin', 'billing', 'subscriptions', page],
    queryFn: () =>
      apiClient<{
        items: Array<{
          id: string;
          status: string;
          currentPeriodEnd: string;
          isExpired: boolean;
          plan?: { name: string; code: string };
          organization?: { name: string; email: string | null };
        }>;
        total: number;
        page: number;
        totalPages: number;
      }>(`/admin/billing/subscriptions?page=${page}`),
  });
}

export function useAdminMarkReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { orderId: string; note: string }) =>
      apiClient('/admin/billing/orders/review', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'billing'] });
    },
  });
}
