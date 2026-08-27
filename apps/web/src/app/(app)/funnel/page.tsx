'use client';

import { Suspense, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FunnelMinePanel } from '@/components/funnel/funnel-mine-panel';
import { LoadingState } from '@/components/shared/page-state';
import { useFunnelRecommendations } from '@/hooks/use-funnel-builder';
import { useT } from '@/i18n/i18n-provider';
import {
  funnelHref,
  resolveFunnelAdvancedPane,
  resolveFunnelMainTab,
  shouldOpenFunnelAdvanced,
  type FunnelMainTab,
} from '@/lib/funnel-tabs';

const FunnelCreatePanel = dynamic(
  () =>
    import('@/components/funnel/funnel-create-panel').then((m) => ({
      default: m.FunnelCreatePanel,
    })),
  { loading: () => <LoadingState /> },
);
const FunnelAnalyticsPanel = dynamic(
  () =>
    import('@/components/funnel/funnel-analytics-dashboard').then((m) => ({
      default: m.FunnelAnalyticsPanel,
    })),
  { loading: () => <LoadingState /> },
);
const FunnelJourneyPanel = dynamic(
  () =>
    import('@/components/funnel/funnel-journey-panel').then((m) => ({
      default: m.FunnelJourneyPanel,
    })),
  { loading: () => <LoadingState /> },
);

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
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab = useMemo(() => resolveFunnelMainTab(rawTab), [rawTab]);
  const initialDesignId = searchParams.get('design') ?? searchParams.get('draft');
  const advancedOpen = shouldOpenFunnelAdvanced(rawTab, searchParams.get('advanced'));
  const advancedPane = resolveFunnelAdvancedPane(rawTab, searchParams.get('advancedPane'));

  function changeTab(next: string) {
    const tab = next as FunnelMainTab;
    router.replace(funnelHref({ tab }), { scroll: false });
  }

  return (
    <div>
      <PageHeader title={t('funnel.title')} description={t('funnel.description')}>
        <Button onClick={() => router.replace(funnelHref({ tab: 'create', create: true }))}>
          {t('funnel.createFunnel')}
        </Button>
      </PageHeader>

      <Tabs value={activeTab} onValueChange={changeTab}>
        <TabsList className="mb-4 grid h-auto w-full grid-cols-2 gap-1 sm:inline-flex sm:w-auto">
          <TabsTrigger value="mine">{t('funnel.tabs.mine')}</TabsTrigger>
          <TabsTrigger value="create">{t('funnel.tabs.create')}</TabsTrigger>
          <TabsTrigger value="customers">{t('funnel.tabs.customers')}</TabsTrigger>
          <TabsTrigger value="analytics">{t('funnel.tabs.analytics')}</TabsTrigger>
        </TabsList>
        <TabsContent value="mine">
          <FunnelMinePanel
            advancedOpen={advancedOpen}
            advancedPane={advancedPane}
            initialDesignId={initialDesignId}
          />
        </TabsContent>
        <TabsContent value="create">
          {activeTab === 'create' ? (
            <FunnelCreatePanel
              initialGoal={searchParams.get('goal')}
              initialMethod={
                searchParams.get('source') === 'templates' || rawTab === 'templates'
                  ? 'templates'
                  : undefined
              }
            />
          ) : null}
        </TabsContent>
        <TabsContent value="customers">
          {activeTab === 'customers' ? (
            <FunnelCustomers
              initialFunnelId={searchParams.get('funnel')}
              initialLeadId={searchParams.get('lead')}
            />
          ) : null}
        </TabsContent>
        <TabsContent value="analytics">
          {activeTab === 'analytics' ? <FunnelAnalyticsPanel /> : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function FunnelPage() {
  const t = useT();
  return (
    <Suspense fallback={<LoadingState message={t('funnel.loading')} />}>
      <FunnelPageInner />
    </Suspense>
  );
}
