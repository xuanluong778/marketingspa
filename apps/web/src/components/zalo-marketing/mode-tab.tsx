'use client';

import { useState } from 'react';
import { Plus, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingState, EmptyState, ErrorState } from '@/components/shared/page-state';
import { formatDateTime } from '@/lib/format';
import { useStartZaloCampaign, useZaloCampaigns } from '@/hooks/use-zalo-marketing';
import { ZaloCampaignWizard, type ZaloCampaignMode } from './campaign-wizard';
import { useT } from '@/i18n/i18n-provider';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Nháp',
  SCHEDULED: 'Đã lên lịch',
  PLANNING: 'Đang lập kế hoạch',
  RUNNING: 'Đang gửi',
  PAUSED: 'Tạm dừng',
  COMPLETED: 'Hoàn thành',
  FAILED: 'Lỗi',
  CANCELLED: 'Đã hủy',
};

const MODE_META: Record<
  ZaloCampaignMode,
  { title: string; description: string; condition: string; typeLabel: string }
> = {
  BROADCAST: {
    title: 'Broadcast',
    description: 'Gửi tới người đang Quan tâm OA qua API promotion chính thức.',
    condition: 'FOLLOWING + quota broadcast + loại opt-out/block',
    typeLabel: 'Broadcast',
  },
  TRANSACTIONAL: {
    title: 'Tin Tư vấn',
    description: 'Gửi trong cửa sổ tương tác 48h (API message/cs). Dùng từ CSKH hoặc campaign nhỏ.',
    condition: 'Opt-in / tương tác trong 48h + quyền OA/tier',
    typeLabel: 'Tin tư vấn',
  },
  TEMPLATE: {
    title: 'ZBS Template',
    description: 'Đồng bộ template đã duyệt, gửi theo UID/SĐT với biến CRM.',
    condition: 'Template APPROVED + UID/SĐT hợp lệ + quota/chi phí ZBS',
    typeLabel: 'ZBS',
  },
};

type Props = { mode: ZaloCampaignMode };

export function ZaloModeTab({ mode }: Props) {
  const t = useT();
  const meta = MODE_META[mode];
  const campaigns = useZaloCampaigns({ pageSize: '50', campaignType: mode });
  const start = useStartZaloCampaign();
  const [wizardOpen, setWizardOpen] = useState(false);
  const items = campaigns.data?.items ?? [];

  if (campaigns.isLoading) return <LoadingState label={t('zalo.loadingMode', { title: meta.title })} />;
  if (campaigns.isError) {
    return <ErrorState message={t('zalo.loadCampaignsFailed')} onRetry={() => campaigns.refetch()} />;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
        <p className="font-medium">{meta.title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{meta.description}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Điều kiện: {meta.condition}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Mỗi lần gửi: kiểm tra eligibility backend → queue BullMQ → không fake SENT.
        </p>
        <Button onClick={() => setWizardOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Tạo {meta.title}
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title={t('zalo.emptyModeCampaign', { title: meta.title })}
          description="Chọn OA, xem số người hợp lệ, preview rồi gửi ngay hoặc hẹn giờ."
          action={
            <Button onClick={() => setWizardOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('automation.createCampaignBtn')}
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Tên</th>
                <th className="px-3 py-2 text-left font-medium">Loại</th>
                <th className="px-3 py-2 text-left font-medium">OA</th>
                <th className="px-3 py-2 text-left font-medium">Trạng thái</th>
                <th className="px-3 py-2 text-right font-medium">Gửi / Tổng</th>
                <th className="px-3 py-2 text-left font-medium">Cập nhật</th>
                <th className="px-3 py-2 text-right font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{c.name}</td>
                  <td className="px-3 py-2">{meta.typeLabel}</td>
                  <td className="px-3 py-2">
                    {c.channelConnection?.displayName || c.channelConnection?.accountRef || '—'}
                  </td>
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

      <ZaloCampaignWizard open={wizardOpen} onOpenChange={setWizardOpen} lockedMode={mode} />
    </div>
  );
}
