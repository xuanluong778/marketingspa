'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MetaFanpageAutoPostPanel } from '@/components/content-auto-post/meta-fanpage-auto-post-panel';
import { AutoPostFromLibraryPanel } from '@/components/content-auto-post/auto-post-from-library-panel';
import { AutoPostManualPanel } from '@/components/content-auto-post/auto-post-manual-panel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export type AutoPostSubTab = 'library' | 'manual';

/**
 * Auto Post: 2 tab con tách state.
 * forceMount + ẩn CSS để chuyển tab không mất bài đang soạn.
 */
export function AutoPostPublishPanel({
  libraryRefreshKey = 0,
  onScheduled,
}: {
  libraryRefreshKey?: number;
  onScheduled?: () => void;
}) {
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
      <MetaFanpageAutoPostPanel />

      <Tabs value={subTab} onValueChange={(v) => setSubTab(v as AutoPostSubTab)} className="w-full">
        <TabsList className="grid h-auto w-full max-w-lg grid-cols-2 gap-1 p-1">
          <TabsTrigger value="library" className="text-sm py-2">
            Đăng từ thư viện
          </TabsTrigger>
          <TabsTrigger value="manual" className="text-sm py-2">
            Đăng thủ công
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
