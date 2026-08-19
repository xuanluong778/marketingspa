'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/page-header';
import { ZaloCampaignsTab } from '@/components/zalo-marketing/campaigns-tab';
import { ZaloTemplatesTab } from '@/components/zalo-marketing/templates-tab';
import { ZaloOaTab } from '@/components/zalo-marketing/oa-tab';
import { ZaloReportsTab } from '@/components/zalo-marketing/reports-tab';

const TAB_VALUES = ['campaigns', 'templates', 'oa', 'reports'] as const;
type TabValue = (typeof TAB_VALUES)[number];

function ZaloMarketingInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get('tab');
  const initial: TabValue =
    tabParam && (TAB_VALUES as readonly string[]).includes(tabParam)
      ? (tabParam as TabValue)
      : 'campaigns';
  const [activeTab, setActiveTab] = useState<TabValue>(initial);

  useEffect(() => {
    if (tabParam && (TAB_VALUES as readonly string[]).includes(tabParam)) {
      setActiveTab(tabParam as TabValue);
      return;
    }
    setActiveTab('campaigns');
    if (!tabParam) {
      router.replace('/zalo-marketing?tab=campaigns', { scroll: false });
    }
  }, [tabParam, router]);

  function changeTab(v: string) {
    const next = (TAB_VALUES as readonly string[]).includes(v) ? (v as TabValue) : 'campaigns';
    setActiveTab(next);
    router.replace(`/zalo-marketing?tab=${next}`, { scroll: false });
  }

  return (
    <div>
      <PageHeader
        title="Zalo Marketing"
        description="ZBS template, Broadcast OA, nhiều OA/tenant — API chính thức Zalo + BullMQ"
      />
      <Tabs value={activeTab} onValueChange={changeTab}>
        <TabsList className="mb-4 flex h-auto flex-wrap gap-1">
          <TabsTrigger value="campaigns">Chiến dịch</TabsTrigger>
          <TabsTrigger value="templates">Mẫu ZBS</TabsTrigger>
          <TabsTrigger value="oa">Zalo OA</TabsTrigger>
          <TabsTrigger value="reports">Báo cáo</TabsTrigger>
        </TabsList>
        <TabsContent value="campaigns">
          <ZaloCampaignsTab />
        </TabsContent>
        <TabsContent value="templates">
          <ZaloTemplatesTab />
        </TabsContent>
        <TabsContent value="oa">
          <ZaloOaTab />
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
