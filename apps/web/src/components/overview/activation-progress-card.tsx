'use client';

import Link from 'next/link';
import { CheckCircle2, Circle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/shared/page-state';
import { useOnboardingState } from '@/hooks/use-onboarding';
import { useT } from '@/i18n/i18n-provider';

const ACTIVATION_HREF: Record<string, string> = {
  signup: '/register',
  onboarding_started: '/onboarding',
  onboarding_completed: '/onboarding',
  first_channel_connected: '/zalo-marketing',
  first_customer_synced: '/customers',
  first_autopilot_analysis: '/marketing-autopilot',
  first_recommendation_accepted: '/marketing-autopilot?tab=command',
  first_automation_activated: '/automation?tab=flows',
  first_booking: '/appointments',
  first_sale: '/sales/orders',
};

export function ActivationProgressCard() {
  const t = useT();
  const { data, isLoading } = useOnboardingState();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <LoadingState message={t('overview.activationLoading')} className="py-6" />
        </CardContent>
      </Card>
    );
  }

  if (!data?.activation) return null;

  const { catalog, events } = data.activation;
  const done = new Set(events.filter((e) => e.occurredAt).map((e) => e.eventType));
  const total = catalog.length;
  const completed = catalog.filter((key) => done.has(key)).length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const nextKey = catalog.find((key) => !done.has(key));

  if (completed >= total) return null;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 p-4 pb-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base">{t('overview.activationTitle')}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t('overview.activationProgress', { completed: String(completed), total: String(total) })}
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/onboarding">{t('overview.activationHelp')}</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-0">
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {catalog.map((key) => {
            const isDone = done.has(key);
            const Icon = isDone ? CheckCircle2 : Circle;
            const href = ACTIVATION_HREF[key] ?? '/overview';
            return (
              <li key={key}>
                <Link
                  href={href}
                  className="flex items-start gap-2 rounded-md border border-transparent px-2 py-1.5 text-sm transition-colors hover:border-border hover:bg-muted/40"
                >
                  <Icon
                    className={`mt-0.5 h-4 w-4 shrink-0 ${isDone ? 'text-primary' : 'text-muted-foreground'}`}
                  />
                  <span className={isDone ? 'text-muted-foreground line-through' : ''}>
                    {t(`overview.activationEvents.${key}` as 'overview.activationEvents.signup')}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        {nextKey && (
          <p className="text-xs text-muted-foreground">
            {t('overview.activationNext')}{' '}
            <Link href={ACTIVATION_HREF[nextKey] ?? '/onboarding'} className="text-primary hover:underline">
              {t(`overview.activationEvents.${nextKey}` as 'overview.activationEvents.signup')}
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
