'use client';

import { useCallback, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import type { FunnelCompleteSpec, FunnelInlineContentPatch } from '@marketingspa/shared';

type SaveResult = {
  recommendationId: string;
  complete: FunnelCompleteSpec;
  saved: boolean;
  liveFrozen?: boolean;
  hasUnpublishedChanges?: boolean;
  publishedVersion?: number;
};

export function useFunnelInlineEditor(
  funnelId: string,
  opts?: { onSaved?: (res: SaveResult) => void },
) {
  const [savedFlash, setSavedFlash] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSaved = useCallback(() => {
    setSavedFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSavedFlash(false), 2000);
  }, []);

  const savePatch = useCallback(
    async (patch: FunnelInlineContentPatch) => {
      const res = await apiClient<SaveResult>(
        `/funnel-builder/recommendations/${funnelId}/inline-content`,
        {
          method: 'PATCH',
          body: JSON.stringify({ patch }),
        },
      );
      showSaved();
      opts?.onSaved?.(res);
    },
    [funnelId, opts, showSaved],
  );

  const publishLiveUpdate = useCallback(async () => {
    setPublishing(true);
    try {
      const res = await apiClient<{
        id: string;
        publishedVersion: number;
        hasUnpublishedChanges: boolean;
      }>(`/funnel-builder/recommendations/${funnelId}/publish-live-update`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      showSaved();
      opts?.onSaved?.({
        recommendationId: res.id,
        complete: {} as FunnelCompleteSpec,
        saved: true,
        hasUnpublishedChanges: res.hasUnpublishedChanges,
        publishedVersion: res.publishedVersion,
      });
    } finally {
      setPublishing(false);
    }
  }, [funnelId, opts, showSaved]);

  return { savePatch, publishLiveUpdate, savedFlash, publishing };
}

export async function fetchFunnelPreviewForm(funnelId: string) {
  try {
    const data = await apiClient<Record<string, unknown>>(
      `/funnel-builder/recommendations/${funnelId}/preview-form`,
    );
    return { ok: true as const, data };
  } catch {
    return { ok: false as const };
  }
}
