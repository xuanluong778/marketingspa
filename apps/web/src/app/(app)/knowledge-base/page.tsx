'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingState } from '@/components/shared/page-state';

/** Redirect cũ /knowledge-base → Cài đặt → tab knowledge */
export default function KnowledgeBaseRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/settings?tab=knowledge');
  }, [router]);

  return <LoadingState message="Đang mở AI Knowledge Base trong Cài đặt…" />;
}
