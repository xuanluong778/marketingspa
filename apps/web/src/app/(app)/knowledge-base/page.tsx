'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingState } from '@/components/shared/page-state';
import { useT } from '@/i18n/i18n-provider';

/** Redirect cũ /knowledge-base → settings tab knowledge */
export default function KnowledgeBaseRedirectPage() {
  const t = useT();
  const router = useRouter();

  useEffect(() => {
    router.replace('/settings?tab=knowledge');
  }, [router]);

  return <LoadingState message={t('knowledgeBase.openInSettings')} />;
}
