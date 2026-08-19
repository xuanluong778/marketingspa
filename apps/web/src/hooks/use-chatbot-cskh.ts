import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, apiUpload } from '@/lib/api-client';
import { invalidateFanpageConnectionCaches } from '@/lib/invalidate-fanpage-connection-caches';
import type {
  ChatbotBot,
  ChatbotChannel,
  ChatbotConversation,
  ChatbotEmbedInfo,
  ChatbotFacebookPage,
  ChatbotInboxPage,
  ChatbotKnowledgeSource,
  ChatbotLead,
  ChatbotOverview,
  ChatbotSettings,
  ChatbotOpenAiStatus,
  ChatbotUnreadSummary,
} from '@/types/chatbot-cskh';

const KEY = ['chatbot-cskh'];
const INBOX_PAGE_SIZE = 25;

export function useChatbotOverview() {
  return useQuery({
    queryKey: [...KEY, 'overview'],
    queryFn: () => apiClient<ChatbotOverview>('/chatbot-cskh/overview'),
  });
}

export function useChatbotBots() {
  return useQuery({
    queryKey: [...KEY, 'bots'],
    queryFn: () => apiClient<ChatbotBot[]>('/chatbot-cskh/bots'),
  });
}

export function useChatbotKnowledge(botId?: string) {
  const qs = botId ? `?botId=${botId}` : '';
  return useQuery({
    queryKey: [...KEY, 'knowledge', botId],
    queryFn: () => apiClient<ChatbotKnowledgeSource[]>(`/chatbot-cskh/knowledge${qs}`),
  });
}

export function useChatbotChannels() {
  return useQuery({
    queryKey: [...KEY, 'channels'],
    queryFn: () => apiClient<ChatbotChannel[]>('/chatbot-cskh/channels'),
  });
}

/** Danh sách hội thoại — bắt buộc botId (Project); filter channel/channelId phía API. */
export function useChatbotInbox(opts?: {
  enabled?: boolean;
  pageSize?: number;
  botId?: string | null;
  channel?: 'all' | 'facebook' | 'website' | null;
  channelId?: string | null;
}) {
  const pageSize = opts?.pageSize ?? INBOX_PAGE_SIZE;
  const botId = opts?.botId || null;
  const channel = opts?.channel && opts.channel !== 'all' ? opts.channel : null;
  const channelId = opts?.channelId || null;
  const enabled = opts?.enabled !== false && Boolean(botId);
  return useInfiniteQuery({
    queryKey: [...KEY, 'inbox', pageSize, botId, channel, channelId],
    queryFn: ({ pageParam }) => {
      const qs = new URLSearchParams({ limit: String(pageSize) });
      if (pageParam) qs.set('cursor', pageParam);
      if (botId) qs.set('botId', botId);
      if (channel) qs.set('channel', channel);
      if (channelId) qs.set('channelId', channelId);
      return apiClient<ChatbotInboxPage>(`/chatbot-cskh/inbox?${qs}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
    staleTime: 20_000,
    refetchInterval: (query) => (query.state.data ? 30_000 : false),
    refetchOnWindowFocus: true,
  });
}

export function useChatbotUnreadSummary(
  limit = 15,
  opts?: { botId?: string | null; channel?: string | null; channelId?: string | null },
) {
  const botId = opts?.botId || null;
  const channel = opts?.channel || null;
  const channelId = opts?.channelId || null;
  return useQuery({
    queryKey: [...KEY, 'inbox-unread', limit, botId, channel, channelId],
    queryFn: () => {
      const qs = new URLSearchParams({ limit: String(limit) });
      if (botId) qs.set('botId', botId);
      if (channel) qs.set('channel', channel);
      if (channelId) qs.set('channelId', channelId);
      return apiClient<ChatbotUnreadSummary>(`/chatbot-cskh/inbox/unread-summary?${qs}`);
    },
    refetchInterval: 30_000,
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });
}

export function useChatbotInboxChannelOptions(botId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'inbox-channel-options', botId || 'all'],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (botId) qs.set('botId', botId);
      return apiClient<{
        fanpages: Array<{
          pageId: string;
          pageName: string | null;
          status?: string;
          botId: string;
          botName?: string;
        }>;
        websites: Array<{ domain: string; botId: string; botName?: string }>;
        projectFanpageCount?: number;
        projectWebsiteCount?: number;
      }>(`/chatbot-cskh/inbox/channel-options?${qs}`);
    },
    // Luôn fetch (kể cả chưa chọn bot) để hiện đủ Fanpage/Website org
    enabled: true,
    staleTime: 15_000,
  });
}

export function useMarkChatbotConversationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ ok: boolean; conversationId: string; staffReadAt: string }>(
        `/chatbot-cskh/inbox/${id}/read`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...KEY, 'inbox'] });
      void qc.invalidateQueries({ queryKey: [...KEY, 'inbox-unread'] });
    },
  });
}

/** Chỉ fetch messages khi đã chọn hội thoại. */
export function useChatbotConversation(id: string | null) {
  return useQuery({
    queryKey: [...KEY, 'inbox', 'detail', id],
    queryFn: () => apiClient<ChatbotConversation>(`/chatbot-cskh/inbox/${id}`),
    enabled: !!id,
    staleTime: 8_000,
    // Soft poll — socket invalidates the active thread
    refetchInterval: id ? 15_000 : false,
  });
}

export function useChatbotLeads() {
  return useQuery({
    queryKey: [...KEY, 'leads'],
    queryFn: () => apiClient<ChatbotLead[]>('/chatbot-cskh/leads'),
  });
}

export function useChatbotSettings() {
  return useQuery({
    queryKey: [...KEY, 'settings'],
    queryFn: () => apiClient<ChatbotSettings>('/chatbot-cskh/settings'),
  });
}

export function useChatbotOpenAiStatus(test = false) {
  const qs = test ? '?test=1' : '';
  return useQuery({
    queryKey: [...KEY, 'openai', test],
    queryFn: () => apiClient<ChatbotOpenAiStatus>(`/chatbot-cskh/openai/status${qs}`),
  });
}

export function useChatbotFacebookPages() {
  return useQuery({
    queryKey: [...KEY, 'facebook'],
    queryFn: () => apiClient<ChatbotFacebookPage[]>('/chatbot-cskh/facebook/pages'),
  });
}

export function useChatbotFacebookWebhookStatus() {
  return useQuery({
    queryKey: [...KEY, 'facebook-webhook-status'],
    queryFn: () =>
      apiClient<{
        ok: boolean;
        serverConfigured: boolean;
        pageIdMasked?: string | null;
        pageNameHint?: string | null;
        webhookUrl?: string;
        verifyTokenConfigured?: boolean;
        appSecretConfigured?: boolean;
        signatureMode?: string;
        subscribedFields?: string[];
        connectedPageCount?: number;
        webhookSubscribed?: boolean;
        botActive?: boolean;
        tokenHealth?: string;
        tokenError?: string | null;
        lastWebhookAt?: string | null;
        lastWebhookPageIdMasked?: string | null;
        lastWebhookEventId?: string | null;
        lastWebhookError?: string | null;
        lastErrorCode?: string | null;
        processedCount?: number;
        skippedCount?: number;
        verifyOk?: boolean;
        aiEnabled?: boolean;
        requiredScopes?: string[];
        hints?: string[];
        visitorAvatarAccess?: 'ok' | 'blocked' | 'unknown' | 'no_data';
        pages?: Array<{
          id: string;
          pageIdMasked: string;
          pageName: string;
          status: string;
          webhookSubscribed: boolean;
          aiEnabled: boolean;
          botName: string;
          botStatus: string;
          hasPageToken: boolean;
          pageIdMatchesEnv: boolean | null;
        }>;
        realtime?: {
          connected: boolean;
          status: string;
          subscribed: boolean;
          lastError: string | null;
          channel: string;
        };
      }>('/chatbot-cskh/facebook/webhook-status'),
    refetchInterval: 15_000,
  });
}

export function useCreateChatbotBot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<ChatbotBot>) =>
      apiClient<ChatbotBot>('/chatbot-cskh/bots', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateChatbotBot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<ChatbotBot> & { id: string }) =>
      apiClient<ChatbotBot>(`/chatbot-cskh/bots/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteChatbotBot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient(`/chatbot-cskh/bots/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useChatbotEmbed(botId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'embed', botId],
    queryFn: () => apiClient<ChatbotEmbedInfo>(`/chatbot-cskh/bots/${botId}/embed`),
    enabled: !!botId,
  });
}

export function useCreateKnowledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      botId: string;
      title: string;
      sourceType: string;
      content?: string;
      url?: string;
    }) =>
      apiClient('/chatbot-cskh/knowledge', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUploadKnowledgeDiagram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      botId: string;
      file: File;
      title?: string;
      replaceExisting?: boolean;
    }) => {
      const fd = new FormData();
      fd.append('file', params.file);
      fd.append('botId', params.botId);
      if (params.title) fd.append('title', params.title);
      if (params.replaceExisting) fd.append('replaceExisting', 'true');
      return apiUpload<{
        success: boolean;
        imported: number;
        skipped: number;
        filename: string;
      }>('/chatbot-cskh/knowledge/diagram', fd);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useCrawlKnowledgeUrl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      botId: string;
      url: string;
      title?: string;
      replaceExisting?: boolean;
    }) =>
      apiClient<{
        success: boolean;
        imported: number;
        url: string;
        title: string;
        contentLength: number;
        preview: string;
      }>('/chatbot-cskh/knowledge/crawl', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteKnowledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient(`/chatbot-cskh/knowledge/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useCreateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; channelType: string; botId?: string }) =>
      apiClient('/chatbot-cskh/channels', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient(`/chatbot-cskh/channels/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateChatbotSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<ChatbotSettings>) =>
      apiClient('/chatbot-cskh/settings', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useConnectFacebookPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      botId: string;
      pageName?: string;
      pageId?: string;
      pageAccessToken?: string;
      aiEnabled?: boolean;
    }) =>
      apiClient('/chatbot-cskh/facebook/pages', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => invalidateFanpageConnectionCaches(qc),
  });
}

export function useChatbotSuggest() {
  return useMutation({
    mutationFn: (body: {
      type: 'greeting' | 'services';
      botName?: string;
      businessName?: string;
      industry?: string;
      consultationTone?: string;
      mainServices?: string;
    }) =>
      apiClient<{ type: string; text: string; suggestions?: string[] }>('/chatbot-cskh/suggest', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });
}

export function useDisconnectFacebookPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient(`/chatbot-cskh/facebook/pages/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidateFanpageConnectionCaches(qc),
  });
}

export function useSyncChatbotFacebookFromAutoPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient('/chatbot-cskh/facebook/pages/sync-messaging', { method: 'POST' }),
    onSuccess: () => invalidateFanpageConnectionCaches(qc),
  });
}

export function useChatbotTakeover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: string; resumeBot?: boolean; employeeId?: string }) =>
      apiClient(`/chatbot-cskh/inbox/${params.id}/takeover`, {
        method: 'POST',
        body: JSON.stringify({
          resumeBot: params.resumeBot === true,
          employeeId: params.employeeId,
        }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
