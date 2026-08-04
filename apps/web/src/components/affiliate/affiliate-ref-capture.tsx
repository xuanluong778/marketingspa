'use client';

import { useEffect } from 'react';
import { captureAffiliateRefFromUrl } from '@/lib/affiliate-ref';
import { useTrackAffiliateClick } from '@/hooks/use-affiliate';

/** Bắt ?ref= trên mọi trang, lưu cookie/localStorage và track click (1 lần / session). */
export function AffiliateRefCapture() {
  const track = useTrackAffiliateClick();

  useEffect(() => {
    const code = captureAffiliateRefFromUrl();
    if (!code) return;
    const key = `msa_ref_tracked_${code}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      /* ignore */
    }
    void track.mutateAsync({
      code,
      landingPath: `${window.location.pathname}${window.location.search}`.slice(0, 500),
    }).catch(() => undefined);
  }, [track]);

  return null;
}

export default AffiliateRefCapture;
