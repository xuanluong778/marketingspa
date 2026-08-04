'use client';

import { useEffect, useState } from 'react';
import { BarChart3, Copy, Pause, Play, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingState, EmptyState, ErrorState } from '@/components/shared/page-state';
import { useAutomationTemplates } from '@/hooks/use-automation';
import { useChannelConnections } from '@/hooks/use-channel-connections';
import {
  useCancelCampaign,
  useCreateMessagingCampaign,
  useDeleteCampaign,
  useDuplicateCampaign,
  useMessagingCampaigns,
  usePauseCampaign,
  useResumeCampaign,
  useStartCampaign,
} from '@/hooks/use-messaging-campaigns';
import { CHANNEL_OPTIONS, type MessageChannel } from '@/types/automation-messaging';
import {
  CAMPAIGN_STATUS_LABELS,
  type MessagingCampaignDetail,
  type MessagingSegmentConfig,
} from '@/types/messaging-campaign';
import { formatDateTime } from '@/lib/format';
import { CampaignDashboardDialog } from './campaign-dashboard-dialog';

export type BulkCampaignPrefill = {
  name?: string;
  channel?: MessageChannel;
  channelConnectionId?: string;
  messageTemplateId?: string;
  segmentConfig?: MessagingSegmentConfig;
};

type Props = {
  prefill: BulkCampaignPrefill | null;
  onPrefillConsumed: () => void;
};

export function BulkCampaignPanel({ prefill, onPrefillConsumed }: Props) {
  const campaigns = useMessagingCampaigns({ pageSize: '50' });
  const connections = useChannelConnections();
  const templates = useAutomationTemplates({ pageSize: '50' });
  const create = useCreateMessagingCampaign();
  const start = useStartCampaign();
  const pause = usePauseCampaign();
  const resume = useResumeCampaign();
  const cancel = useCancelCampaign();
  const duplicate = useDuplicateCampaign();
  const remove = useDeleteCampaign();

  const [formOpen, setFormOpen] = useState(false);
  const [dashboardId, setDashboardId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    channel: 'MESSENGER' as MessageChannel,
    channelConnectionId: '',
    messageTemplateId: '',
  });
  const [pendingSegment, setPendingSegment] = useState<MessagingSegmentConfig | undefined>();

  useEffect(() => {
    if (!prefill) return;
    setForm({
      name: prefill.name || 'Chiến dịch hàng loạt mới',
      channel: prefill.channel || 'MESSENGER',
      channelConnectionId: prefill.channelConnectionId || '',
      messageTemplateId: prefill.messageTemplateId || '',
    });
    setPendingSegment(prefill.segmentConfig);
    setFormOpen(true);
    onPrefillConsumed();
  }, [prefill, onPrefillConsumed]);

  const items = (campaigns.data?.items ?? []) as MessagingCampaignDetail[];
  const messengerConns = (connections.data ?? []).filter((c) => c.channel === form.channel);
  const templateItems = (templates.data?.items ?? []).filter((t) => t.channel === form.channel);

  async function submitCreate() {
    try {
      await create.mutateAsync({
        name: form.name.trim() || 'Chiến dịch hàng loạt',
        channel: form.channel,
        campaignType: 'BROADCAST',
        channelConnectionId: form.channelConnectionId || undefined,
        messageTemplateId: form.messageTemplateId || undefined,
        segmentConfig: pendingSegment ?? { excludeSuppressed: true },
        timezone: 'Asia/Ho_Chi_Minh',
      });
      setFormOpen(false);
      setPendingSegment(undefined);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Không tạo được chiến dịch');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setPendingSegment(undefined);
            setForm({
              name: 'Chiến dịch hàng loạt mới',
              channel: 'MESSENGER',
              channelConnectionId: '',
              messageTemplateId: '',
            });
            setFormOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Tạo chiến dịch
        </Button>
      </div>

      {campaigns.isLoading && <LoadingState message="Đang tải chiến dịch…" />}
      {campaigns.isError && <ErrorState onRetry={campaigns.refetch} />}
      {!campaigns.isLoading && !campaigns.isError && items.length === 0 && (
        <EmptyState
          title="Chưa có chiến dịch hàng loạt"
          description="Tạo chiến dịch hoặc chọn liên hệ từ tab Tệp khách hàng."
        />
      )}

      <div className="grid gap-3">
        {items.map((c) => (
          <div key={c.id} className="rounded-lg border p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{c.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {c.channel} · {c.messageTemplate?.name || 'Chưa gắn mẫu'} ·{' '}
                  {formatDateTime(c.createdAt)}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge variant="outline">{CAMPAIGN_STATUS_LABELS[c.status] ?? c.status}</Badge>
                  <Badge variant="secondary">
                    Gửi {c.sentCount}/{c.totalRecipients || c.eligibleCount || 0}
                  </Badge>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                <Button variant="outline" size="sm" onClick={() => setDashboardId(c.id)}>
                  <BarChart3 className="mr-1 h-3.5 w-3.5" />
                  Báo cáo
                </Button>
                {(c.status === 'DRAFT' || c.status === 'SCHEDULED' || c.status === 'PAUSED') && (
                  <Button
                    size="sm"
                    onClick={() => start.mutate(c.id)}
                    disabled={start.isPending}
                  >
                    <Play className="mr-1 h-3.5 w-3.5" />
                    Chạy
                  </Button>
                )}
                {c.status === 'RUNNING' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => pause.mutate(c.id)}
                    disabled={pause.isPending}
                  >
                    <Pause className="mr-1 h-3.5 w-3.5" />
                    Tạm dừng
                  </Button>
                )}
                {c.status === 'PAUSED' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => resume.mutate(c.id)}
                    disabled={resume.isPending}
                  >
                    Tiếp tục
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => duplicate.mutate(c.id)}
                  title="Nhân bản"
                >
                  <Copy className="h-4 w-4" />
                </Button>
                {(c.status === 'DRAFT' || c.status === 'FAILED' || c.status === 'CANCELLED') && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => {
                      if (window.confirm('Xóa chiến dịch này?')) remove.mutate(c.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                {['RUNNING', 'PAUSED', 'SCHEDULED', 'PLANNING'].includes(c.status) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => cancel.mutate(c.id)}
                  >
                    Hủy
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Tạo chiến dịch hàng loạt</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Tên chiến dịch</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Kênh</Label>
              <Select
                value={form.channel}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    channel: v as MessageChannel,
                    channelConnectionId: '',
                    messageTemplateId: '',
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNEL_OPTIONS.filter((c) => c.value === 'MESSENGER' || c.value === 'ZALO').map(
                    (c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Kết nối kênh</Label>
              <Select
                value={form.channelConnectionId || '__none__'}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, channelConnectionId: v === '__none__' ? '' : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn kết nối" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Chưa chọn —</SelectItem>
                  {messengerConns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.displayName || c.accountRef} ({c.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Mẫu tin</Label>
              <Select
                value={form.messageTemplateId || '__none__'}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, messageTemplateId: v === '__none__' ? '' : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn mẫu" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Chưa chọn —</SelectItem>
                  {templateItems.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {pendingSegment?.identityIds?.length ? (
              <p className="text-xs text-muted-foreground">
                Đã chọn {pendingSegment.identityIds.length} liên hệ từ tệp khách hàng.
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Hủy
            </Button>
            <Button onClick={() => void submitCreate()} disabled={create.isPending}>
              {create.isPending ? 'Đang tạo…' : 'Tạo nháp'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CampaignDashboardDialog
        open={!!dashboardId}
        onOpenChange={(o) => !o && setDashboardId(null)}
        campaignId={dashboardId}
      />
    </div>
  );
}

export default BulkCampaignPanel;
