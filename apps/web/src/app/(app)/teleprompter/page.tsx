'use client';

import { Suspense } from 'react';
import { TeleprompterStudio } from '@/components/teleprompter/teleprompter-studio';
import { LoadingState } from '@/components/shared/page-state';
import { useT } from '@/i18n/i18n-provider';

export default function TeleprompterPage() {
  const t = useT();
  return (
    <Suspense fallback={<LoadingState message={t('teleprompter.loadingPage')} />}>
      <TeleprompterStudio />
    </Suspense>
  );
}
