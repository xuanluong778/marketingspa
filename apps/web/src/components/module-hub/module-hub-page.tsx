'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/page-state';
import { FeatureCardGrid } from '@/components/shared/feature-card-grid';
import { ModuleFeatureCard } from '@/components/module-hub/module-feature-card';
import { ModuleKpiCard, ModuleKpiSkeleton } from '@/components/module-hub/module-kpi-card';
import type { ModuleHubDefinition, ModuleHubKpi } from '@/config/module-hubs';
import { featureDescription, moduleDescription, navLabel } from '@/config/nav-i18n';
import { useT } from '@/i18n/i18n-provider';
import { ErrorState } from '@/components/shared/page-state';

export function ModuleHubPage({
  hub,
  badges,
  kpis,
  kpisLoading,
  kpisError,
  onRetryKpis,
  children,
}: {
  hub: ModuleHubDefinition;
  badges?: Record<string, string | number | null | undefined>;
  kpis?: ModuleHubKpi[];
  kpisLoading?: boolean;
  kpisError?: boolean;
  onRetryKpis?: () => void;
  children?: ReactNode;
}) {
  const t = useT();
  const Icon = hub.icon;

  return (
    <div className="space-y-8 pb-10">
      <PageHeader
        title={navLabel(t, hub.title)}
        description={moduleDescription(t, hub.title)}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="hidden h-11 w-11 items-center justify-center rounded-[14px] bg-brand/90 ring-1 ring-white/20 shadow-[0_0_20px_-4px_hsl(var(--primary)/0.4)] sm:flex">
            <Icon className="h-5 w-5 text-primary" aria-hidden />
          </div>
          {hub.features[0] ? (
            <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Link href={hub.features[0].href}>{t('moduleHub.openFirst')}</Link>
            </Button>
          ) : null}
        </div>
      </PageHeader>

      {kpis?.length || kpisLoading || kpisError ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight text-white">{t('moduleHub.kpiTitle')}</h2>
          {kpisLoading ? (
            <ModuleKpiSkeleton count={kpis?.length || 4} />
          ) : kpisError ? (
            <ErrorState title={t('moduleHub.kpiError')} onRetry={onRetryKpis} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {kpis?.map((kpi) => (
                <ModuleKpiCard key={kpi.labelKey} kpi={kpi} />
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight text-white">{t('moduleHub.featuresTitle')}</h2>
        {!hub.features.length ? (
          <EmptyState
            title={t('moduleHub.emptyFeatures')}
            description={t('moduleHub.emptyFeaturesDesc')}
          />
        ) : (
          <FeatureCardGrid>
            {hub.features.map((f, index) => (
              <ModuleFeatureCard
                key={`${f.title}-${f.href}`}
                title={navLabel(t, f.title)}
                description={featureDescription(t, f.title)}
                href={f.href}
                icon={f.icon}
                badge={badges?.[f.href]}
                toneIndex={index}
              />
            ))}
          </FeatureCardGrid>
        )}
      </section>

      {children}
    </div>
  );
}
