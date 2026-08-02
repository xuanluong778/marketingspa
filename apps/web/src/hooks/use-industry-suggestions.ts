'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { IndustrySelectionLike, IndustrySuggestionBundle } from '@/lib/content-industry';

const BASE = '/content-marketing';

export function useIndustrySuggestions(selection: IndustrySelectionLike | null | undefined) {
  const industryId = selection?.industryId?.trim() || '';
  const industryName = selection?.industryName?.trim() || '';
  const customIndustry = selection?.customIndustry?.trim() || '';
  const enabled = Boolean(industryId || industryName || customIndustry);

  return useQuery({
    // Cache tách theo industryId — không tái sử dụng gợi ý ngành trước
    queryKey: [
      'content-marketing',
      'industry-suggestions',
      industryId || 'none',
      customIndustry || industryName || '',
    ],
    queryFn: () => {
      const body: Record<string, string> = {};
      if (industryId) body.industryId = industryId;
      if (industryName) body.industryName = industryName;
      if (customIndustry) body.customIndustry = customIndustry;
      return apiClient<IndustrySuggestionBundle>(`${BASE}/industry-suggestions`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
    enabled,
    staleTime: 5 * 60_000,
    placeholderData: undefined,
  });
}
