import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { invalidateCredits } from '@/hooks/use-credit';
import { invalidateFanpageConnectionCaches } from '@/lib/invalidate-fanpage-connection-caches';
import type {
  AutoPostFacebookStatus,
  AutoPostFormState,
  AutoPostItem,
  AutoPostOAuthPagesResponse,
  AutoPostPlatformStatus,
  AutoPostStatus,
  AutoPostType,
} from '@/types/auto-post';

const BASE = '/auto-post';

export function useAutoPostStatus() {
  return useQuery({
    queryKey: ['auto-post', 'status'],
    queryFn: () => apiClient<AutoPostPlatformStatus>(`${BASE}/status`),
  });
}

export function useAutoPostFacebookStatus() {
  return useQuery({
    queryKey: ['auto-post', 'facebook'],
    queryFn: () => apiClient<AutoPostFacebookStatus>(`${BASE}/facebook/status`),
    staleTime: 30_000,
    refetchOnMount: true,
    retry: 1,
  });
}

export function useAutoPostOauthPages(enabled = false) {
  return useQuery({
    queryKey: ['auto-post', 'facebook', 'oauth', 'pages'],
    queryFn: () => apiClient<AutoPostOAuthPagesResponse>(`${BASE}/facebook/oauth/pages`),
    enabled,
    staleTime: 60_000,
    refetchOnMount: false,
    retry: false,
  });
}

/** Chi tiết Fanpage — key theo fanpageId; server cache theo org+fanpage. */
export function useFanpageDetails(
  fanpageId: string | null,
  enabled = true,
  organizationId?: string | null,
) {
  return useQuery({
    queryKey: [
      'auto-post',
      'facebook',
      'page-details',
      organizationId ?? 'org',
      fanpageId,
    ],
    queryFn: () =>
      apiClient<import('@/types/auto-post').FanpageDetailsResponse>(
        `${BASE}/facebook/pages/${fanpageId}/details`,
      ),
    enabled: Boolean(fanpageId) && enabled,
    staleTime: 4 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}

/** Bỏ cache server + lấy dữ liệu mới. */
export async function fetchFanpageDetailsRefresh(fanpageId: string) {
  return apiClient<import('@/types/auto-post').FanpageDetailsResponse>(
    `${BASE}/facebook/pages/${fanpageId}/details?refresh=true`,
  );
}

/** Đồng bộ live Graph API — không cache / không fallback dữ liệu cũ. */
export function useSyncFanpageDetails() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fanpageId: string) =>
      apiClient<import('@/types/auto-post').FanpageDetailsResponse>(
        `${BASE}/facebook/pages/${fanpageId}/sync`,
        { method: 'POST' },
      ),
    onSuccess: (data, fanpageId) => {
      qc.setQueriesData(
        { queryKey: ['auto-post', 'facebook', 'page-details'] },
        (current: import('@/types/auto-post').FanpageDetailsResponse | undefined) => {
          if (!current) return data;
          if (current.page?.id === fanpageId || data.page?.id === fanpageId) return data;
          return current;
        },
      );
      void qc.invalidateQueries({ queryKey: ['auto-post', 'facebook'] });
    },
  });
}

/** Chẩn đoán quyền Fanpage — không token. */
export function useFanpagePermissionsDiagnostics(enabled = false) {
  return useQuery({
    queryKey: ['auto-post', 'facebook', 'permissions-diagnostics'],
    queryFn: () =>
      apiClient<import('@/types/auto-post').FanpagePermissionsDiagnostics>(
        `${BASE}/facebook/permissions-diagnostics`,
      ),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

export function useAutoPostList(status?: AutoPostStatus, industryId?: string) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (industryId) params.set('industryId', industryId);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return useQuery({
    queryKey: ['auto-post', 'posts', status ?? 'all', industryId ?? 'all'],
    queryFn: () => apiClient<{ items: AutoPostItem[] }>(`${BASE}/posts${qs}`),
  });
}

export function useAutoPostMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    invalidateFanpageConnectionCaches(qc);
  };

  const connectFacebook = useMutation({
    mutationFn: async () => {
      const { url } = await apiClient<{ url: string; mode?: string }>(
        `${BASE}/facebook/oauth/start`,
      );
      window.location.href = url;
    },
  });

  const connectServerEnv = useMutation({
    mutationFn: async () => {
      const res = await apiClient<{ url: string; mode: string; connected?: boolean }>(
        `${BASE}/facebook/connect/server-env`,
        { method: 'POST' },
      );
      if (res.url) {
        window.location.href = res.url;
      }
      return res;
    },
    onSuccess: invalidate,
  });

  const disconnectFacebook = useMutation({
    mutationFn: () => apiClient(`${BASE}/facebook/disconnect`, { method: 'POST' }),
    onSuccess: invalidate,
  });

  const refreshPages = useMutation({
    mutationFn: () =>
      apiClient<import('@/types/auto-post').AutoPostRefreshPagesResult>(
        `${BASE}/facebook/pages/refresh`,
        { method: 'POST' },
      ),
    onSuccess: invalidate,
  });

  const selectOauthPages = useMutation({
    mutationFn: (pageIds: string[]) =>
      apiClient<import('@/types/auto-post').AutoPostSelectPagesResult>(
        `${BASE}/facebook/oauth/select`,
        {
          method: 'POST',
          body: JSON.stringify({ pageIds }),
        },
      ),
    onSuccess: invalidate,
  });

  /** @deprecated dùng selectOauthPages */
  const selectOauthPage = useMutation({
    mutationFn: (pageId: string) =>
      apiClient(`${BASE}/facebook/oauth/select`, {
        method: 'POST',
        body: JSON.stringify({ pageIds: [pageId] }),
      }),
    onSuccess: invalidate,
  });

  const disconnectPage = useMutation({
    mutationFn: (fanpageId: string) =>
      apiClient(`${BASE}/facebook/pages/${fanpageId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  const generateAi = useMutation({
    mutationFn: (
      body: Pick<
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
      > & { postType: AutoPostType },
    ) =>
      apiClient<{ caption: string; hashtags: string[]; cta: string }>(`${BASE}/ai/generate`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSettled: () => {
      void invalidateCredits(qc);
    },
  });

  const rewriteAi = useMutation({
    mutationFn: (body: {
      mode: 'rewrite' | 'shorten' | 'stronger_cta';
      caption: string;
      cta?: string;
    }) =>
      apiClient<{ caption: string; hashtags: string[]; cta: string }>(`${BASE}/ai/rewrite`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSettled: () => {
      void invalidateCredits(qc);
    },
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
      industryId?: string;
      industryName?: string;
      customIndustry?: string;
    }) =>
      apiClient<AutoPostItem>(`${BASE}/drafts`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: invalidate,
  });

  const publishNow = useMutation({
    mutationFn: (body: string | { postId: string; fanpageIds?: string[] }) => {
      const payload = typeof body === 'string' ? { postId: body } : body;
      return apiClient<AutoPostItem | { items: AutoPostItem[] }>(`${BASE}/publish`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: invalidate,
  });

  const schedule = useMutation({
    mutationFn: (body: { postId: string; scheduledAt: string; fanpageIds?: string[] }) =>
      apiClient<AutoPostItem | { items: AutoPostItem[] }>(`${BASE}/schedule`, {
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
    mutationFn: (postId: string) => apiClient(`${BASE}/posts/${postId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  return {
    connectFacebook,
    connectServerEnv,
    disconnectFacebook,
    disconnectPage,
    refreshPages,
    selectOauthPage,
    selectOauthPages,
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
