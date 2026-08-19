import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { FunnelStats, FunnelFilters, FunnelAnalyticsDashboard } from '@/types/funnel';

function funnelParams(filters: FunnelFilters) {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.funnelRecommendationId) params.set('funnelRecommendationId', filters.funnelRecommendationId);
  if (filters.leadSourceId) params.set('leadSourceId', filters.leadSourceId);
  if (filters.assignedToId) params.set('assignedToId', filters.assignedToId);
  if (filters.branchId) params.set('branchId', filters.branchId);
  if (filters.adCampaignId) params.set('adCampaignId', filters.adCampaignId);
  if (filters.touchModel) params.set('touchModel', filters.touchModel);
  if (filters.utmSource) params.set('utmSource', filters.utmSource);
  if (filters.utmMedium) params.set('utmMedium', filters.utmMedium);
  if (filters.utmCampaign) params.set('utmCampaign', filters.utmCampaign);
  return params;
}

export function useFunnelStats(filters: FunnelFilters) {
  return useQuery({
    queryKey: ['funnel', 'stats', filters],
    queryFn: () => apiClient<FunnelStats>(`/leads/funnel/stats?${funnelParams(filters)}`),
  });
}

export function useFunnelAnalytics(filters: FunnelFilters) {
  return useQuery({
    queryKey: ['funnel', 'analytics', filters],
    queryFn: () =>
      apiClient<FunnelAnalyticsDashboard>(`/leads/funnel/analytics?${funnelParams(filters)}`),
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
    funnelRecommendationId: '',
    touchModel: 'last',
    utmSource: '',
    utmMedium: '',
    utmCampaign: '',
  };
}

export function funnelStageToLeadsUrl(leadFilter: Record<string, string>) {
  const params = new URLSearchParams(leadFilter);
  return `/leads?${params.toString()}`;
}
