'use client';

import { useState } from 'react';
import { Plus, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingState, EmptyState, ErrorState } from '@/components/shared/page-state';
import { formatDateTime } from '@/lib/format';
import {
  useCreateZaloCampaign,
  useStartZaloCampaign,
  useUpdateZaloCampaign,
  useZaloCampaigns,
  useZaloOas,
  useZaloTemplates,
  usePreviewZaloAudience,
  usePreviewZaloCampaign,
  useImportZaloAudience,
} from '@/hooks/use-zalo-marketing';
import { ZaloCampaignWizard } from './campaign-wizard';
import { useT } from '@/i18n/i18n-provider';

export function ZaloCampaignsTab() {
  const t = useT();
  const campaigns = useZaloCampaigns({ pageSize: '50' });
  const start = useStartZaloCampaign();
  const [wizardOpen, setWizardOpen] = useState(false);

  const STATUS_LABELS: Record<string, string> = {
    DRAFT: t('zalo.draft'),
    SCHEDULED: t('zalo.scheduled'),
    PLANNING: t('zalo.planning'),
    RUNNING: t('zalo.sending'),
    PAUSED: t('zalo.paused'),
    COMPLETED: t('zalo.completed'),
    FAILED: t('zalo.error'),
    CANCELLED: t('zalo.cancelled'),
  };

  const items = campaigns.data?.items ?? [];

  if (campaigns.isLoading) return <LoadingState label={t('zalo.loadingCampaigns')} />;
  if (campaigns.isError) return <ErrorState message={t('zalo.loadCampaignsFailed')} onRetry={() => campaigns.refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t('zalo.extendedDescription')}</p>
        <Button onClick={() => setWizardOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('emailMarketing.tabs.campaigns')}
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title={t('zalo.emptyCampaigns')}
          description={t('zalo.emptyCampaignsHint')}
          action={
            <Button onClick={() => setWizardOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('emailMarketing.tabs.campaigns')}
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t('zalo.name')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('zalo.type')}</th>
                <th className="px-3 py-2 text-left font-medium">OA</th>
                <th className="px-3 py-2 text-left font-medium">{t('zalo.status')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('zalo.sentTotal')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('zalo.updated')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('zalo.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{c.name}</td>
                  <td className="px-3 py-2">{c.campaignType === 'TEMPLATE' ? 'ZBS' : 'Broadcast'}</td>
                  <td className="px-3 py-2">{c.channelConnection?.displayName || c.channelConnection?.accountRef || '—'}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline">{STATUS_LABELS[c.status] ?? c.status}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {c.sentCount}/{c.totalRecipients}
                  </td>
                  <td className="px-3 py-2">{formatDateTime(c.updatedAt)}</td>
                  <td className="px-3 py-2 text-right">
                    {c.status === 'DRAFT' || c.status === 'SCHEDULED' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={start.isPending}
                        onClick={() => start.mutate(c.id)}
                      >
                        <Play className="mr-1 h-3 w-3" />
                        Gửi
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ZaloCampaignWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  );
}
