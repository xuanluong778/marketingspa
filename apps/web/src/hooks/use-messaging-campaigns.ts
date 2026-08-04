import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { PaginatedResult } from '@/types/api';
import type {
  EligibilityPreviewResult,
  MessagingCampaignDetail,
  MessagingCampaignKind,
  MessagingSegmentConfig,
} from '@/types/messaging-campaign';
import type { MessageChannel } from '@/types/automation-messaging';

export interface CampaignInput {
  name: string;
  channel: MessageChannel;
  campaignType: MessagingCampaignKind;
  channelConnectionId?: string;
  messageTemplateId?: string;
  segmentConfig?: MessagingSegmentConfig;
  variables?: Record<string, string>;
  timezone?: string;
}

export function useMessagingCampaigns(params?: Record<string, string>) {
  const qs = params ? `?${new URLSearchParams(params)}` : '';
  return useQuery({
    queryKey: ['automation', 'messaging-campaigns', params],
    queryFn: () =>
      apiClient<PaginatedResult<MessagingCampaignDetail>>(
        `/automation/messaging-campaigns${qs}`,
      ),
  });
}

export function useMessagingCampaign(id: string | null) {
  return useQuery({
    queryKey: ['automation', 'messaging-campaigns', id],
    queryFn: () => apiClient<MessagingCampaignDetail>(`/automation/messaging-campaigns/${id}`),
    enabled: !!id,
  });
}

export function useCreateMessagingCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CampaignInput) =>
      apiClient<MessagingCampaignDetail>('/automation/messaging-campaigns', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation', 'messaging-campaigns'] }),
  });
}

export function useUpdateMessagingCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<CampaignInput> & { id: string }) =>
      apiClient<MessagingCampaignDetail>(`/automation/messaging-campaigns/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['automation', 'messaging-campaigns'] });
      qc.invalidateQueries({ queryKey: ['automation', 'messaging-campaigns', v.id] });
    },
  });
}

export function usePreviewCampaignEligibility() {
  return useMutation({
    mutationFn: ({ id, limit }: { id: string; limit?: number }) =>
      apiClient<EligibilityPreviewResult>(
        `/automation/messaging-campaigns/${id}/preview-eligibility`,
        { method: 'POST', body: JSON.stringify({ limit: limit ?? 500 }) },
      ),
  });
}

export function usePreviewCampaignSegment() {
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ total: number; suppressed: number; sample: unknown[] }>(
        `/automation/messaging-campaigns/${id}/preview-segment`,
        { method: 'POST', body: '{}' },
      ),
  });
}

export function useTestCampaignSend() {
  return useMutation({
    mutationFn: ({ id, identityId }: { id: string; identityId?: string }) =>
      apiClient(`/automation/messaging-campaigns/${id}/test-send`, {
        method: 'POST',
        body: JSON.stringify({ identityId }),
      }),
  });
}

export function useScheduleCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, scheduledAt, timezone }: { id: string; scheduledAt: string; timezone?: string }) =>
      apiClient(`/automation/messaging-campaigns/${id}/schedule`, {
        method: 'POST',
        body: JSON.stringify({ scheduledAt, timezone }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation', 'messaging-campaigns'] }),
  });
}

export function useStartCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient(`/automation/messaging-campaigns/${id}/start`, { method: 'POST', body: '{}' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation', 'messaging-campaigns'] }),
  });
}

export function usePauseCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient(`/automation/messaging-campaigns/${id}/pause`, { method: 'POST', body: '{}' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation', 'messaging-campaigns'] }),
  });
}

export function useResumeCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient(`/automation/messaging-campaigns/${id}/resume`, { method: 'POST', body: '{}' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation', 'messaging-campaigns'] }),
  });
}

export function useCancelCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient(`/automation/messaging-campaigns/${id}/cancel`, { method: 'POST', body: '{}' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation', 'messaging-campaigns'] }),
  });
}

export function useDuplicateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<MessagingCampaignDetail>(`/automation/messaging-campaigns/${id}/duplicate`, {
        method: 'POST',
        body: '{}',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation', 'messaging-campaigns'] }),
  });
}

export function useDeleteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ ok: boolean; id: string }>(`/automation/messaging-campaigns/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation', 'messaging-campaigns'] }),
  });
}
