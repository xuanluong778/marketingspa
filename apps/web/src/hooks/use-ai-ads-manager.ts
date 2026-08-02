import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdsSyncJobPublic, AdsSyncProgressEvent } from '@marketingspa/shared';
import { adsSyncJobPublicSchema, adsSyncProgressEventSchema } from '@marketingspa/shared';
import { apiClient } from '@/lib/api-client';
import type {
  AdConnectionItem,
  AdDraft,
  AdManagerCampaignRow,
  AdManagerCampaignsPage,
  AdManagerDashboard,
  AdManagerSettings,
  AdsCampaignFilters,
  AutomationLog,
  AutomationRule,
  EmailReportConfig,
} from '@/types/ai-ads-manager';

function defaultDateRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 7);
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
  };
}

export function useAdsDateRange() {
  return defaultDateRange();
}

export function useAiAdsDashboard(dateFrom: string, dateTo: string, enabled = true) {
  return useQuery({
    queryKey: ['ai-ads-manager', 'dashboard', dateFrom, dateTo],
    queryFn: () =>
      apiClient<AdManagerDashboard>(
        `/ai-ads-manager/dashboard?dateFrom=${dateFrom}&dateTo=${dateTo}`,
      ),
    enabled,
  });
}

export function useAiAdsConnections(enabled = true) {
  return useQuery({
    queryKey: ['ai-ads-manager', 'connections'],
    queryFn: () => apiClient<{ items: AdConnectionItem[] }>('/ai-ads-manager/connections'),
    enabled,
  });
}

export function useAiAdsCampaigns(
  filters: AdsCampaignFilters,
  enabled = true,
) {
  const { dateFrom, dateTo, platform, page = 1, pageSize = 50 } = filters;
  const params = new URLSearchParams({
    dateFrom,
    dateTo,
    page: String(page),
    pageSize: String(pageSize),
  });
  if (platform && platform !== 'ALL') params.set('platform', platform);

  return useQuery({
    queryKey: ['ai-ads-manager', 'campaigns', dateFrom, dateTo, platform ?? 'ALL', page, pageSize],
    queryFn: async () => {
      const res = await apiClient<AdManagerCampaignsPage>(
        `/ai-ads-manager/campaigns?${params.toString()}`,
      );
      return res;
    },
    enabled: enabled && Boolean(dateFrom && dateTo),
  });
}

export function useAiAdsSettings(enabled = true) {
  return useQuery({
    queryKey: ['ai-ads-manager', 'settings'],
    queryFn: () => apiClient<AdManagerSettings>('/ai-ads-manager/settings'),
    enabled,
  });
}

export function useAiAdsRules(enabled = true) {
  return useQuery({
    queryKey: ['ai-ads-manager', 'rules'],
    queryFn: () => apiClient<{ items: AutomationRule[] }>('/ai-ads-manager/rules'),
    enabled,
  });
}

export function useAiAdsLogs(enabled = true) {
  return useQuery({
    queryKey: ['ai-ads-manager', 'logs'],
    queryFn: () => apiClient<{ items: AutomationLog[] }>('/ai-ads-manager/logs'),
    enabled,
  });
}

export function useAiAdsDrafts(enabled = true) {
  return useQuery({
    queryKey: ['ai-ads-manager', 'drafts'],
    queryFn: () => apiClient<{ items: AdDraft[] }>('/ai-ads-manager/drafts'),
    enabled,
  });
}

export function useAiAdsEmailReports(enabled = true) {
  return useQuery({
    queryKey: ['ai-ads-manager', 'email-reports'],
    queryFn: () => apiClient<{ items: EmailReportConfig[] }>('/ai-ads-manager/email-reports'),
    enabled,
  });
}

function parseSyncJobs(payload: unknown): AdsSyncJobPublic[] {
  const raw = (payload as { items?: unknown })?.items;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const parsed = adsSyncJobPublicSchema.safeParse(item);
      return parsed.success ? parsed.data : null;
    })
    .filter((x): x is AdsSyncJobPublic => x != null);
}

/** Lịch sử / tiến độ sync — đọc Postgres qua API; poll khi còn job đang chạy. */
export function useAiAdsSyncJobs(enabled = true) {
  return useQuery({
    queryKey: ['ai-ads-manager', 'sync-jobs'],
    queryFn: async () => {
      const res = await apiClient<{ items: unknown }>('/ai-ads-manager/sync-jobs?limit=40');
      return { items: parseSyncJobs(res) };
    },
    enabled,
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      const active = items.some((j) => j.status === 'QUEUED' || j.status === 'RUNNING');
      return active ? 2500 : false;
    },
  });
}

export function useAiAdsSyncJob(jobId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['ai-ads-manager', 'sync-jobs', jobId],
    queryFn: async () => {
      const res = await apiClient<unknown>(`/ai-ads-manager/sync-jobs/${jobId}`);
      return adsSyncJobPublicSchema.parse(res);
    },
    enabled: enabled && Boolean(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'QUEUED' || status === 'RUNNING' ? 2000 : false;
    },
  });
}

export function parseAdsSyncProgressEvent(payload: unknown): AdsSyncProgressEvent | null {
  const parsed = adsSyncProgressEventSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

export function useAiAdsMutations() {
  const qc = useQueryClient();

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['ai-ads-manager'] });
  };

  const sync = useMutation({
    mutationFn: (body: { dateFrom: string; dateTo: string; platform?: string }) =>
      apiClient('/ai-ads-manager/sync', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai-ads-manager', 'sync-jobs'] });
      invalidate();
    },
  });

  const updateAutoMode = useMutation({
    mutationFn: (body: {
      autoModeEnabled: boolean;
      dailyBudgetLimit?: number;
      maxTogglesPerDay?: number;
    }) =>
      apiClient('/ai-ads-manager/settings/auto-mode', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: invalidate,
  });

  const emergencyStop = useMutation({
    mutationFn: (emergencyStop: boolean) =>
      apiClient('/ai-ads-manager/settings/emergency-stop', {
        method: 'PATCH',
        body: JSON.stringify({ emergencyStop }),
      }),
    onSuccess: invalidate,
  });

  const pauseCampaign = useMutation({
    mutationFn: (campaignId: string) =>
      apiClient('/ai-ads-manager/campaigns/pause', {
        method: 'POST',
        body: JSON.stringify({ campaignId }),
      }),
    onSuccess: invalidate,
  });

  const enableCampaign = useMutation({
    mutationFn: (campaignId: string) =>
      apiClient('/ai-ads-manager/campaigns/enable', {
        method: 'POST',
        body: JSON.stringify({ campaignId }),
      }),
    onSuccess: invalidate,
  });

  const optimizeCampaign = useMutation({
    mutationFn: (campaignId: string) =>
      apiClient('/ai-ads-manager/campaigns/optimize', {
        method: 'POST',
        body: JSON.stringify({ campaignId }),
      }),
    onSuccess: invalidate,
  });

  const createRule = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiClient('/ai-ads-manager/rules', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: invalidate,
  });

  const deleteRule = useMutation({
    mutationFn: (id: string) =>
      apiClient(`/ai-ads-manager/rules/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  const connectGoogle = useMutation({
    mutationFn: async () => {
      throw new Error('Dùng OAuth — không paste refresh token');
    },
  });

  const connectGmail = useMutation({
    mutationFn: (body: { refreshToken: string; email: string }) =>
      apiClient('/ai-ads-manager/connections/gmail', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: invalidate,
  });

  const disconnect = useMutation({
    mutationFn: (provider: string) =>
      apiClient(`/ai-ads-manager/connections/${provider}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  const generateDraft = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiClient('/ai-ads-manager/drafts/generate', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: invalidate,
  });

  const publishDraft = useMutation({
    mutationFn: (draftId: string) =>
      apiClient('/ai-ads-manager/drafts/publish', {
        method: 'POST',
        body: JSON.stringify({ draftId }),
      }),
    onSuccess: invalidate,
  });

  const upsertEmailReport = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiClient('/ai-ads-manager/email-reports', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: invalidate,
  });

  const sendReport = useMutation({
    mutationFn: ({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) =>
      apiClient(`/ai-ads-manager/email-reports/send?dateFrom=${dateFrom}&dateTo=${dateTo}`, {
        method: 'POST',
      }),
    onSuccess: invalidate,
  });

  const startMetaOAuth = async () => {
    const { url } = await apiClient<{ url: string }>('/ai-ads-manager/meta/oauth/start');
    window.location.href = url;
  };

  const startGoogleOAuth = async () => {
    const { url } = await apiClient<{ url: string }>('/ai-ads-manager/google/oauth/start');
    window.location.href = url;
  };

  return {
    sync,
    updateAutoMode,
    emergencyStop,
    pauseCampaign,
    enableCampaign,
    optimizeCampaign,
    createRule,
    deleteRule,
    connectGoogle,
    connectGmail,
    disconnect,
    generateDraft,
    publishDraft,
    upsertEmailReport,
    sendReport,
    startMetaOAuth,
    startGoogleOAuth,
  };
}
