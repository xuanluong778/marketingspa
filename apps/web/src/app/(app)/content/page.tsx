'use client';

import dynamic from 'next/dynamic';
import { Suspense, useEffect, useState } from 'react';
import { LoadingState, ErrorState } from '@/components/shared/page-state';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n/i18n-provider';

function ContentAutoPostShellLoader() {
  const t = useT();
  return <LoadingState message={t('content.loadingAutoPost')} />;
}

const ContentAutoPostShell = dynamic(
  () =>
    import('@/components/content-auto-post/content-auto-post-shell').then(
      (m) => m.ContentAutoPostShell,
    ),
  {
    ssr: false,
    loading: () => <ContentAutoPostShellLoader />,
  },
);

function ContentPageBody() {
  const [chunkError, setChunkError] = useState(false);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const msg = String(event.message || '');
      const src = String((event.target as HTMLElement | null)?.getAttribute?.('src') || '');
      if (
        /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module/i.test(msg) ||
        /\/_next\/static\//.test(src)
      ) {
        setChunkError(true);
      }
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = String(event.reason?.message || event.reason || '');
      if (/Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module/i.test(reason)) {
        setChunkError(true);
      }
    };
    window.addEventListener('error', onError, true);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError, true);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  if (chunkError) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-6">
        <ErrorState message="Phiên bản web đã cập nhật — tải lại trang để tiếp tục." />
        <Button type="button" onClick={() => window.location.reload()}>
          Tải lại trang
        </Button>
      </div>
    );
  }

  return <ContentAutoPostShell />;
}

export default function ContentAutoPostPage() {
  const t = useT();
  return (
    <Suspense fallback={<LoadingState message={t('common.loading')} />}>
      <ContentPageBody />
    </Suspense>
  );
}
