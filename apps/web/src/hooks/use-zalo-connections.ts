'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

/** Public Zalo OA connection — never includes plaintext tokens/secrets. */
export type ZaloConnectionStatus =
  | 'DISCONNECTED'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'REAUTH_REQUIRED'
  | 'ERROR'
  | 'PAUSED'
  | 'REFRESH_FAILED';

export interface ZaloConnectionItem {
  id: string;
  organizationId: string;
  oaId: string;
  oaName: string;
  /** true = encrypted at rest on server; never a token string */
  accessTokenEncrypted: boolean;
  refreshTokenEncrypted: boolean;
  webhookSecret: boolean;
  accessTokenExpiresAt?: string | null;
  refreshTokenExpiresAt?: string | null;
  status: ZaloConnectionStatus;
  lastTestedAt?: string | null;
  lastSyncedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CreateZaloConnectionBody = {
  oaId: string;
  oaName?: string;
  accessToken: string;
  refreshToken?: string;
  webhookSecret?: string;
  accessTokenExpiresAt?: string;
  refreshTokenExpiresAt?: string;
};

export type ZaloUiStatus =
  | 'Connected'
  | 'Token Expiring'
  | 'Error'
  | 'Disconnected'
  | 'Paused'
  | 'Refresh Failed'
  | 'Expired';

const EXPIRING_MS = 24 * 60 * 60 * 1000;

export function resolveZaloUiStatus(item: ZaloConnectionItem): ZaloUiStatus {
  if (item.status === 'PAUSED') return 'Paused';
  if (item.status === 'DISCONNECTED') return 'Disconnected';
  if (item.status === 'EXPIRED') return 'Expired';
  if (item.status === 'REFRESH_FAILED') return 'Refresh Failed';
  if (item.status === 'ERROR' || item.status === 'REAUTH_REQUIRED') {
    return 'Error';
  }
  if (item.status === 'ACTIVE') {
    const exp = item.accessTokenExpiresAt ? new Date(item.accessTokenExpiresAt).getTime() : null;
    if (exp && Number.isFinite(exp)) {
      if (exp <= Date.now()) return 'Expired';
      if (exp - Date.now() < EXPIRING_MS) return 'Token Expiring';
    }
    return 'Connected';
  }
  return 'Error';
}

export function useZaloConnections() {
  return useQuery({
    queryKey: ['zalo', 'connections'],
    queryFn: () => apiClient<ZaloConnectionItem[]>('/zalo/connections'),
    staleTime: 30_000,
    refetchOnMount: true,
  });
}

export function useCreateZaloConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateZaloConnectionBody) =>
      apiClient<ZaloConnectionItem>('/zalo/connections', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['zalo', 'connections'] });
    },
  });
}

export function useTestZaloConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{
        valid: boolean;
        message?: string;
        displayName?: string;
        connection: ZaloConnectionItem | null;
      }>(`/zalo/connections/${id}/test`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['zalo', 'connections'] });
    },
  });
}

export function useRefreshZaloConnectionToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<ZaloConnectionItem>(`/zalo/connections/${id}/refresh-token`, {
        method: 'POST',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['zalo', 'connections'] });
    },
  });
}

export function useDeleteZaloConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient(`/zalo/connections/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['zalo', 'connections'] });
    },
  });
}
