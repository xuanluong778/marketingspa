import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  ChatbotBot,
  ChatbotChannel,
  ChatbotConversation,
  ChatbotEmbedInfo,
  ChatbotFacebookPage,
  ChatbotKnowledgeSource,
  ChatbotLead,
  ChatbotOverview,
  ChatbotSettings,
  ChatbotOpenAiStatus,
} from '@/types/chatbot-cskh';

const KEY = ['chatbot-cskh'];

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

export function useChatbotInbox() {
  return useQuery({
    queryKey: [...KEY, 'inbox'],
    queryFn: () => apiClient<ChatbotConversation[]>('/chatbot-cskh/inbox'),
  });
}

export function useChatbotConversation(id: string | null) {
  return useQuery({
    queryKey: [...KEY, 'inbox', id],
    queryFn: () => apiClient<ChatbotConversation>(`/chatbot-cskh/inbox/${id}`),
    enabled: !!id,
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
      pageId: string;
      pageName: string;
      pageAccessToken: string;
    }) =>
      apiClient('/chatbot-cskh/facebook/pages', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
