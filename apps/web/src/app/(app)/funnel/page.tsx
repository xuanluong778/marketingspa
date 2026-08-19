'use client';

import { Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FunnelCreatePanel } from '@/components/funnel/funnel-create-panel';
import { FunnelMinePanel } from '@/components/funnel/funnel-mine-panel';
import { FunnelCanvasPanel } from '@/components/funnel/funnel-canvas-panel';
import { FunnelAnalyticsPanel } from '@/components/funnel/funnel-analytics-dashboard';
import { FunnelJourneyPanel } from '@/components/funnel/funnel-journey-panel';
import { LoadingState } from '@/components/shared/page-state';
import { useFunnelRecommendations } from '@/hooks/use-funnel-builder';
import {
  funnelHref,
  resolveFunnelAdvancedPane,
  resolveFunnelMainTab,
  shouldOpenFunnelAdvanced,
  type FunnelMainTab,
} from '@/lib/funnel-tabs';

function FunnelCustomers({
  initialFunnelId,
  initialLeadId,
}: {
  initialFunnelId?: string | null;
  initialLeadId?: string | null;
}) {
  const { data: recommendations } = useFunnelRecommendations();
  return (
    <FunnelJourneyPanel
      recommendations={recommendations ?? []}
      initialFunnelId={initialFunnelId}
      initialLeadId={initialLeadId}
    />
  );
}

function FunnelPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab = useMemo(() => resolveFunnelMainTab(rawTab), [rawTab]);
  const draftId = searchParams.get('draft');
  const advancedOpen = shouldOpenFunnelAdvanced(rawTab, searchParams.get('advanced'));
  const advancedPane = resolveFunnelAdvancedPane(rawTab, searchParams.get('advancedPane'));

  function changeTab(next: string) {
    const tab = next as FunnelMainTab;
    router.replace(funnelHref({ tab }), { scroll: false });
  }

  return (
    <div>
      <PageHeader
        title="Phễu Marketing"
        description="Phễu đang chạy hiện trên cùng. Tạo, kích hoạt và theo dõi lead theo tổ chức."
      >
        <Button onClick={() => router.replace(funnelHref({ tab: 'create', create: true }))}>
          Tạo phễu
        </Button>
      </PageHeader>

      <Tabs value={activeTab} onValueChange={changeTab}>
        <TabsList className="mb-4 grid h-auto w-full grid-cols-2 gap-1 sm:inline-flex sm:w-auto">
          <TabsTrigger value="mine">Phễu của tôi</TabsTrigger>
          <TabsTrigger value="create">Tạo phễu</TabsTrigger>
          <TabsTrigger value="customers">Khách hàng</TabsTrigger>
          <TabsTrigger value="analytics">Phân tích</TabsTrigger>
        </TabsList>
        <TabsContent value="mine">
          {draftId ? (
            <FunnelCanvasPanel
              advancedOpen={advancedOpen}
              advancedPane={advancedPane}
            />
          ) : (
            <FunnelMinePanel advancedOpen={advancedOpen} advancedPane={advancedPane} />
          )}
        </TabsContent>
        <TabsContent value="create">
          <FunnelCreatePanel
            initialGoal={searchParams.get('goal')}
            initialMethod={
              searchParams.get('source') === 'templates' || rawTab === 'templates'
                ? 'templates'
                : undefined
            }
          />
        </TabsContent>
        <TabsContent value="customers">
          <FunnelCustomers
            initialFunnelId={searchParams.get('funnel')}
            initialLeadId={searchParams.get('lead')}
          />
        </TabsContent>
        <TabsContent value="analytics">
          <FunnelAnalyticsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function FunnelPage() {
  return (
    <Suspense fallback={<LoadingState message="Đang tải phễu…" />}>
      <FunnelPageInner />
    </Suspense>
  );
}
