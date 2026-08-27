import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { CustomerJourneyResponse, FunnelJourneySummary } from '@/types/customer-journey';

export function useLeadJourney(leadId: string | null) {
  return useQuery({
    queryKey: ['customer-journey', 'lead', leadId],
    enabled: !!leadId,
    queryFn: () => apiClient<CustomerJourneyResponse>(`/leads/${leadId}/journey`),
  });
}

export function useFunnelJourney(funnelId: string | null, leadId?: string) {
  const params = new URLSearchParams();
  if (leadId) params.set('leadId', leadId);
  const qs = params.toString();

  return useQuery({
    queryKey: ['customer-journey', 'funnel', funnelId, leadId],
    enabled: !!funnelId,
    queryFn: () =>
      apiClient<CustomerJourneyResponse | FunnelJourneySummary>(
        `/funnel-builder/recommendations/${funnelId}/journey${qs ? `?${qs}` : ''}`,
      ),
  });
}
