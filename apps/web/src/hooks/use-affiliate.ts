import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

function qs(params: Record<string, string | number | undefined>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') sp.set(k, String(v));
  });
  return sp.toString();
}

export function useAffiliateMe() {
  return useQuery({
    queryKey: ['affiliate', 'me'],
    queryFn: () => apiClient<Record<string, unknown>>('/affiliate/me'),
  });
}

export function useAffiliateReferrals(page = 1) {
  return useQuery({
    queryKey: ['affiliate', 'referrals', page],
    queryFn: () => apiClient(`/affiliate/referrals?page=${page}`),
  });
}

export function useAffiliateCommissions(page = 1, status?: string) {
  return useQuery({
    queryKey: ['affiliate', 'commissions', page, status],
    queryFn: () =>
      apiClient(`/affiliate/commissions?${qs({ page, status, pageSize: 20 })}`),
  });
}

export function useAffiliatePayouts(page = 1) {
  return useQuery({
    queryKey: ['affiliate', 'payouts', page],
    queryFn: () => apiClient(`/affiliate/payouts?page=${page}`),
  });
}

export function useUpsertPayoutMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiClient('/affiliate/payout-method', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['affiliate'] }),
  });
}

export function useCreatePayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { amountVnd: number; note?: string }) =>
      apiClient('/affiliate/payouts', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['affiliate'] }),
  });
}

export function useTrackAffiliateClick() {
  return useMutation({
    mutationFn: (body: { code: string; landingPath?: string }) =>
      apiClient('/affiliate/track', {
        method: 'POST',
        body: JSON.stringify(body),
        auth: false,
      }),
  });
}

export function useAdminAffiliateOverview() {
  return useQuery({
    queryKey: ['admin', 'affiliate', 'overview'],
    queryFn: () => apiClient('/admin/affiliate/overview'),
  });
}

export function useAdminAffiliatePartners(params: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: ['admin', 'affiliate', 'partners', params],
    queryFn: () => apiClient(`/admin/affiliate/partners?${qs(params)}`),
  });
}

export function useAdminAffiliateCommissions(params: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: ['admin', 'affiliate', 'commissions', params],
    queryFn: () => apiClient(`/admin/affiliate/commissions?${qs(params)}`),
  });
}

export function useAdminAffiliatePayouts(params: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: ['admin', 'affiliate', 'payouts', params],
    queryFn: () => apiClient(`/admin/affiliate/payouts?${qs(params)}`),
  });
}

export function useAdminAffiliateFraud() {
  return useQuery({
    queryKey: ['admin', 'affiliate', 'fraud'],
    queryFn: () => apiClient('/admin/affiliate/fraud'),
  });
}

export function useAdminAffiliateSettings() {
  return useQuery({
    queryKey: ['admin', 'affiliate', 'settings'],
    queryFn: () => apiClient('/admin/affiliate/settings'),
  });
}

export function useAdminAffiliateAudit(params: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: ['admin', 'affiliate', 'audit', params],
    queryFn: () => apiClient(`/admin/affiliate/audit-logs?${qs(params)}`),
  });
}

export function useAdminAffiliateReferrals(params: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: ['admin', 'affiliate', 'referrals', params],
    queryFn: () => apiClient(`/admin/affiliate/referrals?${qs(params)}`),
  });
}

export function useAdminAffiliateMut() {
  const qc = useQueryClient();
  const inv = () => void qc.invalidateQueries({ queryKey: ['admin', 'affiliate'] });
  return {
    setStatus: useMutation({
      mutationFn: (b: { id: string; status: string; reason: string }) =>
        apiClient(`/admin/affiliate/partners/${b.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: b.status, reason: b.reason }),
        }),
      onSuccess: inv,
    }),
    setRate: useMutation({
      mutationFn: (b: { id: string; customRate: number; reason: string; allowRenewalCommission?: boolean }) =>
        apiClient(`/admin/affiliate/partners/${b.id}/rate`, {
          method: 'PATCH',
          body: JSON.stringify(b),
        }),
      onSuccess: inv,
    }),
    approveCommission: useMutation({
      mutationFn: (b: { id: string; reason: string }) =>
        apiClient(`/admin/affiliate/commissions/${b.id}/approve`, {
          method: 'POST',
          body: JSON.stringify({ reason: b.reason }),
        }),
      onSuccess: inv,
    }),
    reverseCommission: useMutation({
      mutationFn: (b: { id: string; reason: string }) =>
        apiClient(`/admin/affiliate/commissions/${b.id}/reverse`, {
          method: 'POST',
          body: JSON.stringify({ reason: b.reason }),
        }),
      onSuccess: inv,
    }),
    approvePayout: useMutation({
      mutationFn: (b: { id: string; reason: string }) =>
        apiClient(`/admin/affiliate/payouts/${b.id}/approve`, {
          method: 'POST',
          body: JSON.stringify({ reason: b.reason }),
        }),
      onSuccess: inv,
    }),
    rejectPayout: useMutation({
      mutationFn: (b: { id: string; reason: string }) =>
        apiClient(`/admin/affiliate/payouts/${b.id}/reject`, {
          method: 'POST',
          body: JSON.stringify({ reason: b.reason }),
        }),
      onSuccess: inv,
    }),
    markPaid: useMutation({
      mutationFn: (b: { id: string; reason: string; paidReference?: string }) =>
        apiClient(`/admin/affiliate/payouts/${b.id}/mark-paid`, {
          method: 'POST',
          body: JSON.stringify(b),
        }),
      onSuccess: inv,
    }),
    updateSettings: useMutation({
      mutationFn: (b: Record<string, unknown>) =>
        apiClient('/admin/affiliate/settings', {
          method: 'PATCH',
          body: JSON.stringify(b),
        }),
      onSuccess: inv,
    }),
  };
}
