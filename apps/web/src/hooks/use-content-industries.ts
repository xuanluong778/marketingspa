import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

const BASE = '/content-marketing';

export type ContentIndustryItem = {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
};

export type IndustryPreferenceValue = {
  industryId: string | null;
  industryName: string | null;
  customIndustry: string | null;
  source: 'user' | 'organization';
};

export function useContentIndustries(q?: string) {
  const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
  return useQuery({
    queryKey: ['content-marketing', 'industries', q ?? ''],
    queryFn: () =>
      apiClient<{
        items: ContentIndustryItem[];
        otherOption: { id: null; slug: string; name: string };
      }>(`${BASE}/industries${qs}`),
  });
}

export function useIndustryPreference() {
  return useQuery({
    queryKey: ['content-marketing', 'industry-preference'],
    queryFn: () =>
      apiClient<{
        user: IndustryPreferenceValue | null;
        organization: IndustryPreferenceValue | null;
        resolved: IndustryPreferenceValue | null;
      }>(`${BASE}/industry-preference`),
  });
}

export function useUpsertIndustryPreference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      scope?: 'user' | 'organization';
      industryId?: string;
      industryName?: string;
      customIndustry?: string;
    }) =>
      apiClient(`${BASE}/industry-preference`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['content-marketing', 'industry-preference'] });
    },
  });
}

export function useAdminContentIndustries(enabled = false) {
  return useQuery({
    queryKey: ['content-marketing', 'admin', 'industries'],
    queryFn: () =>
      apiClient<{ items: ContentIndustryItem[] }>(`${BASE}/admin/industries`),
    enabled,
  });
}

export function useAdminIndustryMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['content-marketing', 'admin', 'industries'] });
    void qc.invalidateQueries({ queryKey: ['content-marketing', 'industries'] });
  };

  const create = useMutation({
    mutationFn: (body: { name: string; slug?: string; sortOrder?: number; isActive?: boolean }) =>
      apiClient(`${BASE}/admin/industries`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      slug?: string;
      sortOrder?: number;
      isActive?: boolean;
    }) =>
      apiClient(`${BASE}/admin/industries/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: invalidate,
  });

  const hide = useMutation({
    mutationFn: (id: string) =>
      apiClient(`${BASE}/admin/industries/${id}/hide`, { method: 'POST' }),
    onSuccess: invalidate,
  });

  return { create, update, hide };
}
