'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { StatusBadge } from '@/components/shared/data-table';
import { LoadingState, EmptyState, ErrorState } from '@/components/shared/page-state';
import { cn } from '@/lib/utils';
import { useEmailCampaign, useEmailCampaignRecipients } from '@/hooks/use-email-marketing';
import {
  CAMPAIGN_KPI_LABELS,
  CAMPAIGN_STATUS_LABELS,
  RECIPIENT_STATUS_LABELS,
  type EmailCampaign,
  type EmailCampaignKpi,
} from '@/types/email-marketing';

function pct(campaign: EmailCampaign | undefined, n: number) {
  const sent = campaign?.sentCount ?? 0;
  if (!sent) return 0;
  return Math.round((n / sent) * 1000) / 10;
}

function kpiValue(campaign: EmailCampaign | undefined, metric: EmailCampaignKpi): string {
  if (!campaign) return '—';
  if (metric === 'sent') return String(campaign.sentCount);
  if (metric === 'delivered') return String(campaign.deliveredCount ?? 0);
  if (metric === 'opened') return `${campaign.openRate ?? pct(campaign, campaign.openCount)}%`;
  if (metric === 'clicked') return `${campaign.clickRate ?? pct(campaign, campaign.clickCount)}%`;
  if (metric === 'bounced') return String(campaign.bounceCount);
  return String(campaign.unsubscribeCount);
}

function kpiHint(campaign: EmailCampaign | undefined, metric: EmailCampaignKpi): string | undefined {
  if (!campaign) return undefined;
  if (metric === 'opened') return `${campaign.openCount} khách`;
  if (metric === 'clicked') return `${campaign.clickCount} khách`;
  return undefined;
}

const KPI_ORDER: EmailCampaignKpi[] = [
  'sent',
  'delivered',
  'opened',
  'clicked',
  'bounced',
  'unsubscribed',
];

export function CampaignDashboardSheet({
  campaignId,
  metric,
  onMetricChange,
  open,
  onOpenChange,
}: {
  campaignId: string | null;
  metric: EmailCampaignKpi;
  onMetricChange: (metric: EmailCampaignKpi) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const campaign = useEmailCampaign(open ? campaignId : null);
  const recipients = useEmailCampaignRecipients(open ? campaignId : null, {
    metric,
    pageSize: '50',
  });
  const row = campaign.data;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{row?.name || 'Chiến dịch'}</SheetTitle>
        </SheetHeader>
        {campaign.isLoading ? (
          <LoadingState />
        ) : campaign.isError || !row ? (
          <ErrorState onRetry={() => campaign.refetch()} />
        ) : (
          <div className="space-y-5 pt-4">
            <p className="text-sm text-muted-foreground">
              {CAMPAIGN_STATUS_LABELS[row.status]} · bấm một chỉ số để xem danh sách khách
            </p>
            <div className="grid grid-cols-2 gap-2">
              {KPI_ORDER.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onMetricChange(key)}
                  className={cn(
                    'rounded-lg border px-3 py-3 text-left transition-colors hover:bg-muted/60',
                    metric === key ? 'border-primary bg-muted/40' : 'border-border',
                  )}
                >
                  <div className="text-xs text-muted-foreground">{CAMPAIGN_KPI_LABELS[key]}</div>
                  <div className="text-xl font-semibold">{kpiValue(row, key)}</div>
                  {kpiHint(row, key) ? (
                    <div className="mt-0.5 text-xs text-muted-foreground">{kpiHint(row, key)}</div>
                  ) : null}
                </button>
              ))}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium">
                {CAMPAIGN_KPI_LABELS[metric]}
                {recipients.data ? ` · ${recipients.data.total}` : ''}
              </h3>
              {recipients.isLoading ? (
                <LoadingState />
              ) : recipients.isError ? (
                <ErrorState onRetry={() => recipients.refetch()} />
              ) : !recipients.data?.items.length ? (
                <EmptyState title="Chưa có khách trong chỉ số này" />
              ) : (
                <ul className="divide-y rounded-md border">
                  {recipients.data.items.map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-2 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {item.contact?.name || item.email}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{item.email}</div>
                      </div>
                      <StatusBadge status={RECIPIENT_STATUS_LABELS[item.status]} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
