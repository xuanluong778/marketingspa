'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { LoadingState } from '@/components/shared/page-state';

const ContentAutoPostShell = dynamic(
  () =>
    import('@/components/content-auto-post/content-auto-post-shell').then(
      (m) => m.ContentAutoPostShell,
    ),
  {
    ssr: false,
    loading: () => <LoadingState message="Đang tải Content & Auto post..." />,
  },
);

export default function ContentAutoPostPage() {
  return (
    <Suspense fallback={<LoadingState message="Đang tải..." />}>
      <ContentAutoPostShell />
    </Suspense>
  );
}
