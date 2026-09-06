'use client';

import { LoadingState, EmptyState, ErrorState } from '@/components/shared/page-state';
import { useZaloReports } from '@/hooks/use-zalo-marketing';
import { formatDateTime } from '@/lib/format';

export function ZaloReportsTab() {
  const reports = useZaloReports();

  if (reports.isLoading) return <LoadingState label="Đang tải báo cáo..." />;
  if (reports.isError) return <ErrorState message="Không tải được báo cáo" onRetry={() => reports.refetch()} />;

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
          ['Tổng người nhận', totals.recipients ?? 0],
          ['Đã gửi', totals.sent ?? 0],
          ['Delivered', totals.delivered ?? 0],
          ['Lỗi', totals.failed ?? 0],
          ['Chi phí (ước tính)', totals.cost ?? 0],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      {campaigns.length === 0 ? (
        <EmptyState title="Chưa có dữ liệu báo cáo" />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left">Chiến dịch</th>
                <th className="px-3 py-2 text-left">OA</th>
                <th className="px-3 py-2 text-left">Loại</th>
                <th className="px-3 py-2 text-right">Nhận</th>
                <th className="px-3 py-2 text-right">Gửi</th>
                <th className="px-3 py-2 text-right">Lỗi</th>
                <th className="px-3 py-2 text-right">Chi phí</th>
                <th className="px-3 py-2 text-left">Cập nhật</th>
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
                        ? 'Tin tư vấn'
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
