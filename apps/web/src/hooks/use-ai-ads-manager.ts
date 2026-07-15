import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  AdConnectionItem,
  AdDraft,
  AdManagerCampaignRow,
  AdManagerDashboard,
  AdManagerSettings,
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

export function useAiAdsDashboard(dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: ['ai-ads-manager', 'dashboard', dateFrom, dateTo],
    queryFn: () =>
      apiClient<AdManagerDashboard>(
        `/ai-ads-manager/dashboard?dateFrom=${dateFrom}&dateTo=${dateTo}`,
      ),
  });
}

export function useAiAdsConnections() {
  return useQuery({
    queryKey: ['ai-ads-manager', 'connections'],
    queryFn: () => apiClient<{ items: AdConnectionItem[] }>('/ai-ads-manager/connections'),
  });
}

export function useAiAdsCampaigns(dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: ['ai-ads-manager', 'campaigns', dateFrom, dateTo],
    queryFn: () =>
      apiClient<{ items: AdManagerCampaignRow[] }>(
        `/ai-ads-manager/campaigns?dateFrom=${dateFrom}&dateTo=${dateTo}`,
      ),
  });
}

export function useAiAdsSettings() {
  return useQuery({
    queryKey: ['ai-ads-manager', 'settings'],
    queryFn: () => apiClient<AdManagerSettings>('/ai-ads-manager/settings'),
  });
}

export function useAiAdsRules() {
  return useQuery({
    queryKey: ['ai-ads-manager', 'rules'],
    queryFn: () => apiClient<{ items: AutomationRule[] }>('/ai-ads-manager/rules'),
  });
}

export function useAiAdsLogs() {
  return useQuery({
    queryKey: ['ai-ads-manager', 'logs'],
    queryFn: () => apiClient<{ items: AutomationLog[] }>('/ai-ads-manager/logs'),
  });
}

export function useAiAdsDrafts() {
  return useQuery({
    queryKey: ['ai-ads-manager', 'drafts'],
    queryFn: () => apiClient<{ items: AdDraft[] }>('/ai-ads-manager/drafts'),
  });
}

export function useAiAdsEmailReports() {
  return useQuery({
    queryKey: ['ai-ads-manager', 'email-reports'],
    queryFn: () => apiClient<{ items: EmailReportConfig[] }>('/ai-ads-manager/email-reports'),
  });
}

export function useAiAdsMutations() {
  const qc = useQueryClient();

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['ai-ads-manager'] });
  };

  const sync = useMutation({
    mutationFn: (body: { dateFrom: string; dateTo: string; platform?: string }) =>
      apiClient('/ai-ads-manager/sync', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: invalidate,
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
    mutationFn: (body: { refreshToken: string; customerId: string; accountName?: string }) =>
      apiClient('/ai-ads-manager/connections/google', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: invalidate,
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
  };
}
