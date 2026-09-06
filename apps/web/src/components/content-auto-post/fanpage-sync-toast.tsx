'use client';

import { useAutoPostSuccessToast } from '@/components/content-auto-post/auto-post-success-toast';

/** Short-lived success toast for pages_read_engagement sync (Sync Page from Facebook). */
/** Sync toast marker: data-fanpage-sync-toast="success" */
export function useFanpageSyncToast() {
  return useAutoPostSuccessToast('sync');
}

export { useAutoPostSuccessToast };
