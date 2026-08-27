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
  CONTENT_AUTO_POST_TABS,
  buildContentAutoPostHref,
  isContentAutoPostTab,
  legacyTabToContentAutoPostTab,
  resolveContentCreateSection,
  type ContentAutoPostTab,
} from '@/lib/content-auto-post-routes';
import { useT } from '@/i18n/i18n-provider';
import type { ContentHistoryItem } from '@/types/content-marketing';

const TAB_I18N: Record<ContentAutoPostTab, string> = {
  create: 'facebookFlow.tabs.create',
  library: 'facebookFlow.tabs.library',
  'auto-post': 'facebookFlow.tabs.autoPost',
  schedule: 'facebookFlow.tabs.schedule',
  channels: 'facebookFlow.tabs.channels',
};

/** Chiều cao thanh tab (py-2 + trigger ~36px) — spacer tránh content bị che. */
const CONTENT_TAB_BAR_H = 'h-12';

export function ContentAutoPostShell() {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const sectionParam = searchParams.get('section');
  const activeTab: ContentAutoPostTab = isContentAutoPostTab(tabParam)
    ? tabParam
    : legacyTabToContentAutoPostTab(tabParam) ?? 'create';
  const { section: resolvedSection, invalid: sectionInvalid } =
    resolveContentCreateSection(sectionParam);

  const [historyEditItem, setHistoryEditItem] = useState<ContentHistoryItem | null>(null);
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0);
  const [scheduleRefreshKey, setScheduleRefreshKey] = useState(0);

  const setTab = useCallback(
    (tab: ContentAutoPostTab) => {
      const extra: Record<string, string> = {};
      const from = searchParams.get('from');
      const facebook = searchParams.get('facebook');
      const message = searchParams.get('message');
      const section = searchParams.get('section');
      if (tab === 'create' && section) extra.section = section;
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
      return;
    }
    if (activeTab === 'create') {
      if (sectionInvalid) {
        router.replace(buildContentAutoPostHref('create', { section: 'ad' }));
        return;
      }
      if (sectionParam === 'ads-check') {
        router.replace(buildContentAutoPostHref('create', { section: 'facebook-check' }));
      }
    }
  }, [tabParam, activeTab, sectionParam, sectionInvalid, router]);

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
    <div className="pb-10">
      <Tabs value={activeTab} onValueChange={(v) => setTab(v as ContentAutoPostTab)}>
        {/*
          fixed ngay dưới Topbar (h-14) theo viewport — không phụ thuộc sticky/main padding.
          lg:left-64 tránh đè sidebar.
        */}
        <div className="fixed inset-x-0 top-14 z-40 border-b border-white/10 bg-[#0A3D30] lg:left-64">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-none bg-transparent p-2 text-white">
            {CONTENT_AUTO_POST_TABS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="rounded-md text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:text-black data-[state=inactive]:text-white/80"
              >
                {t(TAB_I18N[tab.value])}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* Spacer = chiều cao bar fixed để nội dung không bị che / không tạo khoảng hở ảo */}
        <div className={CONTENT_TAB_BAR_H} aria-hidden />

        <div className="mt-4 space-y-6">
          <PageHeader
            title={t('facebookFlow.studioTitle')}
            description={t('facebookFlow.studioDescription')}
            titleClassName="text-2xl font-bold tracking-tight text-[#F97316] sm:text-3xl"
          />

          <TabsContent value="create" className="mt-0">
            <ContentCreatePanel
              initialTab={resolvedSection}
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
        </div>
      </Tabs>
    </div>
  );
}
