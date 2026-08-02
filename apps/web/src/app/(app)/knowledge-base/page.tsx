'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingState } from '@/components/shared/page-state';

/** Redirect cũ /knowledge-base → Cài đặt → tab Knowledge Base */
export default function KnowledgeBaseRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/settings?tab=knowledge-base');
  }, [router]);

  return <LoadingState message="Đang mở Knowledge Base trong Cài đặt…" />;
}
