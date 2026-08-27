'use client';

import { LoadingState, EmptyState, ErrorState } from '@/components/shared/page-state';
import { useZaloReports } from '@/hooks/use-zalo-marketing';
import { formatDateTime } from '@/lib/format';
import { useT } from '@/i18n/i18n-provider';

export function ZaloReportsTab() {
  const t = useT();
  const reports = useZaloReports();

  if (reports.isLoading) return <LoadingState label={t('zalo.loadingReports')} />;
  if (reports.isError) return <ErrorState message={t('zalo.loadReportsFailed')} onRetry={() => reports.refetch()} />;

  const totals = (reports.data?.totals ?? {}) as {
    recipients?: number;
    sent?: number;
    delivered?: number;
    failed?: number;
    cost?: number;
  };
  const campaigns = (reports.data?.campaigns ?? []) as Array<{
    id: string;
    name: string;
    status: string;
    campaignType: string;
    totalRecipients: number;
    sentCount: number;
    deliveredCount: number;
    failedCount: number;
    actualCost?: number | null;
    estimatedCost?: number | null;
    updatedAt: string;
    channelConnection?: { displayName?: string | null; accountRef?: string };
  }>;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          [t('zalo.totalRecipients'), totals.recipients ?? 0],
          [t('zalo.sent'), totals.sent ?? 0],
          ['Delivered', totals.delivered ?? 0],
          [t('zalo.error'), totals.failed ?? 0],
          [t('zalo.costEstimate'), totals.cost ?? 0],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      {campaigns.length === 0 ? (
        <EmptyState title={t('zalo.emptyReports')} />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left">{t('zalo.campaign')}</th>
                <th className="px-3 py-2 text-left">OA</th>
                <th className="px-3 py-2 text-left">{t('zalo.type')}</th>
                <th className="px-3 py-2 text-right">{t('zalo.received')}</th>
                <th className="px-3 py-2 text-right">{t('zalo.send')}</th>
                <th className="px-3 py-2 text-right">{t('zalo.error')}</th>
                <th className="px-3 py-2 text-right">{t('zalo.cost')}</th>
                <th className="px-3 py-2 text-left">{t('zalo.updated')}</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{c.name}</td>
                  <td className="px-3 py-2">{c.channelConnection?.displayName || c.channelConnection?.accountRef}</td>
                  <td className="px-3 py-2">
                    {c.campaignType === 'TEMPLATE'
                      ? 'ZBS'
                      : c.campaignType === 'TRANSACTIONAL'
                        ? t('zalo.consultMsg')
                        : 'Broadcast'}
                  </td>
                  <td className="px-3 py-2 text-right">{c.totalRecipients}</td>
                  <td className="px-3 py-2 text-right">{c.sentCount}</td>
                  <td className="px-3 py-2 text-right">{c.failedCount}</td>
                  <td className="px-3 py-2 text-right">{c.actualCost ?? c.estimatedCost ?? 0}</td>
                  <td className="px-3 py-2">{formatDateTime(c.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
