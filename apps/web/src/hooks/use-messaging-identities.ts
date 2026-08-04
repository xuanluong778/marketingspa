import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { PaginatedResult } from '@/types/api';
import type { MessagingIdentityRow } from '@/types/messaging-campaign';

export function useMessagingIdentities(params?: Record<string, string>) {
  const qs = params ? `?${new URLSearchParams(params)}` : '';
  return useQuery({
    queryKey: ['messaging-identities', params],
    queryFn: () =>
      apiClient<PaginatedResult<MessagingIdentityRow>>(`/messaging-identities${qs}`),
  });
}
