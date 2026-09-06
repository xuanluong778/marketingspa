'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/page-header';
import { EmailOverviewTab } from '@/components/email-marketing/overview-tab';
import { EmailCampaignsTab } from '@/components/email-marketing/campaigns-tab';
import { EmailTemplatesTab } from '@/components/email-marketing/templates-tab';
import { EmailAudienceTab } from '@/components/email-marketing/audience-tab';
import { EmailAutomationsTab } from '@/components/email-marketing/automations-tab';
import { EmailDomainsTab } from '@/components/email-marketing/domains-tab';
import { EmailReportsTab } from '@/components/email-marketing/reports-tab';

const TAB_VALUES = ['overview', 'campaigns', 'templates', 'audience', 'automations', 'domains', 'reports'] as const;
type TabValue = (typeof TAB_VALUES)[number];

function EmailMarketingInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get('tab');
  const initial: TabValue =
    tabParam && (TAB_VALUES as readonly string[]).includes(tabParam)
      ? (tabParam as TabValue)
      : 'overview';
  const [activeTab, setActiveTab] = useState<TabValue>(initial);

  useEffect(() => {
    if (tabParam && (TAB_VALUES as readonly string[]).includes(tabParam)) {
      setActiveTab(tabParam as TabValue);
      return;
    }
    setActiveTab('overview');
    if (!tabParam) {
      router.replace('/email-marketing?tab=overview', { scroll: false });
    }
  }, [tabParam, router]);

  function changeTab(v: string) {
    const next = (TAB_VALUES as readonly string[]).includes(v) ? (v as TabValue) : 'overview';
    setActiveTab(next);
    router.replace(`/email-marketing?tab=${next}`, { scroll: false });
  }

  return (
    <div>
      <PageHeader
        title="Email Marketing"
        description="Chiến dịch, mẫu, danh bạ và tự động hóa email theo từng tổ chức"
      />
      <Tabs value={activeTab} onValueChange={changeTab}>
        <TabsList className="mb-4 flex h-auto flex-wrap gap-1">
          <TabsTrigger value="overview">Tổng quan</TabsTrigger>
          <TabsTrigger value="campaigns">Chiến dịch</TabsTrigger>
          <TabsTrigger value="templates">Mẫu Email</TabsTrigger>
          <TabsTrigger value="audience">Danh bạ</TabsTrigger>
          <TabsTrigger value="automations">Tự động hóa</TabsTrigger>
          <TabsTrigger value="domains">Tên miền gửi</TabsTrigger>
          <TabsTrigger value="reports">Báo cáo</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <EmailOverviewTab />
        </TabsContent>
        <TabsContent value="campaigns">
          <EmailCampaignsTab />
        </TabsContent>
        <TabsContent value="templates">
          <EmailTemplatesTab />
        </TabsContent>
        <TabsContent value="audience">
          <EmailAudienceTab />
        </TabsContent>
        <TabsContent value="automations">
          <EmailAutomationsTab />
        </TabsContent>
        <TabsContent value="domains">
          <EmailDomainsTab />
        </TabsContent>
        <TabsContent value="reports">
          <EmailReportsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function EmailMarketingPage() {
  return (
    <Suspense>
      <EmailMarketingInner />
    </Suspense>
  );
}
