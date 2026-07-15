import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  FacebookAdAccount,
  FacebookAdsStatus,
  FacebookSyncedCampaign,
  FacebookSyncLog,
} from '@/types/facebook-ads';

const BASE = '/ad-performance/facebook';

export function useFacebookAdsStatus() {
  return useQuery({
    queryKey: ['facebook-ads', 'status'],
    queryFn: () => apiClient<FacebookAdsStatus>(`${BASE}/status`),
  });
}

export function useFacebookAdAccounts(enabled: boolean) {
  return useQuery({
    queryKey: ['facebook-ads', 'ad-accounts'],
    queryFn: () => apiClient<{ items: FacebookAdAccount[] }>(`${BASE}/ad-accounts`),
    enabled,
  });
}

export function useFacebookCampaigns(
  params: { dateFrom: string; dateTo: string; campaignId?: string; adAccountId?: string },
  enabled: boolean,
) {
  const qs = new URLSearchParams({
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    ...(params.campaignId ? { campaignId: params.campaignId } : {}),
    ...(params.adAccountId ? { adAccountId: params.adAccountId } : {}),
  });
  return useQuery({
    queryKey: ['facebook-ads', 'campaigns', params],
    queryFn: () =>
      apiClient<{ items: FacebookSyncedCampaign[]; adAccountId: string | null }>(
        `${BASE}/campaigns?${qs.toString()}`,
      ),
    enabled: enabled && !!params.dateFrom && !!params.dateTo,
  });
}

export function useFacebookSyncLogs(enabled: boolean) {
  return useQuery({
    queryKey: ['facebook-ads', 'sync-logs'],
    queryFn: () => apiClient<{ items: FacebookSyncLog[] }>(`${BASE}/sync-logs`),
    enabled,
  });
}

export function useFacebookAdsMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['facebook-ads'] });
  };

  const connect = useMutation({
    mutationFn: async () => {
      const { url } = await apiClient<{ url: string }>(`${BASE}/oauth/start`);
      window.location.href = url;
    },
  });

  const selectAdAccount = useMutation({
    mutationFn: (body: { adAccountId: string; adAccountName?: string }) =>
      apiClient(`${BASE}/ad-account`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: invalidate,
  });

  const sync = useMutation({
    mutationFn: (body: { dateFrom: string; dateTo: string; campaignId?: string }) =>
      apiClient<{ message: string; campaignsSynced: number }>(`${BASE}/sync`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: invalidate,
  });

  const disconnect = useMutation({
    mutationFn: () => apiClient(`${BASE}/disconnect`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  return { connect, selectAdAccount, sync, disconnect };
}
