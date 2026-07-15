'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoadingState } from '@/components/shared/page-state';
import { buildContentAutoPostHref } from '@/lib/content-auto-post-routes';

function AiLegacyRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const tab = searchParams.get('tab');
    const extra: Record<string, string> = {};
    if (tab === 'personal') {
      router.replace(buildContentAutoPostHref('create', { section: 'personal' }));
      return;
    }
    if (tab === 'advanced') {
      router.replace(buildContentAutoPostHref('create', { section: 'advanced' }));
      return;
    }
    searchParams.forEach((value, key) => {
      if (key !== 'tab') extra[key] = value;
    });
    router.replace(
      buildContentAutoPostHref('create', Object.keys(extra).length ? extra : undefined),
    );
  }, [router, searchParams]);

  return <LoadingState message="Đang chuyển hướng..." />;
}

/** Redirect route cũ /ai → /content */
export default function AiLegacyRedirectPage() {
  return (
    <Suspense fallback={<LoadingState message="Đang chuyển hướng..." />}>
      <AiLegacyRedirectInner />
    </Suspense>
  );
}
