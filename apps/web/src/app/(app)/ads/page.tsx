'use client';

import dynamic from 'next/dynamic';
import { LoadingState } from '@/components/shared/page-state';

const AiAdsManagerPage = dynamic(
  () =>
    import('@/components/ai-ads-manager/ai-ads-manager-page').then((m) => ({
      default: m.AiAdsManagerPage,
    })),
  { loading: () => <LoadingState />, ssr: false },
);

export default function AdsPage() {
  return <AiAdsManagerPage />;
}
