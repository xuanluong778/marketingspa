import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { AdPostKind } from '@/types/content-marketing';

const BASE = '/content-marketing';

export type AdUrlAnalyzeJob = {
  id: string;
  organizationId: string;
  userId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  stage: string;
  stageLabel: string;
  progressPercent: number;
  sourceUrl: string;
  adPostKind: AdPostKind;
  errorCode?: string | null;
  errorMessage?: string | null;
  result?: AdUrlAnalyzeSuggestion | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
};

export type AdUrlAnalyzeSuggestion = {
  adPostKind: AdPostKind;
  brandName?: string;
  targetAudience?: string;
  painPoints?: string;
  benefits?: string;
  offer?: string;
  product?: Record<string, string>;
  service?: Record<string, string>;
  presentFields: string[];
  omittedFields: string[];
  warnings: string[];
  pageTitle?: string;
  finalUrl?: string;
  confidence?: number;
};

export function useStartAdUrlAnalyze() {
  return useMutation({
    mutationFn: (body: {
      sourceUrl: string;
      adPostKind: AdPostKind;
      brandName?: string;
    }) =>
      apiClient<AdUrlAnalyzeJob>(`${BASE}/ad-url-analyze`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });
}

export function useAdUrlAnalyzeJob(jobId: string | null) {
  return useQuery({
    queryKey: ['content-marketing', 'ad-url-analyze', jobId],
    queryFn: () => apiClient<AdUrlAnalyzeJob>(`${BASE}/ad-url-analyze/${jobId}`),
    enabled: Boolean(jobId),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      if (!s || s === 'completed' || s === 'failed' || s === 'cancelled') return false;
      return 1500;
    },
  });
}

export function useCancelAdUrlAnalyze() {
  return useMutation({
    mutationFn: (jobId: string) =>
      apiClient<AdUrlAnalyzeJob>(`${BASE}/ad-url-analyze/${jobId}/cancel`, {
        method: 'POST',
      }),
  });
}
