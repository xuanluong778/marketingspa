'use client';

import { Suspense } from 'react';
import { TeleprompterStudio } from '@/components/teleprompter/teleprompter-studio';
import { LoadingState } from '@/components/shared/page-state';

export default function TeleprompterPage() {
  return (
    <Suspense fallback={<LoadingState message="Đang tải Teleprompter…" />}>
      <TeleprompterStudio />
    </Suspense>
  );
}
