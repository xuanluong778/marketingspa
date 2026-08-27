import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { FunnelCompleteSpec } from '@/types/funnel';
import type {
  FunnelConsultantIntent,
  FunnelConsultantProposal,
} from '@/types/funnel-consultant';

export function useFunnelConsultantPropose() {
  return useMutation({
    mutationFn: (vars: {
      id: string;
      prompt?: string;
      intent?: FunnelConsultantIntent;
      includeAnalytics?: boolean;
    }) =>
      apiClient<FunnelConsultantProposal>(
        `/funnel-builder/recommendations/${vars.id}/consultant/propose`,
        {
          method: 'POST',
          body: JSON.stringify({
            prompt: vars.prompt,
            intent: vars.intent,
            includeAnalytics: vars.includeAnalytics,
          }),
        },
      ),
  });
}

export function useFunnelConsultantApply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      id: string;
      complete: FunnelCompleteSpec;
      specHash: string;
    }) =>
      apiClient<{
        recommendationId: string;
        complete: FunnelCompleteSpec;
        applied: false;
        deployable: false;
        budgetChanged: false;
        mode: 'draft';
      }>(`/funnel-builder/recommendations/${vars.id}/consultant/apply`, {
        method: 'POST',
        body: JSON.stringify({
          confirm: true,
          complete: vars.complete,
          specHash: vars.specHash,
        }),
      }),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['funnel-builder', 'recommendations'] });
      void qc.invalidateQueries({ queryKey: ['funnel-builder', 'recommendations', vars.id] });
      void qc.invalidateQueries({ queryKey: ['funnel-validator', vars.id] });
    },
  });
}
