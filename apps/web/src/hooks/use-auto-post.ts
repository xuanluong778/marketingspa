import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  AutoPostFacebookStatus,
  AutoPostFormState,
  AutoPostItem,
  AutoPostStatus,
  AutoPostType,
} from '@/types/auto-post';

const BASE = '/auto-post';

export function useAutoPostStatus() {
  return useQuery({
    queryKey: ['auto-post', 'status'],
    queryFn: () =>
      apiClient<{
        aiConfigured: boolean;
        metaConfigured: boolean;
        metaLoginConfigId?: boolean;
        metaPageEnvConfigured?: boolean;
      }>(`${BASE}/status`),
  });
}

export function useAutoPostFacebookStatus() {
  return useQuery({
    queryKey: ['auto-post', 'facebook'],
    queryFn: () => apiClient<AutoPostFacebookStatus>(`${BASE}/facebook/status`),
  });
}

export function useAutoPostList(status?: AutoPostStatus) {
  const qs = status ? `?status=${status}` : '';
  return useQuery({
    queryKey: ['auto-post', 'posts', status ?? 'all'],
    queryFn: () => apiClient<{ items: AutoPostItem[] }>(`${BASE}/posts${qs}`),
  });
}

export function useAutoPostMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['auto-post'] });
  };

  const connectFacebook = useMutation({
    mutationFn: async () => {
      const { url } = await apiClient<{ url: string }>(`${BASE}/facebook/oauth/start`);
      window.location.href = url;
    },
  });

  const disconnectFacebook = useMutation({
    mutationFn: () =>
      apiClient(`${BASE}/facebook/disconnect`, { method: 'POST' }),
    onSuccess: invalidate,
  });

  const refreshPages = useMutation({
    mutationFn: () =>
      apiClient(`${BASE}/facebook/pages/refresh`, { method: 'POST' }),
    onSuccess: invalidate,
  });

  const generateAi = useMutation({
    mutationFn: (body: Pick<
      AutoPostFormState,
      | 'postType'
      | 'topic'
      | 'spaService'
      | 'targetAudience'
      | 'tone'
      | 'promotion'
      | 'linkUrl'
      | 'hashtags'
      | 'cta'
    > & { postType: AutoPostType }) =>
      apiClient<{ caption: string; hashtags: string[]; cta: string }>(
        `${BASE}/ai/generate`,
        { method: 'POST', body: JSON.stringify(body) },
      ),
  });

  const rewriteAi = useMutation({
    mutationFn: (body: {
      mode: 'rewrite' | 'shorten' | 'stronger_cta';
      caption: string;
      cta?: string;
    }) =>
      apiClient<{ caption: string; hashtags: string[]; cta: string }>(
        `${BASE}/ai/rewrite`,
        { method: 'POST', body: JSON.stringify(body) },
      ),
  });

  const saveDraft = useMutation({
    mutationFn: (body: {
      id?: string;
      postType: AutoPostType;
      topic: string;
      caption: string;
      fanpageId?: string;
      imageUrl?: string;
      linkUrl?: string;
      hashtags?: string;
      cta?: string;
      spaService?: string;
      targetAudience?: string;
      tone?: string;
      promotion?: string;
    }) =>
      apiClient<AutoPostItem>(`${BASE}/drafts`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: invalidate,
  });

  const publishNow = useMutation({
    mutationFn: (postId: string) =>
      apiClient<AutoPostItem>(`${BASE}/publish`, {
        method: 'POST',
        body: JSON.stringify({ postId }),
      }),
    onSuccess: invalidate,
  });

  const schedule = useMutation({
    mutationFn: (body: { postId: string; scheduledAt: string }) =>
      apiClient<AutoPostItem>(`${BASE}/schedule`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: invalidate,
  });

  const cancelSchedule = useMutation({
    mutationFn: (postId: string) =>
      apiClient<AutoPostItem>(`${BASE}/schedule/${postId}/cancel`, {
        method: 'POST',
      }),
    onSuccess: invalidate,
  });

  const retry = useMutation({
    mutationFn: (postId: string) =>
      apiClient<AutoPostItem>(`${BASE}/posts/${postId}/retry`, {
        method: 'POST',
      }),
    onSuccess: invalidate,
  });

  const deletePost = useMutation({
    mutationFn: (postId: string) =>
      apiClient(`${BASE}/posts/${postId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  return {
    connectFacebook,
    disconnectFacebook,
    refreshPages,
    generateAi,
    rewriteAi,
    saveDraft,
    publishNow,
    schedule,
    cancelSchedule,
    retry,
    deletePost,
  };
}
