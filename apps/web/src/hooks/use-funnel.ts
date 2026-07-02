import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { FunnelStats, FunnelFilters } from '@/types/funnel';

export function useFunnelStats(filters: FunnelFilters) {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.leadSourceId) params.set('leadSourceId', filters.leadSourceId);
  if (filters.assignedToId) params.set('assignedToId', filters.assignedToId);
  if (filters.branchId) params.set('branchId', filters.branchId);
  if (filters.adCampaignId) params.set('adCampaignId', filters.adCampaignId);

  return useQuery({
    queryKey: ['funnel', 'stats', filters],
    queryFn: () => apiClient<FunnelStats>(`/leads/funnel/stats?${params}`),
  });
}

export function defaultFunnelFilters(): FunnelFilters {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    leadSourceId: '',
    assignedToId: '',
    branchId: '',
    adCampaignId: '',
  };
}
