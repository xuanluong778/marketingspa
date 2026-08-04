'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type ChannelConnectionStatus =
  | 'DISCONNECTED'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'REAUTH_REQUIRED'
  | 'ERROR'
  | 'PAUSED';

export type ChannelProviderKind = 'MESSENGER' | 'ZALO_OA' | 'ZBS_TEMPLATE';

export interface ChannelConnectionItem {
  id: string;
  channel: 'MESSENGER' | 'ZALO';
  providerKind: ChannelProviderKind;
  accountRef: string;
  displayName?: string | null;
  status: ChannelConnectionStatus;
  permissions: string[];
  tokenExpiresAt?: string | null;
  lastSyncedAt?: string | null;
  lastTestedAt?: string | null;
  webhookSubscribed: boolean;
  isPaused: boolean;
  hasCredentials: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export function useChannelConnections() {
  return useQuery({
    queryKey: ['automation', 'channel-connections'],
    queryFn: () => apiClient<ChannelConnectionItem[]>('/automation/channel-connections'),
  });
}

export function useConnectMessengerChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      pageId: string;
      pageAccessToken: string;
      pageName?: string;
      subscribeWebhook?: boolean;
    }) => apiClient<ChannelConnectionItem>('/automation/channel-connections/messenger', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation', 'channel-connections'] }),
  });
}

export function useConnectZaloChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      oaId: string;
      accessToken: string;
      oaName?: string;
      webhookSecret?: string;
    }) =>
      apiClient<ChannelConnectionItem>('/automation/channel-connections/zalo', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation', 'channel-connections'] }),
  });
}

export function useTestChannelConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ valid: boolean; message: string; connection: ChannelConnectionItem }>(
        `/automation/channel-connections/${id}/test`,
        { method: 'POST' },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation', 'channel-connections'] }),
  });
}

export function usePauseChannelConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isPaused }: { id: string; isPaused: boolean }) =>
      apiClient<ChannelConnectionItem>(`/automation/channel-connections/${id}/pause`, {
        method: 'PATCH',
        body: JSON.stringify({ isPaused }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation', 'channel-connections'] }),
  });
}

export function useDeleteChannelConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient(`/automation/channel-connections/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation', 'channel-connections'] }),
  });
}

export function useReconnectChannelConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, credentials }: { id: string; credentials: Record<string, string> }) =>
      apiClient<ChannelConnectionItem>(`/automation/channel-connections/${id}/reconnect`, {
        method: 'POST',
        body: JSON.stringify({ credentials }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation', 'channel-connections'] }),
  });
}

/** Đồng bộ Fanpage/OA từ Chatbot CSKH + Content OAuth → kết nối nhắn tin hàng loạt */
export function useSyncMessagingFromChatbot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient<{
        synced: number;
        failed: number;
        results: Array<{
          pageId: string;
          pageName: string | null;
          source?: string;
          ok: boolean;
          error?: string;
        }>;
      }>('/chatbot-cskh/facebook/pages/sync-messaging', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation', 'channel-connections'] }),
  });
}
