'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/page-header';
import { ZaloModeTab } from '@/components/zalo-marketing/mode-tab';
import { ZaloOaTab } from '@/components/zalo-marketing/oa-tab';
import { ZaloReportsTab } from '@/components/zalo-marketing/reports-tab';

const TAB_VALUES = ['broadcast', 'consult', 'zbs', 'oa', 'reports'] as const;
type TabValue = (typeof TAB_VALUES)[number];

function ZaloMarketingInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const tabParam = searchParams.get('tab');
  const oauthParam = searchParams.get('oauth');
  const oauthMsg = searchParams.get('msg');
  const [oauthBanner, setOauthBanner] = useState<{ kind: 'success' | 'error'; message: string } | null>(
    null,
  );
  const legacyMap: Record<string, TabValue> = {
    campaigns: 'broadcast',
    templates: 'zbs',
  };
  const resolved =
    tabParam && (TAB_VALUES as readonly string[]).includes(tabParam)
      ? (tabParam as TabValue)
      : tabParam && legacyMap[tabParam]
        ? legacyMap[tabParam]
        : 'broadcast';
  const [activeTab, setActiveTab] = useState<TabValue>(resolved);

  useEffect(() => {
    setActiveTab(resolved);
    if (!tabParam || !(TAB_VALUES as readonly string[]).includes(tabParam)) {
      router.replace(`/zalo-marketing?tab=${resolved}`, { scroll: false });
    }
  }, [tabParam, resolved, router]);

  useEffect(() => {
    if (oauthParam !== 'success' && oauthParam !== 'error') return;
    if (oauthParam === 'success') {
      setOauthBanner({ kind: 'success', message: 'Kết nối Zalo OA thành công.' });
      void queryClient.invalidateQueries({ queryKey: ['zalo-marketing'] });
    } else {
      setOauthBanner({
        kind: 'error',
        message: oauthMsg?.trim() || 'Kết nối Zalo OA thất bại.',
      });
    }
    router.replace(`/zalo-marketing?tab=oa`, { scroll: false });
  }, [oauthParam, oauthMsg, queryClient, router]);

  function changeTab(v: string) {
    const next = (TAB_VALUES as readonly string[]).includes(v) ? (v as TabValue) : 'broadcast';
    setActiveTab(next);
    router.replace(`/zalo-marketing?tab=${next}`, { scroll: false });
  }

  return (
    <div>
      <PageHeader
        title="Zalo Marketing"
        description="Ba chế độ gửi chính thức: Broadcast · Tin tư vấn · ZBS Template — multi-tenant theo organizationId"
      />
      <Tabs value={activeTab} onValueChange={changeTab}>
        <TabsList className="mb-4 flex h-auto flex-wrap gap-1">
          <TabsTrigger value="broadcast">Broadcast</TabsTrigger>
          <TabsTrigger value="consult">Tin Tư vấn</TabsTrigger>
          <TabsTrigger value="zbs">ZBS Template</TabsTrigger>
          <TabsTrigger value="oa">OA / ZBS</TabsTrigger>
          <TabsTrigger value="reports">Báo cáo</TabsTrigger>
        </TabsList>
        <TabsContent value="broadcast">
          <ZaloModeTab mode="BROADCAST" />
        </TabsContent>
        <TabsContent value="consult">
          <ZaloModeTab mode="TRANSACTIONAL" />
        </TabsContent>
        <TabsContent value="zbs">
          <ZaloModeTab mode="TEMPLATE" />
        </TabsContent>
        <TabsContent value="oa">
          <ZaloOaTab oauthBanner={oauthBanner} onDismissOauthBanner={() => setOauthBanner(null)} />
        </TabsContent>
        <TabsContent value="reports">
          <ZaloReportsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function ZaloMarketingPage() {
  return (
    <Suspense>
      <ZaloMarketingInner />
    </Suspense>
  );
}
