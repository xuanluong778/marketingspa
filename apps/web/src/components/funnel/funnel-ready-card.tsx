'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { FunnelLifecycleBar } from '@/components/funnel/funnel-lifecycle-bar';
import { FunnelDirectEditButton } from '@/components/funnel/funnel-direct-edit-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FUNNEL_TEMPLATE_SIMPLE_NAME } from '@/lib/funnel-create-goals';
import { funnelHref } from '@/lib/funnel-tabs';
import type { FunnelCompleteSpec } from '@/types/funnel';
import { useFunnelRecommendation } from '@/hooks/use-funnel-builder';
import { useT } from '@/i18n/i18n-provider';

export function FunnelReadyCard({
  recommendationId,
  spec,
  onCreateAnother,
}: {
  recommendationId: string;
  spec: FunnelCompleteSpec;
  onCreateAnother: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const detail = useFunnelRecommendation(recommendationId);
  const status = detail.data?.status ?? 'DRAFT';
  const publicUrl = useMemo(() => {
    if (typeof window === 'undefined') return `/f/${recommendationId}`;
    return `${window.location.origin}/f/${recommendationId}`;
  }, [recommendationId]);

  const steps = spec.nodes.filter((n) => n.type !== 'TRAFFIC');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg leading-snug">{spec.name}</CardTitle>
            {spec.templateSlug && (
              <Badge variant="outline">
                {FUNNEL_TEMPLATE_SIMPLE_NAME[spec.templateSlug] ?? spec.templateSlug}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{spec.offer}</p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {spec.cta && (
            <p>
              <span className="text-muted-foreground">{t('funnel.ctaLabel')} </span>
              <span className="font-medium">{spec.cta}</span>
            </p>
          )}
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('funnel.journeyLabel')}
            </p>
            <ol className="space-y-2">
              {steps.map((n, i) => (
                <li key={n.id} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{n.label}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => router.replace(funnelHref({ tab: 'mine', design: recommendationId }))}
            >
              {t('funnel.editDesign')}
            </Button>
            <FunnelDirectEditButton funnelId={recommendationId} />
          </div>
          <FunnelLifecycleBar
            compact
            recommendationId={recommendationId}
            status={status}
            onActivated={() => void detail.refetch()}
          />
          {status !== 'ACTIVE' ? (
            <p className="text-xs text-muted-foreground">
              {t('funnel.publicLinkHint', { url: publicUrl })}
            </p>
          ) : null}
        </CardContent>
      </Card>
      <Button type="button" variant="ghost" size="sm" onClick={onCreateAnother}>
        {t('funnel.createAnother')}
      </Button>
    </div>
  );
}
