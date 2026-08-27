'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { clientTimezoneHeader, createIdempotencyKey } from '@/lib/assistant-ui';
import type {
  AssistantChatResponse,
  AssistantSessionDetail,
  AssistantSessionSummary,
} from '@/types/assistant';

const KEY = ['assistant'] as const;

export function useAssistantSessions(enabled = true) {
  return useQuery({
    queryKey: [...KEY, 'sessions'],
    enabled,
    queryFn: () => apiClient<AssistantSessionSummary[]>('/assistant/sessions'),
    staleTime: 15_000,
  });
}

export function useAssistantSession(sessionId: string | null | undefined) {
  return useQuery({
    queryKey: [...KEY, 'session', sessionId],
    enabled: Boolean(sessionId),
    queryFn: () => apiClient<AssistantSessionDetail>(`/assistant/sessions/${sessionId}`),
  });
}

export function useCreateAssistantSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title?: string } = {}) =>
      apiClient<AssistantSessionSummary>('/assistant/sessions', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'x-timezone': clientTimezoneHeader() },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...KEY, 'sessions'] });
    },
  });
}

export function useDeleteAssistantSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      apiClient<{ id: string; status: string }>(`/assistant/sessions/${sessionId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...KEY, 'sessions'] });
    },
  });
}

export type AssistantChatBody = {
  sessionId?: string;
  message: string;
  idempotencyKey?: string;
  filters?: {
    period?: string;
    dateFrom?: string;
    dateTo?: string;
    pageId?: string;
    pageName?: string;
    compare?: boolean;
  } | null;
  signal?: AbortSignal;
};

export async function postAssistantChat(body: AssistantChatBody): Promise<AssistantChatResponse> {
  const idem = body.idempotencyKey || createIdempotencyKey();
  return apiClient<AssistantChatResponse>('/assistant/chat', {
    method: 'POST',
    body: JSON.stringify({
      sessionId: body.sessionId || undefined,
      message: body.message,
      idempotencyKey: idem,
      filters: body.filters ?? undefined,
    }),
    headers: {
      'Idempotency-Key': idem,
      'x-timezone': clientTimezoneHeader(),
    },
    signal: body.signal,
  });
}

export function useAssistantChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: postAssistantChat,
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: [...KEY, 'sessions'] });
      if (data.sessionId) {
        void qc.invalidateQueries({ queryKey: [...KEY, 'session', data.sessionId] });
      }
    },
  });
}
