'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ContentCreatePanel } from '@/components/content-auto-post/content-create-panel';
import { ContentLibraryPanel } from '@/components/content-auto-post/content-library-panel';
import { AutoPostPublishPanel } from '@/components/content-auto-post/auto-post-publish-panel';
import { AutoPostSchedulePanel } from '@/components/content-auto-post/auto-post-schedule-panel';
import { AutoPostChannelsPanel } from '@/components/content-auto-post/auto-post-channels-panel';
import {
  CONTENT_AUTO_POST_MENU_DESCRIPTION,
  CONTENT_AUTO_POST_TABS,
  buildContentAutoPostHref,
  isContentAutoPostTab,
  legacyTabToContentAutoPostTab,
  type ContentAutoPostTab,
} from '@/lib/content-auto-post-routes';
import type { ContentHistoryItem } from '@/types/content-marketing';

export function ContentAutoPostShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const sectionParam = searchParams.get('section');
  const activeTab: ContentAutoPostTab = isContentAutoPostTab(tabParam)
    ? tabParam
    : legacyTabToContentAutoPostTab(tabParam) ?? 'create';
  const createSection: 'ad' | 'advanced' | 'personal' =
    sectionParam === 'personal' ? 'personal' : sectionParam === 'advanced' ? 'advanced' : 'ad';

  const [historyEditItem, setHistoryEditItem] = useState<ContentHistoryItem | null>(null);
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0);
  const [scheduleRefreshKey, setScheduleRefreshKey] = useState(0);

  const setTab = useCallback(
    (tab: ContentAutoPostTab) => {
      const extra: Record<string, string> = {};
      const from = searchParams.get('from');
      const facebook = searchParams.get('facebook');
      const message = searchParams.get('message');
      if (tab === 'auto-post' && from) extra.from = from;
      if (tab === 'channels' && facebook) {
        extra.facebook = facebook;
        if (message) extra.message = message;
      }
      router.replace(buildContentAutoPostHref(tab, Object.keys(extra).length ? extra : undefined));
    },
    [router, searchParams],
  );

  useEffect(() => {
    if (!isContentAutoPostTab(tabParam) && !legacyTabToContentAutoPostTab(tabParam)) {
      router.replace(buildContentAutoPostHref('create'));
    }
  }, [tabParam, router]);

  const handleHistoryChange = useCallback(() => {
    setLibraryRefreshKey((k) => k + 1);
  }, []);

  const handleHistoryEditApplied = useCallback(() => {
    setHistoryEditItem(null);
  }, []);

  const handleEditFromLibrary = useCallback((item: ContentHistoryItem) => {
    setHistoryEditItem(item);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Content & Auto post"
        description={CONTENT_AUTO_POST_MENU_DESCRIPTION}
      />

      <Tabs value={activeTab} onValueChange={(v) => setTab(v as ContentAutoPostTab)} className="space-y-6">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-white/15 p-1 text-white">
          {CONTENT_AUTO_POST_TABS.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:text-black data-[state=inactive]:text-white/80"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="create" className="mt-0">
          <ContentCreatePanel
            initialTab={createSection}
            historyEditItem={historyEditItem}
            onHistoryEditApplied={handleHistoryEditApplied}
            onHistoryChange={handleHistoryChange}
          />
        </TabsContent>

        <TabsContent value="library" className="mt-0">
          <ContentLibraryPanel
            refreshKey={libraryRefreshKey}
            onEditItem={handleEditFromLibrary}
            onNavigateTab={setTab}
          />
        </TabsContent>

        <TabsContent value="auto-post" className="mt-0">
          <AutoPostPublishPanel
            libraryRefreshKey={libraryRefreshKey}
            onScheduled={() => setScheduleRefreshKey((k) => k + 1)}
          />
        </TabsContent>

        <TabsContent value="schedule" className="mt-0" key={scheduleRefreshKey}>
          <AutoPostSchedulePanel />
        </TabsContent>

        <TabsContent value="channels" className="mt-0">
          <AutoPostChannelsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
