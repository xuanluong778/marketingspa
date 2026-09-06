'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2, Circle, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingState, ErrorState } from '@/components/shared/page-state';
import { useMarketingAutopilotCommandCenter } from '@/hooks/use-marketing-autopilot';
import { useT } from '@/i18n/i18n-provider';

export function AutopilotBriefCard() {
  const t = useT();
  const { data, isLoading, isError, refetch } = useMarketingAutopilotCommandCenter();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <LoadingState message={t('overview.briefLoading')} className="py-8" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="p-4">
          <ErrorState message={t('overview.briefError')} onRetry={() => void refetch()} />
        </CardContent>
      </Card>
    );
  }

  const actions = data.nextBestActions.slice(0, 3);

  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-col gap-2 p-4 pb-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">{t('overview.briefTitle')}</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">{t('overview.briefSubtitle')}</p>
        </div>
        <Badge variant="outline">{data.lifecycle}</Badge>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0">
        {actions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">{t('overview.briefEmpty')}</p>
        ) : (
          <ul className="space-y-2">
            {actions.map((action) => (
              <li
                key={`${action.priority}-${action.title}`}
                className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <p className="font-medium text-sm leading-snug">{action.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{action.whyNow}</p>
                </div>
                <Button asChild size="sm" variant="secondary" className="shrink-0">
                  <Link href={action.editUrl}>
                    {t('overview.briefAction')}
                    <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
          <Link href="/marketing-autopilot?tab=command">{t('overview.briefViewAll')}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
