'use client';

import { useCallback, useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AdStudioTabPanel } from '@/components/content-marketing/content-marketing-studio';
import { AdvancedPostStudio } from '@/components/content-marketing/advanced-post-studio';
import { PersonalPostStudio } from '@/components/content-marketing/personal-post-studio';
import { AdsPolicyCheckStudio } from '@/components/content-marketing/ads-policy-check-studio';
import { VideoTranscriptionStudio } from '@/components/content-marketing/video-transcription/video-transcription-studio';
import type { ContentCreateSectionParam } from '@/lib/content-auto-post-routes';
import type { ContentHistoryItem } from '@/types/content-marketing';

type StudioInnerTab = 'ad' | 'advanced' | 'personal';

function toStudioInnerTab(
  section: ContentCreateSectionParam,
): StudioInnerTab | 'facebook-check' | 'video-transcript' {
  if (section === 'personal') return 'personal';
  if (section === 'advanced') return 'advanced';
  if (section === 'facebook-check' || section === 'ads-check') return 'facebook-check';
  if (section === 'video-transcript') return 'video-transcript';
  return 'ad';
}

export function ContentCreatePanel({
  historyEditItem,
  onHistoryEditApplied,
  onHistoryChange,
  initialTab = 'ad',
}: {
  historyEditItem?: ContentHistoryItem | null;
  onHistoryEditApplied?: () => void;
  onHistoryChange?: () => void;
  /** Canonical section from URL (`ads-check` already resolved to `facebook-check`). */
  initialTab?: ContentCreateSectionParam;
}) {
  const resolved = toStudioInnerTab(initialTab);
  const [innerTab, setInnerTab] = useState<StudioInnerTab>(
    resolved === 'facebook-check' || resolved === 'video-transcript' ? 'ad' : resolved,
  );

  useEffect(() => {
    if (resolved === 'facebook-check' || resolved === 'video-transcript') return;
    setInnerTab(resolved);
  }, [resolved]);

  useEffect(() => {
    if (historyEditItem?.tab === 'advanced') setInnerTab('advanced');
    if (historyEditItem?.tab === 'ad') setInnerTab('ad');
    if (historyEditItem?.tab === 'personal') setInnerTab('personal');
  }, [historyEditItem?.id, historyEditItem?.tab]);

  const handleHistoryChange = useCallback(() => {
    onHistoryChange?.();
  }, [onHistoryChange]);

  if (resolved === 'facebook-check') {
    return (
      <div className="content-create-tab space-y-6">
        <AdsPolicyCheckStudio />
      </div>
    );
  }

  if (resolved === 'video-transcript') {
    return (
      <div className="content-create-tab space-y-6">
        <VideoTranscriptionStudio />
      </div>
    );
  }

  return (
    <div className="content-create-tab space-y-6">
      <Tabs
        value={innerTab}
        onValueChange={(v) => setInnerTab(v as StudioInnerTab)}
        className="space-y-6"
      >
        <TabsList className="grid w-full max-w-2xl grid-cols-3 bg-white/15 text-white">
          <TabsTrigger
            value="ad"
            className="data-[state=active]:bg-white data-[state=active]:text-black data-[state=inactive]:text-white/80"
          >
            Quảng cáo bán hàng
          </TabsTrigger>
          <TabsTrigger
            value="advanced"
            className="data-[state=active]:bg-white data-[state=active]:text-black data-[state=inactive]:text-white/80"
          >
            Viết bài nâng cao
          </TabsTrigger>
          <TabsTrigger
            value="personal"
            className="data-[state=active]:bg-white data-[state=active]:text-black data-[state=inactive]:text-white/80"
          >
            Xây dựng thương hiệu
          </TabsTrigger>
        </TabsList>
        <TabsContent value="ad" className="mt-0 text-slate-900">
          <AdStudioTabPanel
            historyEditItem={historyEditItem?.tab === 'ad' ? historyEditItem : null}
            onHistoryEditApplied={onHistoryEditApplied}
            onHistoryChange={handleHistoryChange}
          />
        </TabsContent>
        <TabsContent value="advanced" className="mt-0 text-slate-900">
          <AdvancedPostStudio
            historyEditItem={historyEditItem?.tab === 'advanced' ? historyEditItem : null}
            onHistoryEditApplied={onHistoryEditApplied}
            onHistoryChange={handleHistoryChange}
          />
        </TabsContent>
        <TabsContent value="personal" className="mt-0 text-slate-900">
          <PersonalPostStudio
            historyEditItem={historyEditItem?.tab === 'personal' ? historyEditItem : null}
            onHistoryEditApplied={onHistoryEditApplied}
            onHistoryChange={handleHistoryChange}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
