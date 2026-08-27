import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdsSyncJobPublic, AdsSyncProgressEvent } from '@marketingspa/shared';
import { adsSyncJobPublicSchema, adsSyncProgressEventSchema } from '@marketingspa/shared';
import { apiClient } from '@/lib/api-client';
import type {
  AdConnectionItem,
  AdDraft,
  AdManagerCampaignsPage,
  AdManagerDashboard,
  AdManagerSettings,
  AdsCampaignFilters,
  AutomationLog,
  AutomationRule,
  EmailReportConfig,
} from '@/types/ai-ads-manager';

function defaultDateRange(days = 7) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
  };
}

export const ADS_DATE_PRESETS = [
  { label: '1 ngày', days: 1 },
  { label: '7 ngày', days: 7 },
  { label: '30 ngày', days: 30 },
  { label: '90 ngày', days: 90 },
] as const;

export function useAdsDateRange() {
  return defaultDateRange(7);
}

export function useAiAdsDashboard(dateFrom: string, dateTo: string, enabled = true) {
  return useQuery({
    queryKey: ['ai-ads-manager', 'dashboard', dateFrom, dateTo],
    queryFn: () =>
      apiClient<AdManagerDashboard>(
        `/ai-ads-manager/dashboard?dateFrom=${dateFrom}&dateTo=${dateTo}`,
      ),
    enabled,
    staleTime: 60_000,
  });
}

export function useAiAdsConnections(enabled = true) {
  return useQuery({
    queryKey: ['ai-ads-manager', 'connections'],
    queryFn: () => apiClient<{ items: AdConnectionItem[] }>('/ai-ads-manager/connections'),
    enabled,
  });
}

export function useGoogleAdsLinkedAccounts(enabled = true) {
  return useQuery({
    queryKey: ['ai-ads-manager', 'google-accounts'],
    queryFn: () =>
      apiClient<{
        items: Array<{
          customerId: string;
          name: string;
          loginCustomerId: string | null;
          isSelected: boolean;
        }>;
      }>('/ai-ads-manager/google/accounts'),
    enabled,
  });
}

export type GoogleAdsCampaignBuilderDraft = {
  id: string;
  customerId: string;
  loginCustomerId: string | null;
  status: string;
  brief: Record<string, unknown>;
  structuredDraft: Record<string, unknown>;
  validation: Record<string, unknown>;
  dailyBudget: number;
  monthlyEstimate: number;
  currency: string;
  approvedAt: string | null;
  previewedAt: string | null;
  lastError: string | null;
  latestDeployment: {
    id: string;
    status: string;
    lastError: string | null;
    createdResources: Record<string, unknown>;
  } | null;
};

export function useGoogleAdsCampaignBuilderDrafts(enabled = true) {
  return useQuery({
    queryKey: ['ai-ads-manager', 'gads-campaign-builder'],
    queryFn: () =>
      apiClient<{ items: GoogleAdsCampaignBuilderDraft[] }>(
        '/ai-ads-manager/google/campaign-builder/drafts',
      ),
    enabled,
  });
}

export function useGoogleAdsCampaignBuilderMutations() {
  const qc = useQueryClient();
  const invalidate = () =>
    void qc.invalidateQueries({ queryKey: ['ai-ads-manager', 'gads-campaign-builder'] });
  return {
    create: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        apiClient<GoogleAdsCampaignBuilderDraft>('/ai-ads-manager/google/campaign-builder/drafts', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      onSuccess: invalidate,
    }),
    preview: useMutation({
      mutationFn: (id: string) =>
        apiClient(`/ai-ads-manager/google/campaign-builder/drafts/${id}/preview`, {
          method: 'POST',
        }),
      onSuccess: invalidate,
    }),
    preflight: useMutation({
      mutationFn: (id: string) =>
        apiClient(`/ai-ads-manager/google/campaign-builder/drafts/${id}/preflight`, {
          method: 'POST',
        }),
      onSuccess: invalidate,
    }),
    approve: useMutation({
      mutationFn: (body: { id: string; confirm: boolean }) =>
        apiClient(`/ai-ads-manager/google/campaign-builder/drafts/${body.id}/approve`, {
          method: 'POST',
          body: JSON.stringify({ confirm: body.confirm }),
        }),
      onSuccess: invalidate,
    }),
    deploy: useMutation({
      mutationFn: (id: string) =>
        apiClient(`/ai-ads-manager/google/campaign-builder/drafts/${id}/deploy`, {
          method: 'POST',
        }),
      onSuccess: invalidate,
    }),
  };
}

export function useGoogleAdsCustomers(enabled = false) {
  return useQuery({
    queryKey: ['ai-ads-manager', 'google-customers'],
    queryFn: () =>
      apiClient<{
        items: Array<{
          customerId: string;
          name: string;
          currency: string;
          timezone: string;
          loginCustomerId: string | null;
        }>;
      }>('/ai-ads-manager/google/customers'),
    enabled,
  });
}

export function useAiAdsCampaigns(filters: AdsCampaignFilters, enabled = true) {
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
    mutationFn: (id: string) => apiClient(`/ai-ads-manager/rules/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  const connectGoogle = useMutation({
    mutationFn: (body: { customerId: string; customerName?: string; loginCustomerId?: string }) =>
      apiClient<{ message?: string; customerId?: string }>('/ai-ads-manager/google/customer', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (res) => {
      window.alert(res?.message ?? 'Đã chọn tài khoản Google Ads — hệ thống đang đồng bộ dữ liệu.');
      invalidate();
      void qc.invalidateQueries({ queryKey: ['ai-ads-manager', 'sync-jobs'] });
      void qc.invalidateQueries({ queryKey: ['ai-ads-manager', 'google-customers'] });
    },
    onError: (e) => {
      const msg =
        e &&
        typeof e === 'object' &&
        'guidance' in e &&
        typeof (e as { guidance?: string }).guidance === 'string'
          ? `${(e as Error).message}\n\nCách xử lý: ${(e as { guidance: string }).guidance}`
          : e instanceof Error
            ? e.message
            : 'Không chọn được tài khoản Google Ads';
      window.alert(msg);
    },
  });

  const syncGoogle = useMutation({
    mutationFn: (body?: { dateFrom?: string; dateTo?: string }) =>
      apiClient<{
        jobId?: string;
        message?: string;
        reused?: boolean;
        status?: string;
      }>('/ai-ads-manager/google/sync', {
        method: 'POST',
        body: JSON.stringify(body ?? {}),
      }),
    onSuccess: (res) => {
      const msg =
        res?.message ||
        (res?.reused
          ? 'Đã đồng bộ gần đây (idempotent) — dùng dữ liệu hiện có.'
          : res?.jobId
            ? `Đã xếp hàng đồng bộ (job ${res.jobId.slice(0, 8)}…).`
            : 'Đã gửi yêu cầu đồng bộ Google Ads.');
      window.alert(msg);
      void qc.invalidateQueries({ queryKey: ['ai-ads-manager', 'sync-jobs'] });
      invalidate();
    },
    onError: (e) => {
      const msg =
        e &&
        typeof e === 'object' &&
        'guidance' in e &&
        typeof (e as { guidance?: string }).guidance === 'string'
          ? `${(e as Error).message}\n\nCách xử lý: ${(e as { guidance: string }).guidance}`
          : e instanceof Error
            ? e.message
            : 'Đồng bộ Google Ads thất bại';
      window.alert(msg);
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
    syncGoogle,
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

export type GoogleAdsAutopilotConfig = {
  id: string;
  customerId: string;
  enabled: boolean;
  mode: 'RECOMMEND_ONLY' | 'AUTO_APPLY' | 'MANUAL' | 'GUARDED_AUTO';
  maxDailyBudget: number | null;
  targetCpa: number | null;
  targetRoas: number | null;
  stopLossDailySpend: number | null;
  maxActionsPerDay: number;
  actionsToday: number;
  cooldownMinutes: number;
  allowAutoPause: boolean;
  minRoas: number | null;
  emergencyStop: boolean;
  lastScanAt: string | null;
};

export type GoogleAdsAutopilotProposal = {
  id: string;
  actionType: string;
  status: string;
  riskLevel: string;
  reason: string | null;
  autoEligible: boolean;
};

export type GoogleAdsAutopilotAction = {
  id: string;
  actionType: string;
  status: string;
  providerWriteEnabled: boolean;
  createdAt: string;
  outcomes: Array<{ horizon: string; verdict: string }>;
};

export function useGoogleAdsAutopilot(customerId?: string) {
  const enabled = Boolean(customerId);
  const q = customerId ? encodeURIComponent(customerId) : '';
  return {
    config: useQuery({
      queryKey: ['ai-ads-manager', 'autopilot-config', customerId],
      queryFn: () =>
        apiClient<{ config: GoogleAdsAutopilotConfig | null }>(
          `/ai-ads-manager/google/autopilot/config?customerId=${q}`,
        ),
      enabled,
    }),
    proposals: useQuery({
      queryKey: ['ai-ads-manager', 'autopilot-proposals', customerId],
      queryFn: () =>
        apiClient<{ items: GoogleAdsAutopilotProposal[] }>(
          `/ai-ads-manager/google/autopilot/proposals?customerId=${q}`,
        ),
      enabled,
    }),
    actions: useQuery({
      queryKey: ['ai-ads-manager', 'autopilot-actions', customerId],
      queryFn: () =>
        apiClient<{ items: GoogleAdsAutopilotAction[] }>(
          `/ai-ads-manager/google/autopilot/actions?customerId=${q}`,
        ),
      enabled,
    }),
  };
}

export function useGoogleAdsAutopilotMutations(customerId?: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['ai-ads-manager', 'autopilot-config', customerId] });
    void qc.invalidateQueries({ queryKey: ['ai-ads-manager', 'autopilot-proposals', customerId] });
    void qc.invalidateQueries({ queryKey: ['ai-ads-manager', 'autopilot-actions', customerId] });
  };

  return {
    upsertConfig: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        apiClient('/ai-ads-manager/google/autopilot/config', {
          method: 'POST',
          body: JSON.stringify({ customerId, ...body }),
        }),
      onSuccess: invalidate,
    }),
    approveProposal: useMutation({
      mutationFn: (id: string) =>
        apiClient(`/ai-ads-manager/google/autopilot/proposals/${id}/approve`, {
          method: 'POST',
          body: JSON.stringify({}),
        }),
      onSuccess: invalidate,
    }),
    rejectProposal: useMutation({
      mutationFn: (body: { id: string; reason: string }) =>
        apiClient(`/ai-ads-manager/google/autopilot/proposals/${body.id}/reject`, {
          method: 'POST',
          body: JSON.stringify({ reason: body.reason }),
        }),
      onSuccess: invalidate,
    }),
    triggerScan: useMutation({
      mutationFn: () =>
        apiClient(
          `/ai-ads-manager/google/autopilot/scan?customerId=${encodeURIComponent(customerId ?? '')}`,
          {
            method: 'POST',
          },
        ),
      onSuccess: invalidate,
    }),
  };
}
