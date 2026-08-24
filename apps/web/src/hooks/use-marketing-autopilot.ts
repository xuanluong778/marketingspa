import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { buildProjectListApiQuery } from '@/lib/marketing-autopilot-project-query';
import type {
  MarketingAutopilotProject,
  MarketingAutopilotProjectInput,
  MarketingAutopilotProjectList,
  MarketingAutopilotProjectListQuery,
  MarketingAutopilotProjectFilterOptions,
  MarketingAutopilotStatus,
  MarketingAutopilotConfirmDraftResponse,
  MarketingContextResponse,
  AutopilotFormOptions,
  MarketingAutopilotContentIdeasResponse,
  AutofillResponse,
  UpdateMarketingAutopilotProjectInput,
  UpdateMarketingAutopilotProjectResponse,
  ArchiveMarketingAutopilotProjectResponse,
  MarketingMission,
} from '@/types/marketing-autopilot';

export function useMarketingAutopilotStatus() {
  return useQuery({
    queryKey: ['marketing-autopilot', 'status'],
    queryFn: () => apiClient<MarketingAutopilotStatus>('/marketing-autopilot/status'),
    retry: false,
  });
}

export function useMarketingAutopilotProjects(
  filters: MarketingAutopilotProjectListQuery = {},
  enabled = true,
) {
  return useQuery({
    queryKey: ['marketing-autopilot', 'projects', filters],
    queryFn: () =>
      apiClient<MarketingAutopilotProjectList>(
        `/marketing-autopilot/projects?${buildProjectListApiQuery(filters)}`,
      ),
    enabled,
    retry: false,
    placeholderData: (prev) => prev,
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      const busy = items.some((p) => {
        const m = p.mission;
        const s = m?.status;
        if (!s) return false;
        if (
          s === 'READY_FOR_APPROVAL' ||
          s === 'APPROVED' ||
          s === 'FAILED' ||
          s === 'BLOCKED'
        ) {
          return false;
        }
        if (s === 'RUNNING' && (m?.approval || m?.approvedAt)) return false;
        return (
          s === 'DRAFT' ||
          s === 'PENDING' ||
          s === 'GENERATING' ||
          s === 'QUEUED' ||
          s === 'RUNNING'
        );
      });
      return busy ? 2500 : false;
    },
  });
}

export function useMarketingAutopilotProjectFilterOptions(enabled = true) {
  return useQuery({
    queryKey: ['marketing-autopilot', 'projects', 'filter-options'],
    queryFn: () =>
      apiClient<MarketingAutopilotProjectFilterOptions>(
        '/marketing-autopilot/projects/filter-options',
      ),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

export function useMarketingAutopilotProjectDetail(projectId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ['marketing-autopilot', 'project', projectId],
    queryFn: () => apiClient<MarketingAutopilotProject>(`/marketing-autopilot/projects/${projectId}`),
    enabled: Boolean(enabled && projectId),
    retry: false,
  });
}

export function useCreateMarketingAutopilotProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MarketingAutopilotProjectInput) =>
      apiClient<MarketingAutopilotProject>('/marketing-autopilot/projects', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marketing-autopilot', 'projects'] });
    },
  });
}

export function useMarketingAutopilotProjectMission(projectId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ['marketing-autopilot', 'mission', projectId],
    queryFn: () =>
      apiClient<MarketingMission | null>(`/marketing-autopilot/projects/${projectId}/mission`),
    enabled: Boolean(enabled && projectId),
    retry: false,
    refetchInterval: (query) => {
      const m = query.state.data;
      if (!m) return false;
      if (
        m.status === 'READY_FOR_APPROVAL' ||
        m.status === 'APPROVED' ||
        m.status === 'FAILED' ||
        m.status === 'BLOCKED' ||
        (m.status === 'RUNNING' && (m.approval || m.approvedAt))
      ) {
        return false;
      }
      return 2000;
    },
  });
}

export function useApproveMarketingMission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (missionId: string) =>
      apiClient<MarketingMission>(`/marketing-autopilot/missions/${missionId}/approve`, {
        method: 'POST',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marketing-autopilot', 'projects'] });
      qc.invalidateQueries({ queryKey: ['marketing-autopilot', 'mission'] });
    },
  });
}

export function useConfirmMarketingAutopilotProjectDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { projectId: string; idempotencyKey?: string; draftTypes?: string[] }) => {
      const draftTypes = (params.draftTypes ?? [])
        .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
        .map((t) => t.trim());
      return apiClient<MarketingAutopilotConfirmDraftResponse>(
        `/marketing-autopilot/projects/${params.projectId}/confirm`,
        {
          method: 'POST',
          body: JSON.stringify({
            ...(params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : {}),
            ...(draftTypes.length ? { draftTypes } : {}),
          }),
          headers: params.idempotencyKey
            ? { 'idempotency-key': params.idempotencyKey }
            : undefined,
        },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marketing-autopilot', 'projects'] });
    },
  });
}

export function useMarketingAutopilotContext(enabled = true) {
  return useQuery({
    queryKey: ['marketing-autopilot', 'context'],
    queryFn: () => apiClient<MarketingContextResponse>('/marketing-autopilot/context'),
    enabled,
    retry: false,
    staleTime: 60_000,
  });
}

export function useRefreshMarketingAutopilotContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient<MarketingContextResponse>('/marketing-autopilot/context/refresh', {
        method: 'POST',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marketing-autopilot', 'context'] });
    },
  });
}

export function useMarketingAutopilotFormOptions(enabled = true) {
  return useQuery({
    queryKey: ['marketing-autopilot', 'form-options'],
    queryFn: () => apiClient<AutopilotFormOptions>('/marketing-autopilot/form-options'),
    enabled,
    retry: false,
    staleTime: 60_000,
  });
}

export function useMarketingAutopilotAutofill() {
  return useMutation({
    mutationFn: (body: {
      goals?: string[];
      productId?: string;
      customerMode?: 'ai' | 'segment' | 'manual';
      segmentId?: string;
    }) =>
      apiClient<AutofillResponse>('/marketing-autopilot/autofill', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });
}

export function useMarketingAutopilotContentIdeas(projectId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ['marketing-autopilot', 'content-ideas', projectId],
    queryFn: () =>
      apiClient<MarketingAutopilotContentIdeasResponse>(
        `/marketing-autopilot/projects/${projectId}/content-ideas`,
      ),
    enabled: Boolean(enabled && projectId),
    retry: false,
  });
}

export function useRegenerateMarketingContentIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { projectId: string; ideaIndex?: number }) =>
      apiClient<MarketingAutopilotContentIdeasResponse>(
        `/marketing-autopilot/projects/${params.projectId}/content-ideas/regenerate`,
        {
          method: 'POST',
          body: JSON.stringify(params.ideaIndex ? { ideaIndex: params.ideaIndex } : {}),
        },
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['marketing-autopilot', 'content-ideas', vars.projectId] });
      qc.invalidateQueries({ queryKey: ['marketing-autopilot', 'projects'] });
    },
  });
}

export function useSaveMarketingContentIdeaToStudio() {
  return useMutation({
    mutationFn: (params: { projectId: string; ideaIndex: number }) =>
      apiClient<{ contentId: string; editUrl: string; draftOnly: boolean }>(
        `/marketing-autopilot/projects/${params.projectId}/content-ideas/${params.ideaIndex}/save-studio`,
        { method: 'POST' },
      ),
  });
}

export function useUpdateMarketingAutopilotProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { projectId: string; body: UpdateMarketingAutopilotProjectInput }) =>
      apiClient<UpdateMarketingAutopilotProjectResponse>(
        `/marketing-autopilot/projects/${params.projectId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(params.body),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marketing-autopilot', 'projects'] });
    },
  });
}

export function useArchiveMarketingAutopilotProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) =>
      apiClient<ArchiveMarketingAutopilotProjectResponse>(
        `/marketing-autopilot/projects/${projectId}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marketing-autopilot', 'projects'] });
    },
  });
}
