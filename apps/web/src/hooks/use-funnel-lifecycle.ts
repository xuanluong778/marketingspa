import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { FunnelCompleteSpec } from '@/types/funnel';

export type FunnelPublishStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';

export type FunnelVersionRow = {
  id: string;
  version: number;
  summary: string | null;
  createdById: string | null;
  createdAt: string;
};

export function useFunnelQuota() {
  return useQuery({
    queryKey: ['funnel-builder', 'quota'],
    queryFn: () =>
      apiClient<{
        maxFunnels: number;
        maxActive: number;
        usedFunnels: number;
        usedActive: number;
        planCode: string | null;
        isTrial: boolean;
      }>('/funnel-builder/quota'),
  });
}

export function useFunnelVersions(id: string | null) {
  return useQuery({
    queryKey: ['funnel-builder', 'versions', id],
    enabled: !!id,
    queryFn: () =>
      apiClient<FunnelVersionRow[]>(`/funnel-builder/recommendations/${id}/versions`),
  });
}

function invalidateFunnel(qc: ReturnType<typeof useQueryClient>, id: string) {
  void qc.invalidateQueries({ queryKey: ['funnel-builder', 'recommendations'] });
  void qc.invalidateQueries({ queryKey: ['funnel-builder', 'recommendations', id] });
  void qc.invalidateQueries({ queryKey: ['funnel-builder', 'versions', id] });
  void qc.invalidateQueries({ queryKey: ['funnel-builder', 'quota'] });
  void qc.invalidateQueries({ queryKey: ['funnel-validator', id] });
}

export function usePrepareFunnelPublish() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ complete: FunnelCompleteSpec; validation: { score: number; canActivate: boolean } }>(
        `/funnel-builder/recommendations/${id}/prepare-publish`,
        { method: 'POST' },
      ),
    onSuccess: (_d, id) => invalidateFunnel(qc, id),
  });
}

export function usePublishFunnel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; summary?: string }) =>
      apiClient<{ status: FunnelPublishStatus; publishedVersion: number; score: number }>(
        `/funnel-builder/recommendations/${vars.id}/publish`,
        { method: 'POST', body: JSON.stringify({ summary: vars.summary }) },
      ),
    onSuccess: (_d, vars) => invalidateFunnel(qc, vars.id),
  });
}

export function usePauseFunnel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ status: FunnelPublishStatus }>(`/funnel-builder/recommendations/${id}/pause`, {
        method: 'POST',
      }),
    onSuccess: (_d, id) => invalidateFunnel(qc, id),
  });
}

export function useArchiveFunnel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ status: FunnelPublishStatus }>(`/funnel-builder/recommendations/${id}/archive`, {
        method: 'POST',
      }),
    onSuccess: (_d, id) => invalidateFunnel(qc, id),
  });
}

export function useDeleteFunnel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ id: string; deleted: boolean }>(`/funnel-builder/recommendations/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: (_d, id) => invalidateFunnel(qc, id),
  });
}

export function useCloneFunnel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ id: string; clonedFromId: string; leadsCopied: number }>(
        `/funnel-builder/recommendations/${id}/clone`,
        { method: 'POST' },
      ),
    onSuccess: (_d, id) => invalidateFunnel(qc, id),
  });
}

export function useRestoreFunnelVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; versionId: string }) =>
      apiClient<{ complete: FunnelCompleteSpec; restoredVersion: number; liveUnchanged: boolean }>(
        `/funnel-builder/recommendations/${vars.id}/versions/${vars.versionId}/restore`,
        { method: 'POST' },
      ),
    onSuccess: (_d, vars) => invalidateFunnel(qc, vars.id),
  });
}
