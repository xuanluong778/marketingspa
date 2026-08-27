import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  FunnelBlueprintDraft,
  FunnelBlueprintListItem,
  FunnelGenerateResult,
  FunnelApplyResult,
  FunnelStageRow,
  FunnelTemplateListItem,
  FunnelTemplateDetail,
  FunnelGeneratorResult,
  FunnelCompleteGenerateResult,
  FunnelCompleteSpec,
} from '@/types/funnel';

export function usePipelineStages() {
  return useQuery({
    queryKey: ['crm', 'pipeline'],
    queryFn: async () => {
      const res = await apiClient<
        FunnelStageRow[] | { id: string; name: string; stages?: FunnelStageRow[] }
      >('/crm/pipeline');
      if (Array.isArray(res)) return res;
      return res.stages ?? [];
    },
  });
}

export function useFunnelTemplates(opts?: { orgOnly?: boolean }) {
  const params = new URLSearchParams();
  if (opts?.orgOnly) params.set('orgOnly', 'true');
  const qs = params.toString();
  return useQuery({
    queryKey: ['funnel-builder', 'templates', opts?.orgOnly ? 'org' : 'all'],
    queryFn: () =>
      apiClient<{ items: FunnelTemplateListItem[] }>(
        `/funnel-builder/templates${qs ? `?${qs}` : ''}`,
      ),
  });
}

export function useFunnelTemplate(idOrSlug: string | null) {
  return useQuery({
    queryKey: ['funnel-builder', 'templates', idOrSlug],
    queryFn: () => apiClient<FunnelTemplateDetail>(`/funnel-builder/templates/${idOrSlug}`),
    enabled: !!idOrSlug,
  });
}

export function useCloneFunnelTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      idOrSlug,
      ...body
    }: {
      idOrSlug: string;
      name?: string;
      slug?: string;
      inputValues?: Record<string, unknown>;
    }) =>
      apiClient<FunnelTemplateDetail>(`/funnel-builder/templates/${idOrSlug}/clone`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['funnel-builder', 'templates'] });
    },
  });
}

export function useApplyFunnelTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      idOrSlug,
      ...body
    }: {
      idOrSlug: string;
      applyStages?: boolean;
      applyFlows?: boolean;
      activateFlows?: boolean;
      inputValues?: Record<string, unknown>;
      pipelineName?: string;
    }) =>
      apiClient<FunnelApplyResult & { templateId: string; templateSlug: string }>(
        `/funnel-builder/templates/${idOrSlug}/apply`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['funnel-builder', 'templates'] });
      void qc.invalidateQueries({ queryKey: ['funnel-builder', 'blueprints'] });
      void qc.invalidateQueries({ queryKey: ['crm', 'pipeline'] });
      void qc.invalidateQueries({ queryKey: ['funnel', 'stats'] });
    },
  });
}

export function useUpdateFunnelTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      description?: string;
      definition?: Record<string, unknown>;
      isActive?: boolean;
    }) =>
      apiClient<FunnelTemplateDetail>(`/funnel-builder/templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['funnel-builder', 'templates'] });
    },
  });
}

export function useGenerateFunnelRecommendations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      prompt: string;
      productService?: string;
      goal?: string;
      price?: string;
      budget?: string;
      region?: string;
      audience?: string;
      channels?: string[];
      notes?: string;
      industryHint?: string;
      regionHint?: string;
      budgetHint?: string;
    }) =>
      apiClient<FunnelGeneratorResult>('/funnel-builder/generate-recommendations', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['funnel-builder', 'recommendations'] });
    },
  });
}

export function useSelectFunnelRecommendation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, templateSlug }: { id: string; templateSlug: string }) =>
      apiClient<{
        id: string;
        selectedSlug: string;
        selectedAt: string;
        applied: false;
        deployable: false;
        nextStep: string;
      }>(`/funnel-builder/recommendations/${id}/select`, {
        method: 'POST',
        body: JSON.stringify({ templateSlug }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['funnel-builder', 'recommendations'] });
    },
  });
}

export function useGenerateFunnelComplete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<FunnelCompleteGenerateResult>(
        `/funnel-builder/recommendations/${id}/generate-complete`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['funnel-builder', 'recommendations'] });
    },
  });
}

export type FunnelScoringRule = {
  id?: string;
  key: string;
  label: string;
  eventType: string;
  points: number;
  condition?: { once?: boolean; cooldownMinutes?: number };
  isActive?: boolean;
  position?: number;
};

export type FunnelScoringConfig = {
  id: string;
  funnelId: string;
  maxScore: number;
  mqlThreshold: number;
  sqlThreshold: number;
  mqlStageId?: string | null;
  sqlStageId?: string | null;
  isActive: boolean;
  source: string;
  rules: FunnelScoringRule[];
  mqlStage?: { id: string; name: string; code: string } | null;
  sqlStage?: { id: string; name: string; code: string } | null;
};

export type FunnelScoringProposal = {
  maxScore: number;
  mqlThreshold: number;
  sqlThreshold: number;
  rules: FunnelScoringRule[];
  rationale: string;
};

export function useFunnelScoring(funnelId: string | null) {
  return useQuery({
    queryKey: ['funnel-builder', 'scoring', funnelId],
    enabled: Boolean(funnelId),
    queryFn: () =>
      apiClient<FunnelScoringConfig | null>(`/funnel-builder/recommendations/${funnelId}/scoring`),
  });
}

export function useProposeFunnelScoring() {
  return useMutation({
    mutationFn: (funnelId: string) =>
      apiClient<FunnelScoringProposal>(
        `/funnel-builder/recommendations/${funnelId}/scoring/propose`,
        { method: 'POST' },
      ),
  });
}

export function useSaveFunnelScoring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      funnelId,
      ...body
    }: {
      funnelId: string;
      maxScore?: number;
      mqlThreshold?: number;
      sqlThreshold?: number;
      mqlStageId?: string | null;
      sqlStageId?: string | null;
      isActive?: boolean;
      rules?: FunnelScoringRule[];
    }) =>
      apiClient<FunnelScoringConfig>(`/funnel-builder/recommendations/${funnelId}/scoring`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['funnel-builder', 'scoring', vars.funnelId] });
    },
  });
}

export function useApplyFunnelScoringProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (funnelId: string) =>
      apiClient<FunnelScoringConfig>(
        `/funnel-builder/recommendations/${funnelId}/scoring/apply-proposal`,
        { method: 'POST' },
      ),
    onSuccess: (_d, funnelId) => {
      void qc.invalidateQueries({ queryKey: ['funnel-builder', 'scoring', funnelId] });
    },
  });
}

export type FunnelRecommendationListItem = {
  id: string;
  prompt: string;
  source: string;
  selectedSlug: string | null;
  selectedAt: string | null;
  completeGeneratedAt: string | null;
  completeSource: string | null;
  createdAt: string;
  status?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  publishedVersion?: number;
  name?: string | null;
  offer?: string | null;
  kpis?: {
    leads: number;
    booking: number;
    purchase: number;
    revenue: number;
  };
};

export function useFunnelRecommendations() {
  return useQuery({
    queryKey: ['funnel-builder', 'recommendations'],
    queryFn: () => apiClient<FunnelRecommendationListItem[]>('/funnel-builder/recommendations'),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useFunnelRecommendation(id: string | null) {
  return useQuery({
    queryKey: ['funnel-builder', 'recommendations', id],
    enabled: Boolean(id),
    queryFn: () =>
      apiClient<
        FunnelGeneratorResult & {
          completeSpec?: FunnelCompleteSpec | null;
          status?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
          publishedVersion?: number;
          liveFrozen?: boolean;
        }
      >(`/funnel-builder/recommendations/${id}`),
  });
}

export type FunnelPublicForm = {
  id: string;
  name: string;
  offer: string;
  cta: string;
  summary?: string;
  leadForm: FunnelCompleteSpec['leadForm'];
  chatbotBotId: string | null;
  mode: 'draft';
};

export function useBindFunnelChatbot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, botId }: { id: string; botId?: string }) =>
      apiClient<{
        recommendationId: string;
        botId: string;
        botName: string;
        greeting: string;
        embed: { botId: string; embedCode: string; widgetUrl: string; publicApiUrl: string };
        applied: false;
        deployable: false;
      }>(`/funnel-builder/recommendations/${id}/bind-chatbot`, {
        method: 'POST',
        body: JSON.stringify(botId ? { botId } : {}),
      }),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['funnel-builder', 'recommendations', vars.id] });
    },
  });
}

export function useSaveFunnelCompleteDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, complete }: { id: string; complete: FunnelCompleteSpec }) =>
      apiClient<{
        recommendationId: string;
        complete: FunnelCompleteSpec;
        applied: false;
        deployable: false;
        mode: 'draft';
        liveFrozen?: boolean;
        publishedVersion?: number;
      }>(`/funnel-builder/recommendations/${id}/complete-draft`, {
        method: 'PATCH',
        body: JSON.stringify({ complete }),
      }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['funnel-builder', 'recommendations'] });
      void qc.invalidateQueries({
        queryKey: ['funnel-builder', 'recommendations', vars.id],
      });
    },
  });
}

export function useFunnelBlueprints(status?: string) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  const qs = params.toString();
  return useQuery({
    queryKey: ['funnel-builder', 'blueprints', status ?? 'all'],
    queryFn: () =>
      apiClient<FunnelBlueprintListItem[]>(`/funnel-builder/blueprints${qs ? `?${qs}` : ''}`),
  });
}

export function useGenerateFunnelBlueprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { prompt: string; industryHint?: string; includeAutomations?: boolean }) =>
      apiClient<FunnelGenerateResult>('/funnel-builder/generate', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['funnel-builder', 'blueprints'] });
    },
  });
}

export function useApplyFunnelBlueprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      blueprintId?: string;
      draft?: FunnelBlueprintDraft;
      applyStages?: boolean;
      applyFlows?: boolean;
      deactivateMissingStages?: boolean;
      activateFlows?: boolean;
    }) =>
      apiClient<FunnelApplyResult>('/funnel-builder/apply', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['funnel-builder', 'blueprints'] });
      void qc.invalidateQueries({ queryKey: ['crm', 'pipeline'] });
      void qc.invalidateQueries({ queryKey: ['funnel', 'stats'] });
    },
  });
}

export function useDiscardFunnelBlueprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ id: string; status: string }>(`/funnel-builder/blueprints/${id}/discard`, {
        method: 'PATCH',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['funnel-builder', 'blueprints'] });
    },
  });
}
