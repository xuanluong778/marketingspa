'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/shared/page-state';
import { ModuleFeatureCard } from '@/components/module-hub/module-feature-card';
import { ModuleKpiCard, ModuleKpiSkeleton } from '@/components/module-hub/module-kpi-card';
import type { ModuleHubDefinition, ModuleHubKpi } from '@/config/module-hubs';
import { useT } from '@/i18n/i18n-provider';

export function ModuleHubPage({
  hub,
  kpis,
  kpisLoading,
  kpisError,
  onRetryKpis,
  overview,
  badges,
  children,
}: {
  hub: ModuleHubDefinition;
  kpis?: ModuleHubKpi[];
  kpisLoading?: boolean;
  kpisError?: boolean;
  onRetryKpis?: () => void;
  /** Optional custom overview block under KPIs */
  overview?: ReactNode;
  /** Optional badge per feature href */
  badges?: Record<string, string | number | null | undefined>;
  children?: ReactNode;
}) {
  const t = useT();
  const Icon = hub.icon;

  return (
    <div className="space-y-8 pb-10">
      <PageHeader title={t(hub.titleKey)} description={t(hub.descriptionKey)}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="hidden h-10 w-10 items-center justify-center rounded-xl bg-[#0A3D30] ring-1 ring-white/15 sm:flex">
            <Icon className="h-5 w-5 text-[#F97316]" aria-hidden />
          </div>
          {hub.primaryAction ? (
            <Button asChild className="bg-[#F97316] text-white hover:bg-[#ea6c0f]">
              <Link href={hub.primaryAction.href}>{t(hub.primaryAction.labelKey)}</Link>
            </Button>
          ) : null}
        </div>
      </PageHeader>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white">{t('moduleHub.featuresTitle')}</h2>
        {!hub.features.length ? (
          <EmptyState
            title={t('moduleHub.emptyFeatures')}
            description={t('moduleHub.emptyFeaturesDesc')}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {hub.features.map((f) => (
              <ModuleFeatureCard
                key={`${f.titleKey}-${f.href}`}
                titleKey={f.titleKey}
                descriptionKey={f.descriptionKey}
                href={f.href}
                icon={f.icon}
                badge={badges?.[f.href]}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white">{t('moduleHub.overviewTitle')}</h2>
        {kpisLoading ? <ModuleKpiSkeleton /> : null}
        {kpisError ? <ErrorState onRetry={onRetryKpis} /> : null}
        {!kpisLoading && !kpisError && kpis && kpis.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {kpis.map((kpi) => (
              <ModuleKpiCard key={kpi.labelKey} kpi={kpi} />
            ))}
          </div>
        ) : null}
        {!kpisLoading && !kpisError && (!kpis || kpis.length === 0) ? (
          <EmptyState
            title={t('moduleHub.emptyKpis')}
            description={t('moduleHub.emptyKpisDesc')}
          />
        ) : null}
        {overview}
      </section>

      {children}
    </div>
  );
}

/** Thin client wrapper when only hub id is known (lazy KPI optional). */
export function ModuleHubByDefinition({
  hub,
  ...rest
}: {
  hub: ModuleHubDefinition;
} & Omit<Parameters<typeof ModuleHubPage>[0], 'hub'>) {
  if (!hub) return <LoadingState />;
  return <ModuleHubPage hub={hub} {...rest} />;
}
