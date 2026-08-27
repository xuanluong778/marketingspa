'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, apiUpload } from '@/lib/api-client';

export type ZaloOaItem = {
  id: string;
  channel: 'ZALO';
  providerKind: 'ZALO_OA' | 'ZBS_TEMPLATE';
  accountRef: string;
  displayName?: string | null;
  status: string;
  isPaused: boolean;
  hasCredentials?: boolean;
  tokenExpiresAt?: string | null;
  lastSyncedAt?: string | null;
  lastTestedAt?: string | null;
};

export type ZaloTemplateItem = {
  id: string;
  name: string;
  body: string;
  providerTemplateId?: string | null;
  approvalStatus: string;
  variables: string[] | unknown;
  isActive: boolean;
};

export type ZaloCampaignItem = {
  id: string;
  name: string;
  status: string;
  campaignType: string;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  totalRecipients: number;
  updatedAt: string;
  channelConnection?: { displayName?: string | null; accountRef: string };
};

const BASE = '/zalo-marketing';

export function useZaloOverview() {
  return useQuery({
    queryKey: ['zalo-marketing', 'overview'],
    queryFn: () => apiClient<Record<string, unknown>>(`${BASE}/overview`),
  });
}

export function useZaloOas() {
  return useQuery({
    queryKey: ['zalo-marketing', 'oa'],
    queryFn: () => apiClient<ZaloOaItem[]>(`${BASE}/oa`),
  });
}

export function useZaloTemplates(connectionId?: string) {
  const qs = connectionId ? `?connectionId=${encodeURIComponent(connectionId)}` : '';
  return useQuery({
    queryKey: ['zalo-marketing', 'templates', connectionId],
    queryFn: () => apiClient<ZaloTemplateItem[]>(`${BASE}/templates${qs}`),
  });
}

export function useZaloCampaigns(params?: Record<string, string>) {
  const qs = params
    ? `?${new URLSearchParams(params).toString()}`
    : '';
  return useQuery({
    queryKey: ['zalo-marketing', 'campaigns', params],
    queryFn: () =>
      apiClient<{ items: ZaloCampaignItem[]; total: number }>(`${BASE}/campaigns${qs}`),
  });
}

export function useZaloReports() {
  return useQuery({
    queryKey: ['zalo-marketing', 'reports'],
    queryFn: () => apiClient<Record<string, unknown>>(`${BASE}/reports`),
  });
}

export function useStartZaloOAuth() {
  return useMutation({
    mutationFn: (body?: { returnPath?: string }) =>
      apiClient<{ url: string; state: string }>(`${BASE}/oauth/start`, {
        method: 'POST',
        body: JSON.stringify(body ?? {}),
      }),
  });
}

export function useZaloOaDetail(id?: string) {
  return useQuery({
    queryKey: ['zalo-marketing', 'oa', id],
    queryFn: () => apiClient<ZaloOaItem>(`${BASE}/oa/${id}`),
    enabled: Boolean(id),
  });
}

export function useDisconnectZaloOa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ idempotent: boolean; connection: ZaloOaItem }>(`${BASE}/oa/${id}/disconnect`, {
        method: 'POST',
        body: '{}',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['zalo-marketing', 'oa'] });
      qc.invalidateQueries({ queryKey: ['zalo-marketing', 'overview'] });
    },
  });
}

export function useRefreshZaloOa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ connection: ZaloOaItem }>(`${BASE}/oa/${id}/refresh`, {
        method: 'POST',
        body: '{}',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['zalo-marketing', 'oa'] });
    },
  });
}

export function useConnectZaloZbs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      appId: string;
      secretKey: string;
      accessToken: string;
      accountRef: string;
      displayName?: string;
      oaConnectionId?: string;
    }) =>
      apiClient(`${BASE}/oa/zbs`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['zalo-marketing', 'oa'] });
    },
  });
}

export function useSyncZaloTemplates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (connectionId: string) =>
      apiClient(`${BASE}/templates/sync`, {
        method: 'POST',
        body: JSON.stringify({ connectionId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['zalo-marketing', 'templates'] });
      qc.invalidateQueries({ queryKey: ['zalo-marketing', 'oa'] });
    },
  });
}

export function useCreateZaloCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiClient(`${BASE}/campaigns`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['zalo-marketing', 'campaigns'] }),
  });
}

export function useUpdateZaloCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      apiClient(`${BASE}/campaigns/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['zalo-marketing', 'campaigns'] }),
  });
}

export function usePreviewZaloAudience() {
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiClient(`${BASE}/audience/preview`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });
}

export function useImportZaloAudience() {
  return useMutation({
    mutationFn: ({ connectionId, file }: { connectionId: string; file: File }) => {
      const fd = new FormData();
      fd.append('file', file);
      return apiUpload(`${BASE}/audience/import?connectionId=${encodeURIComponent(connectionId)}`, fd);
    },
  });
}

export function usePreviewZaloCampaign() {
  return useMutation({
    mutationFn: ({ id, sampleIdentityIds }: { id: string; sampleIdentityIds?: string[] }) =>
      apiClient(`${BASE}/campaigns/${id}/preview`, {
        method: 'POST',
        body: JSON.stringify({ sampleIdentityIds }),
      }),
  });
}

export function useStartZaloCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient(`${BASE}/campaigns/${id}/start`, { method: 'POST', body: '{}' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['zalo-marketing', 'campaigns'] }),
  });
}

export function useScheduleZaloCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, scheduledAt }: { id: string; scheduledAt: string }) =>
      apiClient(`${BASE}/campaigns/${id}/schedule`, {
        method: 'POST',
        body: JSON.stringify({ scheduledAt }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['zalo-marketing', 'campaigns'] }),
  });
}

export function useTestZaloZbs() {
  return useMutation({
    mutationFn: (body: {
      connectionId: string;
      templateId: string;
      phone?: string;
      userId?: string;
      templateData?: Record<string, string>;
    }) =>
      apiClient(`${BASE}/test/zbs`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });
}
