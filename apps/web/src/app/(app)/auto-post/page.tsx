'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoadingState } from '@/components/shared/page-state';
import { buildContentAutoPostHref } from '@/lib/content-auto-post-routes';

function AutoPostLegacyRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const extra: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      extra[key] = value;
    });
    const facebook = extra.facebook;
    if (facebook === 'connected' || facebook === 'error') {
      router.replace(buildContentAutoPostHref('channels', extra));
      return;
    }
    router.replace(
      buildContentAutoPostHref('auto-post', Object.keys(extra).length ? extra : undefined),
    );
  }, [router, searchParams]);

  return <LoadingState message="Đang chuyển hướng..." />;
}

/** Redirect route cũ /auto-post → /content */
export default function AutoPostLegacyRedirectPage() {
  return (
    <Suspense fallback={<LoadingState message="Đang chuyển hướng..." />}>
      <AutoPostLegacyRedirectInner />
    </Suspense>
  );
}
