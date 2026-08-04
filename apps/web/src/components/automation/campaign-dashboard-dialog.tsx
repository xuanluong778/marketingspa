'use client';

import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LoadingState, ErrorState } from '@/components/shared/page-state';
import { apiClient, getApiBaseUrl } from '@/lib/api-client';
import { authStorage } from '@/lib/auth-storage';
import { formatCurrency, formatDateTime } from '@/lib/format';

type Dashboard = {
  campaign: {
    id: string;
    name: string;
    channel: string;
    status: string;
    startedAt?: string | null;
    completedAt?: string | null;
  };
  totals: {
    totalRecipients: number;
    eligible: number;
    sent: number;
    delivered: number;
    read: number;
    replied: number;
    failed: number;
    optOut: number;
  };
  rates: { replyRate: number; deliveryRate: number; readRate: number };
  costs: { estimatedCost: number; actualCost: number };
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string | null;
};

export function CampaignDashboardDialog({ open, onOpenChange, campaignId }: Props) {
  const q = useQuery({
    queryKey: ['automation', 'messaging-campaigns', campaignId, 'dashboard'],
    queryFn: () =>
      apiClient<Dashboard>(`/automation/messaging-campaigns/${campaignId}/dashboard`),
    enabled: open && !!campaignId,
  });

  async function download(format: 'csv' | 'xlsx') {
    if (!campaignId) return;
    const token = authStorage.getAccessToken();
    const res = await fetch(
      `${getApiBaseUrl()}/automation/messaging-campaigns/${campaignId}/export?format=${format}`,
      {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    );
    if (!res.ok) {
      window.alert('Không tải được báo cáo');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaign-${campaignId}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const d = q.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Báo cáo chiến dịch</DialogTitle>
        </DialogHeader>
        {q.isLoading && <LoadingState />}
        {q.isError && <ErrorState onRetry={q.refetch} />}
        {d && (
          <div className="space-y-4 text-sm">
            <div>
              <p className="font-semibold text-base">{d.campaign.name}</p>
              <p className="text-muted-foreground">
                {d.campaign.channel} · {d.campaign.status}
                {d.campaign.startedAt ? ` · Bắt đầu ${formatDateTime(d.campaign.startedAt)}` : ''}
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                ['Tổng', d.totals.totalRecipients],
                ['Đủ điều kiện', d.totals.eligible],
                ['Đã gửi', d.totals.sent],
                ['Thất bại', d.totals.failed],
                ['Đã đọc', d.totals.read],
                ['Trả lời', d.totals.replied],
                ['Opt-out', d.totals.optOut],
                ['Giao thành công', d.totals.delivered],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-md border p-2">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="font-semibold">{value}</p>
                </div>
              ))}
            </div>
            <div className="rounded-md border p-3 space-y-1">
              <p>Tỷ lệ giao: {(d.rates.deliveryRate * 100).toFixed(1)}%</p>
              <p>Tỷ lệ đọc: {(d.rates.readRate * 100).toFixed(1)}%</p>
              <p>Tỷ lệ trả lời: {(d.rates.replyRate * 100).toFixed(1)}%</p>
              <p>
                Chi phí: {formatCurrency(d.costs.actualCost)} / ước tính{' '}
                {formatCurrency(d.costs.estimatedCost)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => void download('csv')}>
                Xuất CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => void download('xlsx')}>
                Xuất XLSX
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default CampaignDashboardDialog;
