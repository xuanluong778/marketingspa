'use client';

import { useState } from 'react';
import { Pause, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable, StatusBadge } from '@/components/shared/data-table';
import { ConfirmDialog } from '@/components/crm/confirm-dialog';
import { EmailCampaignWizard } from '@/components/email-marketing/campaign-wizard';
import { CampaignDashboardSheet } from '@/components/email-marketing/campaign-dashboard-sheet';
import {
  useEmailCampaigns,
  useDeleteEmailCampaign,
  usePauseEmailCampaign,
  useCancelEmailCampaign,
} from '@/hooks/use-email-marketing';
import {
  CAMPAIGN_STATUS_LABELS,
  type EmailCampaign,
  type EmailCampaignKpi,
} from '@/types/email-marketing';
import { formatDateTime } from '@/lib/format';

function KpiButton({
  value,
  onClick,
}: {
  value: string | number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="text-primary underline-offset-2 hover:underline"
      onClick={onClick}
    >
      {value}
    </button>
  );
}

export function EmailCampaignsTab() {
  const campaigns = useEmailCampaigns({ pageSize: '50' });
  const remove = useDeleteEmailCampaign();
  const pause = usePauseEmailCampaign();
  const cancel = useCancelEmailCampaign();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [dashId, setDashId] = useState<string | null>(null);
  const [dashMetric, setDashMetric] = useState<EmailCampaignKpi>('sent');

  const openDash = (id: string, metric: EmailCampaignKpi) => {
    setDashMetric(metric);
    setDashId(id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Tạo email gửi nhóm trong 4 bước: chọn người nhận, chọn mẫu, xem trước, rồi gửi. Bấm chỉ số
          để xem danh sách khách.
        </p>
        <Button onClick={() => setWizardOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Tạo chiến dịch
        </Button>
      </div>
      <DataTable
        getRowKey={(r) => r.id}
        data={campaigns.data?.items}
        isLoading={campaigns.isLoading}
        isError={campaigns.isError}
        onRetry={() => campaigns.refetch()}
        emptyTitle="Chưa có chiến dịch. Bấm Tạo chiến dịch để bắt đầu."
        columns={[
          {
            key: 'name',
            header: 'Tên',
            cell: (r) => (
              <button
                type="button"
                className="text-left font-medium hover:underline"
                onClick={() => openDash(r.id, 'sent')}
              >
                {r.name}
              </button>
            ),
          },
          {
            key: 'status',
            header: 'Trạng thái',
            cell: (r) => <StatusBadge status={CAMPAIGN_STATUS_LABELS[r.status]} />,
          },
          {
            key: 'audience',
            header: 'Người nhận',
            cell: (r) => r.list?.name || (r.segment?.name ? r.segment.name : 'Tất cả đang nhận email'),
          },
          {
            key: 'sent',
            header: 'Gửi',
            cell: (r: EmailCampaign) => (
              <KpiButton value={r.sentCount} onClick={() => openDash(r.id, 'sent')} />
            ),
          },
          {
            key: 'delivered',
            header: 'Tới',
            cell: (r: EmailCampaign) => (
              <KpiButton value={r.deliveredCount ?? 0} onClick={() => openDash(r.id, 'delivered')} />
            ),
          },
          {
            key: 'open',
            header: 'Open',
            cell: (r: EmailCampaign) => (
              <KpiButton value={`${r.openRate ?? 0}%`} onClick={() => openDash(r.id, 'opened')} />
            ),
          },
          {
            key: 'click',
            header: 'Click',
            cell: (r: EmailCampaign) => (
              <KpiButton value={`${r.clickRate ?? 0}%`} onClick={() => openDash(r.id, 'clicked')} />
            ),
          },
          {
            key: 'bounce',
            header: 'Bounce',
            cell: (r: EmailCampaign) => (
              <KpiButton value={r.bounceCount} onClick={() => openDash(r.id, 'bounced')} />
            ),
          },
          {
            key: 'unsub',
            header: 'Hủy ĐK',
            cell: (r: EmailCampaign) => (
              <KpiButton
                value={r.unsubscribeCount}
                onClick={() => openDash(r.id, 'unsubscribed')}
              />
            ),
          },
          {
            key: 'when',
            header: 'Lịch',
            cell: (r) => (r.scheduledAt ? formatDateTime(r.scheduledAt) : formatDateTime(r.createdAt)),
          },
          {
            key: 'actions',
            header: '',
            cell: (r: EmailCampaign) => (
              <div className="flex gap-1">
                {r.status === 'RUNNING' && (
                  <Button size="icon" variant="ghost" title="Tạm dừng" onClick={() => pause.mutate(r.id)}>
                    <Pause className="h-4 w-4" />
                  </Button>
                )}
                {r.status !== 'COMPLETED' && r.status !== 'CANCELLED' && (
                  <Button size="icon" variant="ghost" title="Hủy" onClick={() => cancel.mutate(r.id)}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
                {r.status !== 'RUNNING' && (
                  <Button size="icon" variant="ghost" onClick={() => setDeleteId(r.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ),
          },
        ]}
      />

      <EmailCampaignWizard open={wizardOpen} onOpenChange={setWizardOpen} />
      <CampaignDashboardSheet
        campaignId={dashId}
        metric={dashMetric}
        onMetricChange={setDashMetric}
        open={!!dashId}
        onOpenChange={(next) => {
          if (!next) setDashId(null);
        }}
      />

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="Xóa chiến dịch?"
        destructive
        isPending={remove.isPending}
        onConfirm={() => {
          if (!deleteId) return;
          remove.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
        }}
      />
    </div>
  );
}
