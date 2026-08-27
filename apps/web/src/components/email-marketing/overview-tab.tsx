'use client';

import { Mail, Users, FileText, Send, Ban, Globe } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingState, ErrorState } from '@/components/shared/page-state';
import { useEmailOverview, useEmailDomains } from '@/hooks/use-email-marketing';
import { useT } from '@/i18n/i18n-provider';

function StatCard({
  title,
  value,
  icon: Icon,
  subtitle,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

export function EmailOverviewTab() {
  const t = useT();
  const overview = useEmailOverview();
  const domains = useEmailDomains();

  if (overview.isLoading) return <LoadingState />;
  if (overview.isError || !overview.data) {
    return <ErrorState onRetry={() => overview.refetch()} />;
  }

  const d = overview.data;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          title={t('emailMarketing.contacts')}
          value={d.contacts}
          icon={Users}
          subtitle={`${d.subscribed} ${t('emailMarketing.receiveEmail').toLowerCase()}`}
        />
        <StatCard title={t('emailMarketing.emailTemplates')} value={d.templates} icon={FileText} />
        <StatCard
          title={t('emailMarketing.tabs.campaigns')}
          value={d.campaigns}
          icon={Send}
          subtitle={`${d.running} ${t('zalo.sending').toLowerCase()}`}
        />
        <StatCard title={t('emailMarketing.sent')} value={d.sent} icon={Mail} />
        <StatCard
          title={t('emailMarketing.openRate')}
          value={`${d.openRate}%`}
          icon={Mail}
          subtitle={`${d.opened}`}
        />
        <StatCard
          title={t('emailMarketing.clickRate')}
          value={`${d.clickRate}%`}
          icon={Mail}
          subtitle={`${d.clicked}`}
        />
        <StatCard title={t('emailMarketing.lists')} value={d.lists} icon={Users} />
        <StatCard title="Suppression" value={d.suppressions} icon={Ban} />
        <StatCard
          title={t('emailMarketing.sendingDomain')}
          value={d.domains}
          icon={Globe}
          subtitle={t('emailMarketing.domainConfigHint')}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('emailMarketing.sendingDomain')}</CardTitle>
        </CardHeader>
        <CardContent>
          {!domains.data?.length ? (
            <p className="text-sm text-muted-foreground">{t('emailMarketing.emptyDomains')}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {domains.data.map((row) => (
                <li key={row.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span>
                    {row.fromName} &lt;{row.fromEmail}&gt;
                  </span>
                  <span className="text-muted-foreground">
                    {row.domainVerified ? 'Domain Verified ✅' : t('emailMarketing.incomplete')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
