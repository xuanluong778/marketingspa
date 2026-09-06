import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { FunnelValidatorResult } from '@/types/funnel-validator';

export function useFunnelValidation(recommendationId: string | null, explain = false) {
  return useQuery({
    queryKey: ['funnel-validator', recommendationId, explain],
    enabled: !!recommendationId,
    queryFn: () =>
      apiClient<FunnelValidatorResult>(
        `/funnel-builder/recommendations/${recommendationId}/validate?explain=${explain ? '1' : '0'}`,
      ),
  });
}

export function useFunnelValidationPayload(
  payload: { completeSpec?: unknown; draft?: unknown } | null,
  explain = false,
) {
  return useQuery({
    queryKey: ['funnel-validator', 'payload', payload, explain],
    enabled: !!payload && (!!payload.completeSpec || !!payload.draft),
    queryFn: () =>
      apiClient<FunnelValidatorResult>('/funnel-builder/validate', {
        method: 'POST',
        body: JSON.stringify({ ...payload, explain }),
      }),
  });
}
