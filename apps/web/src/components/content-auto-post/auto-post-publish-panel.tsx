'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AutoPostFromLibraryPanel } from '@/components/content-auto-post/auto-post-from-library-panel';
import { AutoPostManualPanel } from '@/components/content-auto-post/auto-post-manual-panel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n/i18n-provider';

export type AutoPostSubTab = 'library' | 'manual';

/**
 * Auto Post: 2 tab con tách state.
 * forceMount + ẩn CSS để chuyển tab không mất bài đang soạn.
 * (Không render MetaFanpageAutoPostPanel — trùng với Đăng thủ công bên dưới.)
 */
export function AutoPostPublishPanel({
  libraryRefreshKey = 0,
  onScheduled,
}: {
  libraryRefreshKey?: number;
  onScheduled?: () => void;
}) {
  const t = useT();
  const searchParams = useSearchParams();
  const [subTab, setSubTab] = useState<AutoPostSubTab>('library');

  // Deep-link từ thư viện / AI → mở tab Đăng từ thư viện
  useEffect(() => {
    if (searchParams.get('from')) {
      setSubTab('library');
    }
  }, [searchParams]);

  return (
    <div className="space-y-6">
      <Tabs value={subTab} onValueChange={(v) => setSubTab(v as AutoPostSubTab)} className="w-full">
        <TabsList className="grid h-auto w-full max-w-lg grid-cols-2 gap-1 p-1">
          <TabsTrigger value="library" className="text-sm py-2">
            {t('facebookFlow.autoPostFromLibrary')}
          </TabsTrigger>
          <TabsTrigger value="manual" className="text-sm py-2">
            {t('facebookFlow.autoPostManual')}
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="library"
          forceMount
          className={cn('mt-4 outline-none', subTab !== 'library' && 'hidden')}
        >
          <AutoPostFromLibraryPanel
            libraryRefreshKey={libraryRefreshKey}
            onScheduled={onScheduled}
          />
        </TabsContent>

        <TabsContent
          value="manual"
          forceMount
          className={cn('mt-4 outline-none', subTab !== 'manual' && 'hidden')}
        >
          <AutoPostManualPanel onScheduled={onScheduled} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
