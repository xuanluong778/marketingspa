import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  BusinessGoalCalculationResult,
  BusinessGoalInput,
  BusinessGoalScenario,
  BusinessGoalScenarioList,
  CreateBusinessGoalScenarioPayload,
} from '@/types/business-goals';

export function useBusinessGoalScenarios() {
  return useQuery({
    queryKey: ['business-goals'],
    queryFn: () => apiClient<BusinessGoalScenarioList>('/business-goals'),
  });
}

export function useBusinessGoalScenario(id: string | null) {
  return useQuery({
    queryKey: ['business-goals', id],
    queryFn: () => apiClient<BusinessGoalScenario>(`/business-goals/${id}`),
    enabled: !!id,
  });
}

export function useCalculateBusinessGoals() {
  return useMutation({
    mutationFn: (body: BusinessGoalInput) =>
      apiClient<BusinessGoalCalculationResult>('/business-goals/calculate', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });
}

export function useCreateBusinessGoalScenario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateBusinessGoalScenarioPayload) =>
      apiClient<BusinessGoalScenario>('/business-goals', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['business-goals'] });
    },
  });
}

export function useDeleteBusinessGoalScenario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ success: boolean }>(`/business-goals/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['business-goals'] });
    },
  });
}
