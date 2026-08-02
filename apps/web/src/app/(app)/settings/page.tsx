'use client';

import { Suspense } from 'react';
import { LoadingState } from '@/components/shared/page-state';
import SettingsPageInner from './settings-inner';

export default function SettingsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <SettingsPageInner />
    </Suspense>
  );
}
