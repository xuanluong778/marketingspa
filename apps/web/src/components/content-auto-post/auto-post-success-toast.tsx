'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

const TOAST_MS = 4500;

/** Short-lived success toast for Auto Post publish/sync actions. */
export function useAutoPostSuccessToast(kind: 'publish' | 'sync' = 'publish') {
  const [message, setMessage] = useState<string | null>(null);

  const show = useCallback((text: string) => {
    setMessage(text);
  }, []);

  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(() => setMessage(null), TOAST_MS);
    return () => window.clearTimeout(id);
  }, [message]);

  const Toast = message ? (
    <div
      role="status"
      aria-live="polite"
      {...(kind === 'publish'
        ? { 'data-auto-post-publish-toast': 'success' }
        : { 'data-fanpage-sync-toast': 'success' })}
      className="pointer-events-none fixed bottom-6 left-1/2 z-[200] flex max-w-[min(92vw,28rem)] -translate-x-1/2 items-center gap-2 rounded-lg border border-emerald-400/40 bg-[#083028] px-4 py-3 text-sm font-medium text-emerald-100 shadow-lg shadow-black/30"
    >
      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
      <span>{message}</span>
    </div>
  ) : null;

  return { show, Toast };
}
