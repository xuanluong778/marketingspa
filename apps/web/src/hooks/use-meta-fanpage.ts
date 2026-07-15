import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { MetaFanpagePublishResult, MetaFanpageStatus } from '@/types/meta-fanpage';

const BASE = '/meta-fanpage';

export function useMetaFanpageStatus(enabled = true) {
  return useQuery({
    queryKey: ['meta-fanpage', 'status'],
    queryFn: () => apiClient<MetaFanpageStatus>(`${BASE}/status`),
    enabled,
    refetchOnWindowFocus: false,
  });
}

export function useMetaFanpageMutations() {
  const qc = useQueryClient();

  const checkConnection = useMutation({
    mutationFn: () => apiClient<MetaFanpageStatus>(`${BASE}/status`),
    onSuccess: (data) => {
      qc.setQueryData(['meta-fanpage', 'status'], data);
    },
  });

  const publishNow = useMutation({
    mutationFn: (body: { message: string; link?: string; imageUrl?: string }) =>
      apiClient<MetaFanpagePublishResult>(`${BASE}/posts`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meta-fanpage'] });
      qc.invalidateQueries({ queryKey: ['auto-post'] });
    },
  });

  return { checkConnection, publishNow };
}
